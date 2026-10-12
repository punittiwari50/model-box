import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ollamaConnector } from '@/connectors/ollama-connector.js';
import { logger } from '@/core/logger.js';

export interface JobRequirementPayload {
  jobId?: string;
  jobTitle: string;
  companyName: string;
  location?: string;
  linkedinUrl: string;
  officialApplyUrl?: string;
  firstListedAt?: string;
  rawDescription: string;
  workplaceType?: string;
  experienceLevel?: string;
  salaryInsights?: string;
}

export interface StructuredJobDetails {
  summary: string;
  techStack: string[];
  responsibilities: string[];
  qualifications: string[];
  workplaceType: string;
  experienceLevel: string;
  salaryInsights?: string;
}

export interface JobRequirementResult {
  jobId: string;
  jobTitle: string;
  companyName: string;
  linkedinUrl: string;
  officialApplyUrl?: string;
  firstListedAt?: string;
  markdownPath: string;
  databaseSaved: boolean;
  structuredDetails: StructuredJobDetails;
}

export class JobRequirementPipeline {
  private pgPool: pg.Pool;
  private jobsDir: string;

  constructor() {
    this.jobsDir = path.resolve(process.cwd(), 'workflows/job_requirements');
    if (!fs.existsSync(this.jobsDir)) {
      fs.mkdirSync(this.jobsDir, { recursive: true });
    }

    this.pgPool = new pg.Pool({
      host: process.env.POSTGRES_CONTAINER_NAME || process.env.POSTGRES_HOST || 'model-connectors-postgres',
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres_vault_pw_2026_sec',
      database: process.env.POSTGRES_DB || 'model_connectors',
      connectionTimeoutMillis: 5000,
    });
  }

  async processAndPersist(payload: JobRequirementPayload): Promise<JobRequirementResult> {
    const rawJobId = payload.jobId || this.extractJobIdFromUrl(payload.linkedinUrl) || `job-${Date.now()}`;
    const jobId = rawJobId.replace(/[^a-zA-Z0-9_-]/g, '');

    logger.info(`[JobPipeline] Analyzing requirements with Ollama for: "${payload.jobTitle}" at ${payload.companyName}`);

    // Step 1: Use Ollama to structure the job requirements
    const structured = await this.structureWithOllama(payload);

    // Step 2: Build Markdown file
    const markdownContent = this.formatMarkdown(payload, jobId, structured);
    const safeCompany = payload.companyName.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
    const safeTitle = payload.jobTitle.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
    const fileName = `${safeCompany}_${safeTitle}_${jobId}.md`;
    const markdownPath = path.join(this.jobsDir, fileName);

    fs.writeFileSync(markdownPath, markdownContent, 'utf-8');
    logger.info(`[JobPipeline] Saved structured Markdown requirement to: ${markdownPath}`);

    // Step 3: Save to PostgreSQL
    let databaseSaved = false;
    try {
      databaseSaved = await this.persistToDatabase(payload, jobId, structured, markdownContent, markdownPath);
      logger.info(`[JobPipeline] Successfully persisted job requirement ${jobId} to PostgreSQL MB_JOB_REQUIREMENTS`);
    } catch (dbErr) {
      logger.error(`[JobPipeline] Failed to save to PostgreSQL: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
    }

    return {
      jobId,
      jobTitle: payload.jobTitle,
      companyName: payload.companyName,
      linkedinUrl: payload.linkedinUrl,
      officialApplyUrl: payload.officialApplyUrl,
      firstListedAt: payload.firstListedAt,
      markdownPath,
      databaseSaved,
      structuredDetails: structured,
    };
  }

  async listJobRequirements(): Promise<Array<Record<string, unknown>>> {
    const client = await this.pgPool.connect();
    try {
      const res = await client.query(
        `SELECT job_id, job_title, company_name, location, workplace_type, experience_level,
                linkedin_url, official_apply_url, first_listed_at, salary_insights,
                tech_stack_json, markdown_file_path, extracted_at
         FROM mb_job_requirements
         ORDER BY first_listed_at DESC NULLS LAST, extracted_at DESC`
      );
      return res.rows;
    } catch (err) {
      logger.error(`[JobPipeline] Error querying mb_job_requirements: ${err instanceof Error ? err.message : String(err)}`);
      const files = fs.readdirSync(this.jobsDir).filter((f) => f.endsWith('.md'));
      return files.map((fileName) => ({
        fileName,
        path: path.join(this.jobsDir, fileName),
      }));
    } finally {
      client.release();
    }
  }

  private async structureWithOllama(payload: JobRequirementPayload): Promise<StructuredJobDetails> {
    const prompt = [
      'You are an expert technical recruiter and job requirement analyst.',
      `Analyze the following job description for "${payload.jobTitle}" at "${payload.companyName}".`,
      '',
      'JOB DESCRIPTION:',
      payload.rawDescription.substring(0, 6000),
      '',
      'Respond ONLY with a valid JSON object matching this schema:',
      '{',
      '  "summary": "2-3 sentence overview of the role and team mission",',
      '  "techStack": ["languages", "frameworks", "tools", "cloud platforms mentioned"],',
      '  "responsibilities": ["bullet points of daily core responsibilities"],',
      '  "qualifications": ["must-have education, experience, skills, certifications"],',
      '  "workplaceType": "Remote | Hybrid | On-site",',
      '  "experienceLevel": "Entry | Mid-Senior | Director | Executive"',
      '}',
      'Output ONLY the JSON object with NO markdown code fences or commentary.',
    ].join('\n');

    try {
      const response = await ollamaConnector.generate({
        prompt,
        options: { temperature: 0.1 },
      });

      const cleanJson = response.response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          summary: parsed.summary || `${payload.jobTitle} position at ${payload.companyName}`,
          techStack: Array.isArray(parsed.techStack) ? parsed.techStack : [],
          responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
          qualifications: Array.isArray(parsed.qualifications) ? parsed.qualifications : [],
          workplaceType: parsed.workplaceType || payload.workplaceType || 'Remote',
          experienceLevel: parsed.experienceLevel || payload.experienceLevel || 'Mid-Senior level',
          salaryInsights: payload.salaryInsights || 'Not Specified',
        };
      }
    } catch (err) {
      logger.warn(`[JobPipeline] Ollama analysis fallback due to error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      summary: `${payload.jobTitle} opportunity at ${payload.companyName}.`,
      techStack: ['Software Engineering', 'Cloud', 'Architecture'],
      responsibilities: ['Architect, design, and deliver software solutions.'],
      qualifications: ['Bachelor degree or equivalent technical experience.'],
      workplaceType: payload.workplaceType || 'Remote',
      experienceLevel: payload.experienceLevel || 'Mid-Senior level',
      salaryInsights: payload.salaryInsights || 'Not Specified',
    };
  }

  private formatMarkdown(
    payload: JobRequirementPayload,
    jobId: string,
    structured: StructuredJobDetails
  ): string {
    const timestamp = new Date().toISOString();
    const applyBlock = payload.officialApplyUrl
      ? `> 🚀 **Official Career Site Apply URL:** [Apply on Company Portal](${payload.officialApplyUrl})  \n`
      : '';
    const listedBlock = payload.firstListedAt
      ? `⏱️ **First Listed On Portal:** ${payload.firstListedAt} | `
      : '';

    return [
      '---',
      `job_id: "${jobId}"`,
      `job_title: "${payload.jobTitle.replace(/"/g, '\\"')}"`,
      `company_name: "${payload.companyName.replace(/"/g, '\\"')}"`,
      `location: "${(payload.location || 'Remote').replace(/"/g, '\\"')}"`,
      `workplace_type: "${structured.workplaceType}"`,
      `experience_level: "${structured.experienceLevel}"`,
      `linkedin_url: "${payload.linkedinUrl}"`,
      payload.officialApplyUrl ? `official_apply_url: "${payload.officialApplyUrl}"` : '',
      payload.firstListedAt ? `first_listed_at: "${payload.firstListedAt}"` : '',
      `extracted_at: "${timestamp}"`,
      '---',
      '',
      `# ${payload.jobTitle} - ${payload.companyName}`,
      '',
      `> 🔗 **Original LinkedIn Posting:** [View Job on LinkedIn](${payload.linkedinUrl})  `,
      applyBlock,
      `> 📍 **Location:** ${payload.location || 'Not Specified'} | 🏢 **Workplace Type:** ${structured.workplaceType} | ${listedBlock}⏱️ **Extracted:** ${timestamp}`,
      '',
      '## 📋 Executive Role Summary',
      structured.summary,
      '',
      '## 🛠️ Required Tech Stack & Core Competencies',
      structured.techStack.length > 0
        ? structured.techStack.map((tech) => `- \`${tech}\``).join('\n')
        : '- Tech stack not explicitly parsed.',
      '',
      '## 🎯 Key Responsibilities',
      structured.responsibilities.length > 0
        ? structured.responsibilities.map((resp) => `- ${resp}`).join('\n')
        : '- Core responsibilities detailed in description.',
      '',
      '## 🎓 Required Qualifications & Experience',
      structured.qualifications.length > 0
        ? structured.qualifications.map((q) => `- ${q}`).join('\n')
        : '- Qualifications detailed in description.',
      '',
      '## 📄 Complete Raw Job Description',
      '```text',
      payload.rawDescription.trim(),
      '```',
      '',
    ].join('\n');
  }

  private async persistToDatabase(
    payload: JobRequirementPayload,
    jobId: string,
    structured: StructuredJobDetails,
    markdownContent: string,
    markdownPath: string
  ): Promise<boolean> {
    const client = await this.pgPool.connect();
    try {
      const query = `
        INSERT INTO MB_JOB_REQUIREMENTS (
          JOB_ID,
          JOB_TITLE,
          COMPANY_NAME,
          LOCATION,
          LINKEDIN_URL,
          OFFICIAL_APPLY_URL,
          FIRST_LISTED_AT,
          WORKPLACE_TYPE,
          EXPERIENCE_LEVEL,
          EMPLOYMENT_TYPE,
          RAW_DESCRIPTION,
          STRUCTURED_REQUIREMENTS_MD,
          TECH_STACK_JSON,
          KEY_RESPONSIBILITIES_JSON,
          QUALIFICATIONS_JSON,
          SALARY_INSIGHTS,
          MARKDOWN_FILE_PATH,
          EXTRACTED_AT,
          UPDATED_AT,
          METADATA_JSON
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $18)
        ON CONFLICT (JOB_ID) DO UPDATE SET
          JOB_TITLE = EXCLUDED.JOB_TITLE,
          COMPANY_NAME = EXCLUDED.COMPANY_NAME,
          LOCATION = EXCLUDED.LOCATION,
          LINKEDIN_URL = EXCLUDED.LINKEDIN_URL,
          OFFICIAL_APPLY_URL = COALESCE(EXCLUDED.OFFICIAL_APPLY_URL, MB_JOB_REQUIREMENTS.OFFICIAL_APPLY_URL),
          FIRST_LISTED_AT = COALESCE(EXCLUDED.FIRST_LISTED_AT, MB_JOB_REQUIREMENTS.FIRST_LISTED_AT),
          WORKPLACE_TYPE = EXCLUDED.WORKPLACE_TYPE,
          EXPERIENCE_LEVEL = EXCLUDED.EXPERIENCE_LEVEL,
          RAW_DESCRIPTION = EXCLUDED.RAW_DESCRIPTION,
          STRUCTURED_REQUIREMENTS_MD = EXCLUDED.STRUCTURED_REQUIREMENTS_MD,
          TECH_STACK_JSON = EXCLUDED.TECH_STACK_JSON,
          KEY_RESPONSIBILITIES_JSON = EXCLUDED.KEY_RESPONSIBILITIES_JSON,
          QUALIFICATIONS_JSON = EXCLUDED.QUALIFICATIONS_JSON,
          MARKDOWN_FILE_PATH = EXCLUDED.MARKDOWN_FILE_PATH,
          UPDATED_AT = CURRENT_TIMESTAMP;
      `;

      const firstListedDate = payload.firstListedAt ? new Date(payload.firstListedAt) : null;

      await client.query(query, [
        jobId,
        payload.jobTitle,
        payload.companyName,
        payload.location || 'Remote',
        payload.linkedinUrl,
        payload.officialApplyUrl || null,
        firstListedDate,
        structured.workplaceType,
        structured.experienceLevel,
        payload.experienceLevel || 'Full-time',
        payload.rawDescription,
        markdownContent,
        JSON.stringify(structured.techStack),
        JSON.stringify(structured.responsibilities),
        JSON.stringify(structured.qualifications),
        payload.salaryInsights || 'Not Specified',
        markdownPath,
        JSON.stringify({
          source: 'linkedin_playwright_mcp',
          extractedBy: 'ollama_llama3.2',
          officialApplyUrl: payload.officialApplyUrl || null,
          firstListedAt: payload.firstListedAt || null,
        }),
      ]);

      return true;
    } finally {
      client.release();
    }
  }

  private extractJobIdFromUrl(url?: string): string | null {
    if (!url) return null;
    const match = url.match(/(?:currentJobId=|\/jobs\/view\/)(\d+)/) || url.match(/(\d{8,12})/);
    return match ? match[1] : null;
  }
}

export const jobRequirementPipeline = new JobRequirementPipeline();
