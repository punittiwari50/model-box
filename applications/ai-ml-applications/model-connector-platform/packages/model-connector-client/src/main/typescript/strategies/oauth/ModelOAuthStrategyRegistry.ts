import {
  environment,
  modelProviderConfigService,
  randomUUID,
  type IProviderConfigRegistry,
} from "@model-box/model-connector-core";
import { DefaultEndpoint, HttpHeader, ModelFamily, ProviderId } from "@/domain/constants/index.js";
import {
  defaultUserModelCredentialResolver,
  type IUserModelCredentialResolver,
} from "@/security/UserModelCredentialResolver.js";

export interface OAuthAuthorizationBuildRequest {
  readonly modelId: string;
  readonly providerId?: string;
  readonly clientId?: string;
  readonly redirectUri?: string;
  readonly state?: string;
  readonly codeChallenge?: string;
  readonly userEmail?: string;
  readonly preferInteractiveChooser?: boolean;
}

export interface OAuthAuthorizationDescriptor {
  readonly providerId: string;
  readonly modelId: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope: string;
  readonly prompt: string;
  readonly state: string;
  readonly authorizationUrl: string;
  readonly executableLaunchUrl: string;
  readonly upstreamAuthorizationUrl: string;
  readonly usesLoopbackAccountChooser: boolean;
}

export interface IModelOAuthProviderStrategy {
  readonly providerId: string;
  readonly modelFamily: string;
  supportsModel(modelId: string): boolean;
  buildOAuthAuthorizationConfig(request: OAuthAuthorizationBuildRequest): OAuthAuthorizationDescriptor;
  isLoopbackOrPkceToken(token: string): boolean;
  buildCliAuthEnvironment(token: string, userEmail?: string): Readonly<Record<string, string>>;
  buildApiAuthHeaders(token: string): Readonly<Record<string, string>>;
}

const PLACEHOLDER_CLIENT_IDS: ReadonlySet<string> = new Set([
  "",
  "db-managed-oauth-client-reference",
]);

abstract class BaseModelOAuthProviderStrategy implements IModelOAuthProviderStrategy {
  public abstract readonly providerId: string;
  public abstract readonly modelFamily: string;
  protected abstract readonly modelKeywords: readonly string[];
  protected abstract readonly defaultFallbackClientId: string;

  constructor(
    protected readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    protected readonly credentialResolver: IUserModelCredentialResolver = defaultUserModelCredentialResolver,
  ) {}

  public supportsModel(modelId: string): boolean {
    const normalized = modelId.toLowerCase().trim();
    return this.modelKeywords.some((kw) => normalized.includes(kw));
  }

  public buildOAuthAuthorizationConfig(
    request: OAuthAuthorizationBuildRequest,
  ): OAuthAuthorizationDescriptor {
    const resolvedClient = this.resolveConfiguredClientId(request);
    const hasCustomExternalClient = !PLACEHOLDER_CLIENT_IDS.has(resolvedClient);
    const effectiveClientId = resolvedClient || this.defaultFallbackClientId;
    const redirectUri = this.resolveRedirectUri(request.redirectUri);
    const scope = this.resolveScopes();
    const state = request.state || `${this.providerId}_${randomUUID()}`;
    const chooserUrl = this.buildLoopbackChooserUrl(request, effectiveClientId, redirectUri, scope, state);
    const upstreamUrl = this.buildUpstreamUrl(request, effectiveClientId, redirectUri, scope, state);
    const useChooser = request.preferInteractiveChooser === true || !hasCustomExternalClient;
    return Object.freeze({
      providerId: this.providerId,
      modelId: request.modelId,
      clientId: effectiveClientId,
      redirectUri,
      scope,
      prompt: "select_account consent",
      state,
      authorizationUrl: useChooser ? chooserUrl : upstreamUrl,
      executableLaunchUrl: chooserUrl,
      upstreamAuthorizationUrl: upstreamUrl,
      usesLoopbackAccountChooser: useChooser,
    });
  }

  public isLoopbackOrPkceToken(token: string): boolean {
    const trimmed = token.trim();
    const prefixes = [
      "ya29.authcode_",
      "ya29.pkce_",
      "ya29.oauth-pkce",
      "ya29.",
      "4/0",
      "oauth_pkce_",
      "sk-ant-oat",
      "gho_",
      "sk-proj-",
      "oat_",
    ];
    return prefixes.some((p) => trimmed.startsWith(p));
  }

  public buildApiAuthHeaders(token: string): Readonly<Record<string, string>> {
    return Object.freeze({
      [HttpHeader.CONTENT_TYPE]: "application/json",
      [HttpHeader.AUTHORIZATION]: `Bearer ${token}`,
    });
  }

  public abstract buildCliAuthEnvironment(
    token: string,
    userEmail?: string,
  ): Readonly<Record<string, string>>;

  protected resolveConfiguredClientId(request: OAuthAuthorizationBuildRequest): string {
    if (request.clientId && request.clientId.trim().length > 0) {
      return request.clientId.trim();
    }
    try {
      const providerConfig = this.configRegistry.getProviderConfig(this.providerId, request.modelId);
      if (providerConfig.clientId && providerConfig.clientId.trim().length > 0) {
        return providerConfig.clientId.trim();
      }
    } catch {
      // Continue to DB/account-specific fallbacks
    }
    const dbClient = this.credentialResolver.resolveOAuthClient(this.providerId, request.modelId);
    if (dbClient && dbClient.clientId.trim().length > 0) {
      return dbClient.clientId.trim();
    }
    const userCred = this.credentialResolver.resolveUserCredential({
      modelId: request.modelId,
      userEmail: request.userEmail,
      providerId: this.providerId,
    });
    return userCred?.clientId?.trim() || "";
  }

  protected resolveRedirectUri(overrideUri?: string): string {
    if (overrideUri && overrideUri.trim().length > 0) {
      return overrideUri.trim();
    }
    const base = environment.getProperty(
      "urls.oauthCallbackBaseUrl",
      DefaultEndpoint.OAUTH_CALLBACK_BASE_URL,
    );
    return `${base.replace(/\/+$/, "")}/oauth2/callback`;
  }

  protected resolveScopes(): string {
    try {
      const cfg = this.configRegistry.getProviderConfig(this.providerId);
      if (cfg.defaultScopes && cfg.defaultScopes.length > 0) {
        return cfg.defaultScopes.join(" ");
      }
    } catch {
      // Fall through to default scope
    }
    return "openid email profile";
  }

  protected buildLoopbackChooserUrl(
    request: OAuthAuthorizationBuildRequest,
    clientId: string,
    redirectUri: string,
    scope: string,
    state: string,
  ): string {
    const callbackBase = environment
      .getProperty("urls.oauthCallbackBaseUrl", DefaultEndpoint.OAUTH_CALLBACK_BASE_URL)
      .replace(/\/+$/, "");
    const params = this.buildCommonQueryParams(request, clientId, redirectUri, scope, state);
    params.set("provider", this.providerId);
    params.set("model", request.modelId);
    return `${callbackBase}/oauth2/authorize?${params.toString()}`;
  }

  protected buildUpstreamUrl(
    request: OAuthAuthorizationBuildRequest,
    clientId: string,
    redirectUri: string,
    scope: string,
    state: string,
  ): string {
    const cfg = this.configRegistry.getProviderConfig(this.providerId);
    const params = this.buildCommonQueryParams(request, clientId, redirectUri, scope, state);
    this.appendProviderSpecificParams(params, request);
    return `${cfg.authEndpoint}?${params.toString()}`;
  }

  protected buildCommonQueryParams(
    request: OAuthAuthorizationBuildRequest,
    clientId: string,
    redirectUri: string,
    scope: string,
    state: string,
  ): URLSearchParams {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
      access_type: "offline",
      prompt: "select_account consent",
      code_challenge: request.codeChallenge || `pkce_${state}`,
      code_challenge_method: "S256",
    });
    if (request.userEmail) {
      params.set("login_hint", request.userEmail);
    }
    return params;
  }

  protected appendProviderSpecificParams(
    _params: URLSearchParams,
    _request: OAuthAuthorizationBuildRequest,
  ): void {
    // Subclasses override to add provider-specific OAuth query params
  }
}

export class GeminiOAuthProviderStrategy extends BaseModelOAuthProviderStrategy {
  public readonly providerId = ProviderId.GOOGLE;
  public readonly modelFamily = ModelFamily.GEMINI;
  protected readonly modelKeywords = ["gemini", "google"];
  protected readonly defaultFallbackClientId = "google-gemini-cli-pkce-client";

  public buildCliAuthEnvironment(token: string, userEmail?: string): Readonly<Record<string, string>> {
    return Object.freeze({
      GOOGLE_GENAI_USE_GCA: "true",
      GOOGLE_CLOUD_ACCESS_TOKEN: token,
      GEMINI_OAUTH_TOKEN: token,
      ...(userEmail ? { GOOGLE_ACCOUNT_EMAIL: userEmail } : {}),
    });
  }

  protected override appendProviderSpecificParams(params: URLSearchParams): void {
    params.set("include_granted_scopes", "true");
  }
}

export class ClaudeOAuthProviderStrategy extends BaseModelOAuthProviderStrategy {
  public readonly providerId = "anthropic";
  public readonly modelFamily = ModelFamily.CLAUDE;
  protected readonly modelKeywords = ["claude", "anthropic"];
  protected readonly defaultFallbackClientId = "";

  public buildCliAuthEnvironment(token: string, userEmail?: string): Readonly<Record<string, string>> {
    return Object.freeze({
      CLAUDE_CODE_OAUTH_TOKEN: token,
      ANTHROPIC_AUTH_TOKEN: token,
      ...(userEmail ? { CLAUDE_USER_EMAIL: userEmail } : {}),
    });
  }
}

export class OpenAiOAuthProviderStrategy extends BaseModelOAuthProviderStrategy {
  public readonly providerId = "openai";
  public readonly modelFamily = ModelFamily.CHATGPT;
  protected readonly modelKeywords = ["gpt", "o1", "o3", "chatgpt", "openai"];
  protected readonly defaultFallbackClientId = "";

  public buildCliAuthEnvironment(token: string, userEmail?: string): Readonly<Record<string, string>> {
    return Object.freeze({
      OPENAI_API_KEY: token,
      OPENAI_ACCESS_TOKEN: token,
      ...(userEmail ? { OPENAI_USER_EMAIL: userEmail } : {}),
    });
  }
}

export class CopilotOAuthProviderStrategy extends BaseModelOAuthProviderStrategy {
  public readonly providerId = "github";
  public readonly modelFamily = ModelFamily.COPILOT;
  protected readonly modelKeywords = ["copilot", "github"];
  protected readonly defaultFallbackClientId = "";

  public buildCliAuthEnvironment(token: string, userEmail?: string): Readonly<Record<string, string>> {
    return Object.freeze({
      GITHUB_TOKEN: token,
      GH_TOKEN: token,
      COPILOT_GITHUB_TOKEN: token,
      ...(userEmail ? { GITHUB_USER_EMAIL: userEmail } : {}),
    });
  }
}

export class GrokOAuthProviderStrategy extends BaseModelOAuthProviderStrategy {
  public readonly providerId = "xai";
  public readonly modelFamily = ModelFamily.GROK;
  protected readonly modelKeywords = ["grok", "xai"];
  protected readonly defaultFallbackClientId = "";

  public buildCliAuthEnvironment(token: string, userEmail?: string): Readonly<Record<string, string>> {
    return Object.freeze({
      XAI_API_KEY: token,
      GROK_API_KEY: token,
      ...(userEmail ? { XAI_USER_EMAIL: userEmail } : {}),
    });
  }
}

export class OllamaOAuthProviderStrategy extends BaseModelOAuthProviderStrategy {
  public readonly providerId = "ollama";
  public readonly modelFamily = ModelFamily.OLLAMA;
  protected readonly modelKeywords = ["ollama", "llama", "lfm3", "deepseek", "qwen", "phi", "gemma", "tinyllama"];
  protected readonly defaultFallbackClientId = "";

  public buildCliAuthEnvironment(token: string, userEmail?: string): Readonly<Record<string, string>> {
    return Object.freeze({
      OLLAMA_OAUTH_TOKEN: token,
      ...(userEmail ? { OLLAMA_USER_EMAIL: userEmail } : {}),
    });
  }
}

export interface IModelOAuthStrategyRegistry {
  resolveByModel(modelId: string): IModelOAuthProviderStrategy;
  resolveByProvider(providerId: string): IModelOAuthProviderStrategy;
  registerStrategy(strategy: IModelOAuthProviderStrategy): void;
}

export class ModelOAuthStrategyRegistry implements IModelOAuthStrategyRegistry {
  private static instance: ModelOAuthStrategyRegistry | null = null;
  private readonly strategies: IModelOAuthProviderStrategy[] = [];
  private readonly defaultStrategy: IModelOAuthProviderStrategy;

  constructor(
    configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    credentialResolver: IUserModelCredentialResolver = defaultUserModelCredentialResolver,
  ) {
    const gemini = new GeminiOAuthProviderStrategy(configRegistry, credentialResolver);
    this.defaultStrategy = gemini;
    this.strategies.push(
      gemini,
      new CopilotOAuthProviderStrategy(configRegistry, credentialResolver),
      new ClaudeOAuthProviderStrategy(configRegistry, credentialResolver),
      new OpenAiOAuthProviderStrategy(configRegistry, credentialResolver),
      new GrokOAuthProviderStrategy(configRegistry, credentialResolver),
      new OllamaOAuthProviderStrategy(configRegistry, credentialResolver),
    );
  }

  public static getInstance(): ModelOAuthStrategyRegistry {
    if (!this.instance) {
      this.instance = new ModelOAuthStrategyRegistry();
    }
    return this.instance;
  }

  public registerStrategy(strategy: IModelOAuthProviderStrategy): void {
    this.strategies.unshift(strategy);
  }

  public resolveByModel(modelId: string): IModelOAuthProviderStrategy {
    const match = this.strategies.find((s) => s.supportsModel(modelId));
    return match ?? this.defaultStrategy;
  }

  public resolveByProvider(providerId: string): IModelOAuthProviderStrategy {
    const clean = providerId.toLowerCase().trim();
    const match = this.strategies.find((s) => s.providerId === clean || s.modelFamily === clean);
    return match ?? this.defaultStrategy;
  }
}

export const defaultModelOAuthStrategyRegistry: IModelOAuthStrategyRegistry =
  ModelOAuthStrategyRegistry.getInstance();
