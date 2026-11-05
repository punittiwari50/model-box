/**
 * Polymorphic Credential Extractor Strategies for Model Box Platforms.
 * Conforms to:
 * - STD-COD-001 (@/* imports)
 * - STD-COD-005 (Strategy Pattern, Polymorphic Dispatch, DI)
 * - STD-COD-007 (Functions <= 20 lines, SLAP)
 */

import type {
  ICredentialExtractorStrategy,
  ExtractedAccountCredential,
} from "@/vcs/vcs.types.js";

export class GeminiCliJsonCredentialExtractor implements ICredentialExtractorStrategy {
  public readonly provider = "google";

  public supports(filePath: string, content: string): boolean {
    const isGoogleTarget =
      filePath.includes("gemini") ||
      filePath.includes("antigravity") ||
      filePath.includes("google") ||
      content.includes("googleapis.com") ||
      content.includes("google.com");
    return isGoogleTarget && this.isValidJson(content);
  }

  public extract(filePath: string, content: string, defaultModelId: string): ExtractedAccountCredential | undefined {
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      const accessToken = this.resolveToken(data);
      if (!accessToken) return undefined;

      const userEmail = this.resolveEmail(data, filePath);
      const modelId = defaultModelId || "gemini-3.8-flash";
      const accountName = `Google Gemini (${userEmail})`;

      return {
        userEmail,
        accountName,
        authType: "cli_oauth",
        credentialValue: accessToken,
        configJson: content,
        rawData: data,
        modelId,
      };
    } catch {
      return undefined;
    }
  }

  private resolveToken(data: Record<string, unknown>): string | undefined {
    const token =
      data.access_token ||
      data.accessToken ||
      data.token ||
      data.credentialValue ||
      (typeof data.token === "object" && (data.token as Record<string, unknown>)?.access_token);
    return typeof token === "string" ? token.trim() : undefined;
  }

  private resolveEmail(data: Record<string, unknown>, filePath: string): string {
    const emailCandidate =
      data.email ||
      data.userEmail ||
      data.user ||
      data.principal ||
      data.client_email;
    if (typeof emailCandidate === "string" && emailCandidate.includes("@")) {
      return emailCandidate.trim();
    }
    const match = filePath.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return match ? match[1] : "personal.developer@gmail.com";
  }

  private isValidJson(content: string): boolean {
    try {
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  }
}

export class ClaudeCredentialExtractor implements ICredentialExtractorStrategy {
  public readonly provider = "anthropic";

  public supports(filePath: string, content: string): boolean {
    const isClaude = filePath.includes("claude") || content.includes("anthropic");
    return isClaude && this.isValidJson(content);
  }

  public extract(_filePath: string, content: string, defaultModelId: string): ExtractedAccountCredential | undefined {
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      const token = (data.apiKey || data.access_token || data.token) as string | undefined;
      if (!token) return undefined;

      const email = (data.email || "developer@anthropic.user") as string;
      return {
        userEmail: email,
        accountName: `Anthropic Claude (${email})`,
        authType: "cli_oauth",
        credentialValue: token,
        configJson: content,
        rawData: data,
        modelId: defaultModelId || "claude-3-7-sonnet",
      };
    } catch {
      return undefined;
    }
  }

  private isValidJson(content: string): boolean {
    try {
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  }
}

export class ChatGptCredentialExtractor implements ICredentialExtractorStrategy {
  public readonly provider = "openai";

  public supports(filePath: string, content: string): boolean {
    const isOpenAi =
      filePath.includes("chatgpt") ||
      filePath.includes("gpt") ||
      content.includes("openai");
    return isOpenAi && this.isValidJson(content);
  }

  public extract(_filePath: string, content: string, defaultModelId: string): ExtractedAccountCredential | undefined {
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      const token = (data.apiKey || data.access_token || data.token) as string | undefined;
      if (!token) return undefined;

      const email = (data.email || "developer@openai.user") as string;
      return {
        userEmail: email,
        accountName: `OpenAI ChatGPT (${email})`,
        authType: "cli_oauth",
        credentialValue: token,
        configJson: content,
        rawData: data,
        modelId: defaultModelId || "gpt-4o",
      };
    } catch {
      return undefined;
    }
  }

  private isValidJson(content: string): boolean {
    try {
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  }
}

export class GenericJsonOAuthExtractor implements ICredentialExtractorStrategy {
  public readonly provider = "generic";

  public supports(_filePath: string, content: string): boolean {
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      return Boolean(data.access_token || data.accessToken || data.token || data.apiKey);
    } catch {
      return false;
    }
  }

  public extract(_filePath: string, content: string, defaultModelId: string): ExtractedAccountCredential | undefined {
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      const token = (data.access_token || data.accessToken || data.token || data.apiKey) as string | undefined;
      if (!token) return undefined;

      const email = (data.email || data.userEmail || "user@modelbox.local") as string;
      return {
        userEmail: email,
        accountName: `Account (${email})`,
        authType: "cli_oauth",
        credentialValue: token,
        configJson: content,
        rawData: data,
        modelId: defaultModelId,
      };
    } catch {
      return undefined;
    }
  }
}

export class CredentialExtractorRegistry {
  private readonly strategies: ICredentialExtractorStrategy[] = [];

  constructor() {
    this.strategies.push(
      new GeminiCliJsonCredentialExtractor(),
      new ClaudeCredentialExtractor(),
      new ChatGptCredentialExtractor(),
      new GenericJsonOAuthExtractor(),
    );
  }

  public registerStrategy(strategy: ICredentialExtractorStrategy): void {
    this.strategies.unshift(strategy);
  }

  public extractCredential(
    filePath: string,
    content: string,
    defaultModelId: string,
  ): ExtractedAccountCredential | undefined {
    for (const strategy of this.strategies) {
      if (strategy.supports(filePath, content)) {
        const extracted = strategy.extract(filePath, content, defaultModelId);
        if (extracted) return extracted;
      }
    }
    return undefined;
  }
}

export const credentialExtractorRegistry = new CredentialExtractorRegistry();

