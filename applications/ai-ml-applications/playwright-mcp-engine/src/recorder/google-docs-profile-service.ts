import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { logger } from '@/core/logger.js';

export interface ApplicantProfile {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  linkedinUrl: string;
  githubUrl?: string;
  portfolioUrl?: string;
  currentTitle: string;
  currentCompany?: string;
  yearsOfExperience: string | number;
  highestDegree: string;
  skills: string[];
  summary?: string;
  screeningAnswers: {
    workAuthorization?: string; // "Yes" / "No"
    requireSponsorship?: string; // "No" / "Yes"
    noticePeriodDays?: string | number;
    currentSalary?: string;
    expectedSalary?: string;
    willingToRelocate?: string; // "Yes" / "No"
  };
  customFields: Record<string, string>;
  rawSource?: string;
}

export class GoogleDocsProfileService {
  private profileCachePath: string;

  constructor() {
    this.profileCachePath = path.resolve(process.cwd(), 'workflows/applicant_profile.json');
  }

  /**
   * Convert any Google Sheet URL to its direct CSV export URL.
   */
  buildExportCsvUrl(inputUrl: string, gid: string = '0'): string {
    const sheetIdMatch = inputUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!sheetIdMatch || !sheetIdMatch[1]) {
      // If it's already an export link or raw ID
      if (inputUrl.includes('export?format=csv')) return inputUrl;
      if (/^[a-zA-Z0-9_-]{20,}$/.test(inputUrl)) {
        return `https://docs.google.com/spreadsheets/d/${inputUrl}/export?format=csv&gid=${gid}`;
      }
      return inputUrl;
    }

    const sheetId = sheetIdMatch[1];
    const gidMatch = inputUrl.match(/[#&?]gid=([0-9]+)/);
    const resolvedGid = gidMatch ? gidMatch[1] : gid;

    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${resolvedGid}`;
  }

  /**
   * Convert any Google Doc URL to its direct TXT export URL.
   */
  buildExportDocTxtUrl(inputUrl: string): string {
    const docIdMatch = inputUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (!docIdMatch || !docIdMatch[1]) {
      return inputUrl;
    }
    return `https://docs.google.com/document/d/${docIdMatch[1]}/export?format=txt`;
  }

  /**
   * Fetch and parse profile data from a Google Sheet.
   */
  async fetchProfileFromGoogleSheet(urlOrId: string, gid: string = '0'): Promise<ApplicantProfile> {
    const exportUrl = this.buildExportCsvUrl(urlOrId, gid);
    logger.info(`[GoogleDocs] Fetching CSV data from: ${exportUrl}`);

    try {
      const response = await axios.get<string>(exportUrl, {
        timeout: 15000,
        headers: { Accept: 'text/csv,text/plain,*/*' },
      });

      const csvContent = response.data;
      const profile = this.parseCsvToProfile(csvContent, exportUrl);
      this.cacheProfileLocally(profile);
      return profile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[GoogleDocs] Failed to fetch Google Sheet CSV: ${msg}`);
      throw new Error(
        `Failed to fetch Google Sheet profile from ${exportUrl}. Ensure document sharing is set to "Anyone with the link can view", or use the local profile cache. Error: ${msg}`
      );
    }
  }

  /**
   * Fetch raw resume text from a Google Doc document.
   */
  async fetchResumeTextFromGoogleDoc(docUrl: string): Promise<string> {
    const exportUrl = this.buildExportDocTxtUrl(docUrl);
    logger.info(`[GoogleDocs] Fetching Doc text from: ${exportUrl}`);

    try {
      const response = await axios.get<string>(exportUrl, {
        timeout: 15000,
        headers: { Accept: 'text/plain,*/*' },
      });
      return response.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch Google Doc text: ${msg}. Verify public or shared link permissions.`);
    }
  }

  /**
   * Parse CSV content into a normalized ApplicantProfile.
   * Handles both Table format (Row 1: Headers, Row 2: Data)
   * and Key-Value format (Col A: Key, Col B: Value).
   */
  parseCsvToProfile(csvText: string, sourceUrl?: string): ApplicantProfile {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      throw new Error('CSV content is empty.');
    }

    const rawDict: Record<string, string> = {};

    // Check if format is Key-Value (e.g. 2 columns: Field, Value)
    const firstLineCols = this.parseCsvLine(lines[0]);
    const isKeyValue =
      firstLineCols.length === 2 ||
      lines.every((l) => {
        const parts = this.parseCsvLine(l);
        return parts.length <= 2;
      });

    if (isKeyValue) {
      for (const line of lines) {
        const [k, v] = this.parseCsvLine(line);
        if (k && v !== undefined) {
          rawDict[this.normalizeKey(k)] = v.trim();
        }
      }
    } else {
      // Tabular format: Headers in line 0, data in line 1
      const headers = this.parseCsvLine(lines[0]).map((h) => this.normalizeKey(h));
      const dataRow = lines.length > 1 ? this.parseCsvLine(lines[1]) : [];

      headers.forEach((header, idx) => {
        if (header && dataRow[idx] !== undefined) {
          rawDict[header] = dataRow[idx].trim();
        }
      });
    }

    return this.buildProfileFromDict(rawDict, sourceUrl);
  }

  /**
   * Load the active cached applicant profile from disk.
   */
  loadCachedProfile(): ApplicantProfile | null {
    if (!fs.existsSync(this.profileCachePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(this.profileCachePath, 'utf-8');
      return JSON.parse(content) as ApplicantProfile;
    } catch {
      return null;
    }
  }

  /**
   * Cache profile locally in workflows directory.
   */
  cacheProfileLocally(profile: ApplicantProfile): void {
    try {
      const dir = path.dirname(this.profileCachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.profileCachePath, JSON.stringify(profile, null, 2), 'utf-8');
      logger.info(`[GoogleDocs] Cached applicant profile to ${this.profileCachePath}`);
    } catch (err) {
      logger.warn(`[GoogleDocs] Failed to cache profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private buildProfileFromDict(dict: Record<string, string>, sourceUrl?: string): ApplicantProfile {
    const getVal = (...keys: string[]): string => {
      for (const k of keys) {
        const norm = this.normalizeKey(k);
        if (dict[norm]) return dict[norm];
      }
      return '';
    };

    let firstName = getVal('first_name', 'firstname', 'given_name', 'first');
    let lastName = getVal('last_name', 'lastname', 'surname', 'family_name', 'last');
    let fullName = getVal('full_name', 'fullname', 'name', 'applicant_name');

    if (!fullName && (firstName || lastName)) {
      fullName = `${firstName} ${lastName}`.trim();
    } else if (fullName && (!firstName || !lastName)) {
      const parts = fullName.split(' ');
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }

    const email = getVal('email', 'email_address', 'e-mail', 'mail');
    const phone = getVal('phone', 'phone_number', 'mobile', 'cell', 'telephone', 'contact_number');
    const linkedinUrl = getVal('linkedin', 'linkedin_url', 'linkedin_profile', 'linkedin_link');
    const githubUrl = getVal('github', 'github_url', 'github_profile');
    const portfolioUrl = getVal('portfolio', 'website', 'portfolio_url', 'personal_website');

    const location = getVal('location', 'address', 'current_location', 'city_state');
    const city = getVal('city', 'town');
    const state = getVal('state', 'province', 'region');
    const postalCode = getVal('postal_code', 'zip', 'zip_code', 'pin_code');
    const country = getVal('country', 'nation') || 'India';

    const currentTitle = getVal('current_title', 'title', 'role', 'designation', 'position');
    const currentCompany = getVal('current_company', 'company', 'organization', 'employer');
    const yearsOfExperience = getVal('years_of_experience', 'experience_years', 'total_experience', 'experience');
    const highestDegree = getVal('highest_degree', 'degree', 'education', 'qualification');

    const skillsRaw = getVal('skills', 'core_skills', 'technologies', 'tech_stack');
    const skills = skillsRaw
      ? skillsRaw.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length > 0)
      : [];

    const summary = getVal('summary', 'professional_summary', 'about', 'bio', 'headline');

    const screeningAnswers = {
      workAuthorization: getVal('work_authorization', 'authorized_to_work', 'legally_authorized', 'work_auth') || 'Yes',
      requireSponsorship: getVal('require_sponsorship', 'sponsorship_required', 'visa_sponsorship', 'future_sponsorship') || 'No',
      noticePeriodDays: getVal('notice_period', 'notice_period_days', 'notice_days', 'notice') || '30',
      currentSalary: getVal('current_salary', 'current_ctc', 'present_ctc'),
      expectedSalary: getVal('expected_salary', 'expected_ctc', 'desired_salary'),
      willingToRelocate: getVal('willing_to_relocate', 'relocation', 'open_to_relocate') || 'Yes',
    };

    return {
      firstName,
      lastName,
      fullName,
      email,
      phone,
      location,
      city,
      state,
      postalCode,
      country,
      linkedinUrl,
      githubUrl,
      portfolioUrl,
      currentTitle,
      currentCompany,
      yearsOfExperience,
      highestDegree,
      skills,
      summary,
      screeningAnswers,
      customFields: dict,
      rawSource: sourceUrl,
    };
  }

  private normalizeKey(key: string): string {
    return key
      .toLowerCase()
      .trim()
      .replace(/[\s\t\-_./\\()#:]+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/^_+|_+$/g, '');
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
}

export const googleDocsProfileService = new GoogleDocsProfileService();
