import { GOOGLE_XRAY_CONSTANTS } from '@/constants/index.js';
import type { XRayQueryParams } from '@/xray/types.js';

// ============================================================================
// Google X-Ray Query Builder (Builder Pattern, SOLID: SRP, Zero branching)
// ============================================================================

export class GoogleXRayQueryBuilder {
  private tokens: string[] = [];

  site(domain: string): this {
    const hasDomain = Boolean(domain);
    const domainActions: Record<string, () => void> = {
      true: () => this.tokens.push([GOOGLE_XRAY_CONSTANTS.OPERATORS.SITE, domain].join('')),
      false: () => {},
    };
    domainActions[String(hasDomain)]();
    return this;
  }

  inTitle(term: string): this {
    const hasTerm = Boolean(term);
    const termActions: Record<string, () => void> = {
      true: () => this.tokens.push([GOOGLE_XRAY_CONSTANTS.OPERATORS.INTITLE, this.quote(term)].join('')),
      false: () => {},
    };
    termActions[String(hasTerm)]();
    return this;
  }

  inUrl(term: string): this {
    const hasTerm = Boolean(term);
    const termActions: Record<string, () => void> = {
      true: () => this.tokens.push([GOOGLE_XRAY_CONSTANTS.OPERATORS.INURL, term].join('')),
      false: () => {},
    };
    termActions[String(hasTerm)]();
    return this;
  }

  fileType(ext: string): this {
    const hasExt = Boolean(ext);
    const extActions: Record<string, () => void> = {
      true: () => this.tokens.push([GOOGLE_XRAY_CONSTANTS.OPERATORS.FILETYPE, ext].join('')),
      false: () => {},
    };
    extActions[String(hasExt)]();
    return this;
  }

  exactPhrase(phrase: string): this {
    const hasPhrase = Boolean(phrase);
    const phraseActions: Record<string, () => void> = {
      true: () => this.tokens.push(this.quote(phrase)),
      false: () => {},
    };
    phraseActions[String(hasPhrase)]();
    return this;
  }

  mustIncludeAll(items?: string[]): this {
    const hasItems = Boolean(items && items.length > 0);
    const itemActions: Record<string, () => void> = {
      true: () => {
        items!.forEach((item) => this.exactPhrase(item));
      },
      false: () => {},
    };
    itemActions[String(hasItems)]();
    return this;
  }

  anyOf(options?: string[]): this {
    const hasOptions = Boolean(options && options.length > 0);
    const optionActions: Record<string, () => void> = {
      true: () => {
        const quotedOptions = options!.map((opt) => this.quote(opt));
        const joinedOptions = quotedOptions.join([' ', GOOGLE_XRAY_CONSTANTS.OPERATORS.OR, ' '].join(''));
        this.tokens.push(['(', joinedOptions, ')'].join(''));
      },
      false: () => {},
    };
    optionActions[String(hasOptions)]();
    return this;
  }

  exclude(negativeTerms?: string[]): this {
    const hasTerms = Boolean(negativeTerms && negativeTerms.length > 0);
    const termActions: Record<string, () => void> = {
      true: () => {
        negativeTerms!.forEach((term) => {
          this.tokens.push([GOOGLE_XRAY_CONSTANTS.OPERATORS.NOT, this.quote(term)].join(''));
        });
      },
      false: () => {},
    };
    termActions[String(hasTerms)]();
    return this;
  }

  rawToken(raw: string): this {
    const hasRaw = Boolean(raw);
    const rawActions: Record<string, () => void> = {
      true: () => this.tokens.push(raw),
      false: () => {},
    };
    rawActions[String(hasRaw)]();
    return this;
  }

  private quote(val: string): string {
    const trimmed = val.trim();
    const isAlreadyQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
    const quoteActions: Record<string, () => string> = {
      true: () => trimmed,
      false: () => [GOOGLE_XRAY_CONSTANTS.OPERATORS.QUOTE, trimmed, GOOGLE_XRAY_CONSTANTS.OPERATORS.QUOTE].join(''),
    };
    return quoteActions[String(isAlreadyQuoted)]();
  }

  build(): string {
    return this.tokens.join(' ');
  }

  toGoogleSearchUrl(): URL {
    const searchUrl = new URL(GOOGLE_XRAY_CONSTANTS.SEARCH_BASE_URL);
    searchUrl.searchParams.set('q', this.build());
    return searchUrl;
  }

  static fromParams(params: XRayQueryParams): GoogleXRayQueryBuilder {
    const builder = new GoogleXRayQueryBuilder();

    const hasCustomRaw = Boolean(params.customRawQuery);
    const rawActions: Record<string, () => void> = {
      true: () => {
        builder.rawToken(params.customRawQuery!);
      },
      false: () => {},
    };
    rawActions[String(hasCustomRaw)]();

    const hasCustomSite = Boolean(params.customSite);
    const siteActions: Record<string, () => void> = {
      true: () => {
        builder.site(params.customSite!);
      },
      false: () => {},
    };
    siteActions[String(hasCustomSite)]();

    const hasRole = Boolean(params.role);
    const roleActions: Record<string, () => void> = {
      true: () => {
        builder.exactPhrase(params.role!);
      },
      false: () => {},
    };
    roleActions[String(hasRole)]();

    const hasSeniority = Boolean(params.seniority);
    const seniorityActions: Record<string, () => void> = {
      true: () => {
        builder.exactPhrase(params.seniority!);
      },
      false: () => {},
    };
    seniorityActions[String(hasSeniority)]();

    const hasCompany = Boolean(params.company);
    const companyActions: Record<string, () => void> = {
      true: () => {
        builder.exactPhrase(params.company!);
      },
      false: () => {},
    };
    companyActions[String(hasCompany)]();

    const hasLocation = Boolean(params.location);
    const locationActions: Record<string, () => void> = {
      true: () => {
        builder.exactPhrase(params.location!);
      },
      false: () => {},
    };
    locationActions[String(hasLocation)]();

    const hasFileType = Boolean(params.fileType);
    const fileTypeActions: Record<string, () => void> = {
      true: () => {
        builder.fileType(params.fileType!);
      },
      false: () => {},
    };
    fileTypeActions[String(hasFileType)]();

    builder.mustIncludeAll(params.mustInclude);
    builder.mustIncludeAll(params.skills);
    builder.anyOf(params.anyOf);
    builder.exclude(params.exclude);

    return builder;
  }
}
