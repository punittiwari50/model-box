import { GOOGLE_XRAY_CONSTANTS } from '@/constants/index.js';
import type { XRayProfileMetadata, XRayQueryParams, XRayTargetPlatform, XRayTemplate } from '@/xray/types.js';
import { GoogleXRayQueryBuilder } from '@/xray/query-builder.js';

// ============================================================================
// Platform Strategy Pattern (SOLID: SRP, OCP, LSP, ISP, DIP)
// ============================================================================

export interface IXRayPlatformStrategy {
  readonly platform: XRayTargetPlatform;
  buildQuery(params: XRayQueryParams): GoogleXRayQueryBuilder;
  extractProfileMetadata(title: string, snippet: string, url: string): XRayProfileMetadata;
}

export class LinkedInPlatformStrategy implements IXRayPlatformStrategy {
  readonly platform = GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.LINKEDIN;

  buildQuery(params: XRayQueryParams): GoogleXRayQueryBuilder {
    const builder = GoogleXRayQueryBuilder.fromParams(params);
    builder.site(GOOGLE_XRAY_CONSTANTS.DOMAINS.LINKEDIN_PROFILE);
    builder.exclude(['dir', 'jobs', 'pulse']);
    return builder;
  }

  extractProfileMetadata(title: string, snippet: string, _url: string): XRayProfileMetadata {
    // Title format: "FirstName LastName - Senior Backend Engineer - Google | LinkedIn"
    const titleParts = title.split(' - ').map((p) => p.trim());
    const name = titleParts[0]?.replace(/\s*\|\s*LinkedIn$/i, '') || '';
    const headline = titleParts[1]?.replace(/\s*\|\s*LinkedIn$/i, '') || '';
    const company = titleParts[2]?.replace(/\s*\|\s*LinkedIn$/i, '') || '';

    return {
      name,
      headline,
      company,
      location: snippet.substring(0, 100),
    };
  }
}

export class GitHubPlatformStrategy implements IXRayPlatformStrategy {
  readonly platform = GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.GITHUB;

  buildQuery(params: XRayQueryParams): GoogleXRayQueryBuilder {
    const builder = GoogleXRayQueryBuilder.fromParams(params);
    builder.site(GOOGLE_XRAY_CONSTANTS.DOMAINS.GITHUB_USER);
    builder.exclude(['stars', 'topics', 'issues', 'pulls']);
    return builder;
  }

  extractProfileMetadata(title: string, snippet: string, url: string): XRayProfileMetadata {
    // Title format: "Username (Name) · GitHub"
    const handle = url.split('/').pop() || '';
    const name = title.split('·')[0]?.trim() || '';

    return {
      handle,
      name,
      headline: snippet.substring(0, 150),
    };
  }
}

export class StackOverflowPlatformStrategy implements IXRayPlatformStrategy {
  readonly platform = GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.STACKOVERFLOW;

  buildQuery(params: XRayQueryParams): GoogleXRayQueryBuilder {
    const builder = GoogleXRayQueryBuilder.fromParams(params);
    builder.site(GOOGLE_XRAY_CONSTANTS.DOMAINS.STACKOVERFLOW_USER);
    return builder;
  }

  extractProfileMetadata(title: string, snippet: string, _url: string): XRayProfileMetadata {
    // Title format: "User FirstName LastName - Stack Overflow"
    const name = title.replace(/\s*-\s*Stack Overflow$/i, '').replace(/^User\s+/i, '');
    return {
      name,
      headline: snippet.substring(0, 150),
    };
  }
}

export class DocumentResumeStrategy implements IXRayPlatformStrategy {
  readonly platform = GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.DOCUMENT;

  buildQuery(params: XRayQueryParams): GoogleXRayQueryBuilder {
    const builder = GoogleXRayQueryBuilder.fromParams(params);
    builder.fileType(params.fileType || 'pdf');
    builder.anyOf(['resume', 'cv', 'curriculum vitae']);
    return builder;
  }

  extractProfileMetadata(title: string, snippet: string, _url: string): XRayProfileMetadata {
    return {
      name: title.split(/[-–|]/)[0]?.trim(),
      headline: snippet.substring(0, 150),
    };
  }
}

export class CustomPlatformStrategy implements IXRayPlatformStrategy {
  readonly platform = GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.CUSTOM;

  buildQuery(params: XRayQueryParams): GoogleXRayQueryBuilder {
    return GoogleXRayQueryBuilder.fromParams(params);
  }

  extractProfileMetadata(title: string, snippet: string, _url: string): XRayProfileMetadata {
    return {
      headline: title,
      location: snippet.substring(0, 100),
    };
  }
}

// ============================================================================
// Strategy Registry & Template Provider
// ============================================================================

export class XRayPlatformRegistry {
  private static readonly STRATEGIES: Readonly<Record<string, IXRayPlatformStrategy>> = {
    [GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.LINKEDIN]: new LinkedInPlatformStrategy(),
    [GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.GITHUB]: new GitHubPlatformStrategy(),
    [GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.STACKOVERFLOW]: new StackOverflowPlatformStrategy(),
    [GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.DOCUMENT]: new DocumentResumeStrategy(),
    [GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.CUSTOM]: new CustomPlatformStrategy(),
  };

  static getStrategy(platform: XRayTargetPlatform): IXRayPlatformStrategy {
    return this.STRATEGIES[platform] ?? new CustomPlatformStrategy();
  }

  static getEnterpriseTemplates(): XRayTemplate[] {
    return [
      {
        id: 'tech-senior-engineer',
        name: 'LinkedIn Senior Distributed Systems Engineers',
        platform: GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.LINKEDIN,
        description: 'Slices LinkedIn for senior backend / distributed systems engineers with Node/TS/Go.',
        sampleParams: {
          platform: 'linkedin',
          role: 'Staff Software Engineer',
          skills: ['Distributed Systems', 'TypeScript', 'Kubernetes'],
          location: 'San Francisco Bay Area',
          exclude: ['Recruiter', 'Talent Acquisition'],
        },
      },
      {
        id: 'github-ai-contributors',
        name: 'GitHub Generative AI & LLM Developers',
        platform: GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.GITHUB,
        description: 'Targets GitHub developer accounts with PyTorch, Transformers, or vLLM expertise.',
        sampleParams: {
          platform: 'github',
          skills: ['vLLM', 'PyTorch', 'Transformers', 'Ollama'],
          location: 'Remote',
        },
      },
      {
        id: 'resume-pdf-sourcing',
        name: 'Public Executive & Engineer PDF Resumes',
        platform: GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.DOCUMENT,
        description: 'Targets public PDF resumes and CVs with specific architectural keywords.',
        sampleParams: {
          platform: 'document',
          fileType: 'pdf',
          skills: ['Principal Architect', 'Cloud Native'],
        },
      },
      {
        id: 'stackoverflow-high-reputation',
        name: 'StackOverflow Top Node.js & Playwright Experts',
        platform: GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS.STACKOVERFLOW,
        description: 'Locates top StackOverflow user profiles active in Playwright and Node automation.',
        sampleParams: {
          platform: 'stackoverflow',
          skills: ['playwright', 'typescript', 'puppeteer'],
        },
      },
    ];
  }
}
