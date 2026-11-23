import { GoogleAuthConstants, OAuthStrategyConstants } from "@/constants/index.js";

export interface OAuthUrlContext {
  readonly modelId?: string;
  readonly providerId?: string;
  readonly defaultRedirectUri?: string;
  readonly defaultClientId?: string;
}

export interface IOAuthProviderUrlStrategy {
  readonly providerId: string;
  supports(modelId: string, provider?: string): boolean;
  isValidOAuthUrl(url: string): boolean;
  normalizeAuthorizationUrl(url: string, context?: OAuthUrlContext): string;
  resolveEffectiveAuthUrl(sessionUrl: string, configUrl: string, context?: OAuthUrlContext): string;
}

abstract class BaseOAuthUrlStrategy implements IOAuthProviderUrlStrategy {
  public abstract readonly providerId: string;
  protected abstract readonly supportedKeywords: readonly string[];
  protected abstract readonly primaryHosts: readonly string[];

  public supports(modelId: string, provider?: string): boolean {
    const target = `${modelId} ${provider || ""}`.toLowerCase();
    return this.supportedKeywords.some((kw) => target.includes(kw));
  }

  public isValidOAuthUrl(url: string): boolean {
    if (!url || typeof url !== "string") return false;
    const clean = url.trim();
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) return false;
    try {
      const parsed = new URL(clean);
      return this.isHostAllowed(parsed.hostname);
    } catch {
      return false;
    }
  }

  protected isHostAllowed(hostname: string): boolean {
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      this.primaryHosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))
    );
  }

  protected parseUrlSafe(url: string): URL | null {
    if (!url || typeof url !== "string") return null;
    const clean = url.trim().replace(/^["']|["']$/g, "").replace(/[\r\n]/g, "");
    try {
      return new URL(clean);
    } catch {
      return null;
    }
  }

  public resolveEffectiveAuthUrl(
    sessionUrl: string,
    configUrl: string,
    context?: OAuthUrlContext,
  ): string {
    if (this.isValidOAuthUrl(sessionUrl)) {
      return this.normalizeAuthorizationUrl(sessionUrl, context);
    }
    return this.normalizeAuthorizationUrl(configUrl, context);
  }

  public abstract normalizeAuthorizationUrl(url: string, context?: OAuthUrlContext): string;
}

/**
 * Antigravity Google OAuth Strategy
 * Strictly isolated for Google Antigravity & Gemini CLI.
 * Preserves antigravity.google callback, code_challenge, and Google OAuth PKCE.
 */
export class AntigravityGoogleOAuthUrlStrategy extends BaseOAuthUrlStrategy {
  public readonly providerId = "google";
  protected readonly supportedKeywords = OAuthStrategyConstants.GOOGLE_KEYWORDS;
  protected readonly primaryHosts = OAuthStrategyConstants.GOOGLE_HOSTS;

  public normalizeAuthorizationUrl(url: string, _context?: OAuthUrlContext): string {
    const parsed = this.parseUrlSafe(url);
    if (!parsed) return url || "";
    this.ensureGoogleAuthParams(parsed);
    return parsed.toString();
  }

  private ensureGoogleAuthParams(parsed: URL): void {
    if (!parsed.searchParams.has("response_type")) {
      parsed.searchParams.set("response_type", OAuthStrategyConstants.DEFAULT_RESPONSE_TYPE);
    }
    if (!parsed.searchParams.has("access_type")) {
      parsed.searchParams.set("access_type", OAuthStrategyConstants.DEFAULT_ACCESS_TYPE);
    }
    if (!parsed.searchParams.has("prompt")) {
      parsed.searchParams.set("prompt", OAuthStrategyConstants.DEFAULT_PROMPT);
    }
    const currentClientId = parsed.searchParams.get("client_id");
    if (!currentClientId || !currentClientId.trim() || currentClientId === "default") {
      const defaultId = GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID;
      if (defaultId) parsed.searchParams.set("client_id", defaultId);
    }
    const currentRedirect = parsed.searchParams.get("redirect_uri");
    if (!currentRedirect || !currentRedirect.trim()) {
      parsed.searchParams.set("redirect_uri", "http://localhost:8085/oauth2callback");
    }
    const currentScope = parsed.searchParams.get("scope");
    if (!currentScope || !currentScope.trim()) {
      parsed.searchParams.set("scope", GoogleAuthConstants.DEFAULT_SCOPES.join(" "));
    }
  }
}

/**
 * OpenAI ChatGPT OAuth Strategy
 * Supports direct OpenAI OAuth AND Login with Google for ChatGPT without wiping URLs.
 */
export class ChatGptOAuthUrlStrategy extends BaseOAuthUrlStrategy {
  public readonly providerId = "openai";
  protected readonly supportedKeywords = OAuthStrategyConstants.OPENAI_KEYWORDS;
  protected readonly primaryHosts = [
    ...OAuthStrategyConstants.OPENAI_HOSTS,
    ...OAuthStrategyConstants.GOOGLE_HOSTS,
  ];

  public normalizeAuthorizationUrl(url: string, _context?: OAuthUrlContext): string {
    const parsed = this.parseUrlSafe(url);
    if (!parsed) return url || "";
    this.ensureStandardParams(parsed);
    return parsed.toString();
  }

  private ensureStandardParams(parsed: URL): void {
    if (!parsed.searchParams.has("response_type")) {
      parsed.searchParams.set("response_type", OAuthStrategyConstants.DEFAULT_RESPONSE_TYPE);
    }
  }
}

/**
 * Anthropic Claude OAuth Strategy
 * Supports direct Anthropic OAuth AND Login with Google for Claude without wiping URLs.
 */
export class ClaudeOAuthUrlStrategy extends BaseOAuthUrlStrategy {
  public readonly providerId = "anthropic";
  protected readonly supportedKeywords = OAuthStrategyConstants.ANTHROPIC_KEYWORDS;
  protected readonly primaryHosts = [
    ...OAuthStrategyConstants.ANTHROPIC_HOSTS,
    ...OAuthStrategyConstants.GOOGLE_HOSTS,
  ];

  public normalizeAuthorizationUrl(url: string, _context?: OAuthUrlContext): string {
    const parsed = this.parseUrlSafe(url);
    if (!parsed) return url || "";
    this.ensureStandardParams(parsed);
    return parsed.toString();
  }

  private ensureStandardParams(parsed: URL): void {
    if (!parsed.searchParams.has("response_type")) {
      parsed.searchParams.set("response_type", OAuthStrategyConstants.DEFAULT_RESPONSE_TYPE);
    }
  }
}

/**
 * GitHub Copilot OAuth Strategy
 */
export class CopilotOAuthUrlStrategy extends BaseOAuthUrlStrategy {
  public readonly providerId = "github";
  protected readonly supportedKeywords = OAuthStrategyConstants.COPILOT_KEYWORDS;
  protected readonly primaryHosts = [
    ...OAuthStrategyConstants.COPILOT_HOSTS,
    ...OAuthStrategyConstants.GOOGLE_HOSTS,
  ];

  public normalizeAuthorizationUrl(url: string, _context?: OAuthUrlContext): string {
    const parsed = this.parseUrlSafe(url);
    return parsed ? parsed.toString() : (url || "");
  }
}

/**
 * Generic Fallback Model OAuth Strategy
 */
export class GenericModelOAuthUrlStrategy extends BaseOAuthUrlStrategy {
  public readonly providerId = "generic";
  protected readonly supportedKeywords = Object.freeze([]);
  protected readonly primaryHosts = Object.freeze([]);

  public override supports(_modelId: string, _provider?: string): boolean {
    return true;
  }

  public override isValidOAuthUrl(url: string): boolean {
    if (!url || typeof url !== "string") return false;
    const clean = url.trim();
    return clean.startsWith("http://") || clean.startsWith("https://");
  }

  public normalizeAuthorizationUrl(url: string, _context?: OAuthUrlContext): string {
    const parsed = this.parseUrlSafe(url);
    return parsed ? parsed.toString() : (url || "");
  }
}

/**
 * Centralized Factory / Registry for OAuth Provider URL Strategies.
 * Conforms to Strategy Pattern and eliminates nested conditional switching.
 */
export class OAuthProviderUrlStrategyRegistry {
  private readonly strategies: readonly IOAuthProviderUrlStrategy[] = Object.freeze([
    new AntigravityGoogleOAuthUrlStrategy(),
    new ChatGptOAuthUrlStrategy(),
    new ClaudeOAuthUrlStrategy(),
    new CopilotOAuthUrlStrategy(),
  ]);
  private readonly defaultStrategy: IOAuthProviderUrlStrategy = new GenericModelOAuthUrlStrategy();

  public getStrategy(modelId: string, provider?: string): IOAuthProviderUrlStrategy {
    const matched = this.strategies.find((strat) => strat.supports(modelId, provider));
    return matched ?? this.defaultStrategy;
  }
}

export const oauthProviderUrlStrategyRegistry = new OAuthProviderUrlStrategyRegistry();
