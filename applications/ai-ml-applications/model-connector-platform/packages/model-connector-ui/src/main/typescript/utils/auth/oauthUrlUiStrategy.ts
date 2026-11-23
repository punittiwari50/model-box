export interface IOAuthUrlUiStrategy {
  readonly providerId: string;
  supports(modelId: string, providerId?: string): boolean;
  isValidOAuthUrl(url: string): boolean;
  normalizeLaunchUrl(url: string): string;
}

export class AntigravityGoogleOAuthUiStrategy implements IOAuthUrlUiStrategy {
  public readonly providerId = "google";

  public supports(modelId: string, providerId?: string): boolean {
    const s = `${modelId} ${providerId || ""}`.toLowerCase();
    return s.includes("gemini") || s.includes("google") || s.includes("antigravity");
  }

  public isValidOAuthUrl(url: string): boolean {
    if (!url) return false;
    return (
      url.includes("accounts.google.com") ||
      url.includes("antigravity.google") ||
      url.includes("localhost:8085") ||
      url.includes("127.0.0.1:8085")
    );
  }

  public normalizeLaunchUrl(url: string): string {
    return url;
  }
}

export class ChatGptOAuthUiStrategy implements IOAuthUrlUiStrategy {
  public readonly providerId = "openai";

  public supports(modelId: string, providerId?: string): boolean {
    const s = `${modelId} ${providerId || ""}`.toLowerCase();
    return s.includes("gpt") || s.includes("chatgpt") || s.includes("openai") || s.includes("codex");
  }

  public isValidOAuthUrl(url: string): boolean {
    if (!url) return false;
    return (
      (url.includes("openai.com") ||
        url.includes("accounts.google.com") ||
        url.includes("localhost:8085") ||
        url.includes("127.0.0.1:8085")) &&
      !url.includes("auth0.openai.com")
    );
  }

  public normalizeLaunchUrl(url: string): string {
    return url;
  }
}

export class ClaudeOAuthUiStrategy implements IOAuthUrlUiStrategy {
  public readonly providerId = "anthropic";

  public supports(modelId: string, providerId?: string): boolean {
    const s = `${modelId} ${providerId || ""}`.toLowerCase();
    return s.includes("claude") || s.includes("anthropic");
  }

  public isValidOAuthUrl(url: string): boolean {
    if (!url) return false;
    return (
      url.includes("anthropic.com") ||
      url.includes("claude.ai") ||
      url.includes("accounts.google.com") ||
      url.includes("localhost:8085") ||
      url.includes("127.0.0.1:8085")
    );
  }

  public normalizeLaunchUrl(url: string): string {
    return url;
  }
}

export class CopilotOAuthUiStrategy implements IOAuthUrlUiStrategy {
  public readonly providerId = "github";

  public supports(modelId: string, providerId?: string): boolean {
    const s = `${modelId} ${providerId || ""}`.toLowerCase();
    return s.includes("copilot") || s.includes("github");
  }

  public isValidOAuthUrl(url: string): boolean {
    if (!url) return false;
    return (
      url.includes("github.com") ||
      url.includes("accounts.google.com") ||
      url.includes("localhost:8085") ||
      url.includes("127.0.0.1:8085")
    );
  }

  public normalizeLaunchUrl(url: string): string {
    return url;
  }
}

export class GenericOAuthUiStrategy implements IOAuthUrlUiStrategy {
  public readonly providerId = "generic";

  public supports(): boolean {
    return true;
  }

  public isValidOAuthUrl(url: string): boolean {
    return Boolean(url && (url.startsWith("http://") || url.startsWith("https://")));
  }

  public normalizeLaunchUrl(url: string): string {
    return url;
  }
}

export class OAuthUrlUiStrategyRegistry {
  private readonly strategies: readonly IOAuthUrlUiStrategy[] = [
    new AntigravityGoogleOAuthUiStrategy(),
    new ChatGptOAuthUiStrategy(),
    new ClaudeOAuthUiStrategy(),
    new CopilotOAuthUiStrategy(),
  ];
  private readonly defaultStrategy = new GenericOAuthUiStrategy();

  public getStrategy(modelId: string, providerId?: string): IOAuthUrlUiStrategy {
    const match = this.strategies.find((s) => s.supports(modelId, providerId));
    return match ?? this.defaultStrategy;
  }
}

export const oauthUrlUiStrategyRegistry = new OAuthUrlUiStrategyRegistry();
