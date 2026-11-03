import {
  cryptoUtils,
  GoogleAuthConstants,
  ProviderId,
  modelProviderConfigService,
  ollamaModelDiscoveryCache,
  providerOAuthClientRepository,
  type IOllamaModelDiscoveryCache,
  type IProviderConfigRegistry,
  type IProviderOAuthClientRepository,
  type ProviderOAuthClientRecord,
  type UpsertOAuthClientInput,
} from "@model-box/model-connector-core";

const DEFAULT_CALLBACK_URL = "http://localhost:8085/oauth2callback";
const DEFAULT_OAUTH_CHOOSER_URL = "http://localhost:8085/oauth2/authorize";
const RESPONSE_TYPE_CODE = "code";
const ACCESS_TYPE_OFFLINE = "offline";
const PKCE_CODE_VERIFIER_TTL_MS = 30 * 60 * 1000;

export interface ModelOAuthDescriptor {
  readonly provider: string;
  readonly providerName: string;
  readonly providerIcon: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly cliCommand: string;
  readonly defaultScopes: readonly string[];
  readonly defaultClientId: string;
  readonly defaultRedirectUri?: string;
  readonly accountCategory?: "individual" | "enterprise";
}

export interface ModelOAuthConfigResult extends ModelOAuthDescriptor {
  readonly modelId: string;
  readonly redirectUri: string;
  readonly authorizationUrl: string;
  readonly executableLaunchUrl?: string;
  readonly usesLoopbackChooser?: boolean;
  readonly requiresClientRegistration: boolean;
  readonly structuredParams?: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly scopes: readonly string[];
    readonly state: string;
    readonly responseType: string;
    readonly accessType: string;
    readonly prompt: string;
  };
}

export interface CliLoginInstructionResult {
  readonly provider: string;
  readonly cliCommand: string;
  readonly accountCategory: "individual" | "enterprise";
  readonly userEmail: string;
  readonly accessToken: string;
  readonly accountName: string;
  readonly authType: "cli_oauth";
  readonly config: {
    readonly cliCommand: string;
    readonly accountCategory: "individual" | "enterprise";
    readonly provider: string;
    readonly clientId: string;
    readonly scopes: readonly string[];
    readonly loginTimestamp: string;
    readonly authorizationUrl?: string;
    readonly requiresClientRegistration: boolean;
    readonly setupGuide?: string;
    readonly nextStep: string;
  };
}

export interface UpsertProviderOAuthClientRequest {
  readonly providerId: string;
  readonly oauthClientConfigId?: string;
  readonly modelId?: string;
  readonly clientAlias?: string;
  readonly clientName?: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly redirectUri?: string;
  readonly scopes?: readonly string[];
  readonly isDefault?: boolean;
}

export interface IModelOAuthStrategy {
  supports(modelId: string): boolean;
  getDescriptor(modelId: string): ModelOAuthDescriptor;
}

abstract class ConfiguredProviderOAuthStrategy implements IModelOAuthStrategy {
  protected constructor(
    protected readonly providerId: string,
    protected readonly accountCategory: "individual" | "enterprise" = "individual",
    protected readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService,
  ) {}

  public supports(modelId: string): boolean {
    const normalized = modelId.toLowerCase();
    const keywords = this.configRegistry.getProviderConfig(this.providerId).modelKeywords;
    return keywords.some((kw) => normalized.includes(kw));
  }

  public getDescriptor(modelId = "default"): ModelOAuthDescriptor {
    const config = this.configRegistry.getProviderConfig(this.providerId, modelId);
    return {
      provider: this.providerId,
      providerName: config.name,
      providerIcon: config.icon,
      authorizationEndpoint: config.authEndpoint,
      tokenEndpoint: config.tokenEndpoint,
      cliCommand: config.cliCommand,
      defaultScopes: config.defaultScopes,
      defaultClientId: config.clientId,
      defaultRedirectUri: config.defaultRedirectUri,
      accountCategory: this.accountCategory,
    };
  }
}

class GoogleGeminiOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super(ProviderId.GOOGLE, "individual", configRegistry);
  }

  public override supports(modelId: string): boolean {
    const normalized = modelId.toLowerCase();
    return normalized.includes("gemini") || super.supports(modelId);
  }
}

class XAiGrokOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("xai", "individual", configRegistry);
  }
}

class AnthropicClaudeOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("anthropic", "individual", configRegistry);
  }
}

class GitHubCopilotOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("github", "individual", configRegistry);
  }
}

class OpenAiOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("openai", "individual", configRegistry);
  }
}

class AzureOpenAiOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("azure", "enterprise", configRegistry);
  }
}

class AwsBedrockOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("bedrock", "enterprise", configRegistry);
  }
}

class GroqOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("groq", "individual", configRegistry);
  }
}

class MistralOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("mistral", "individual", configRegistry);
  }
}

class DeepSeekOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("deepseek", "individual", configRegistry);
  }
}

class TogetherAiOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("together", "individual", configRegistry);
  }
}

class CerebrasOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("cerebras", "individual", configRegistry);
  }
}

class FireworksAiOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("fireworks", "individual", configRegistry);
  }
}

class SambaNovaOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("sambanova", "enterprise", configRegistry);
  }
}

class HuggingFaceOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("huggingface", "individual", configRegistry);
  }
}

class OllamaOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(
    configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    private readonly ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
  ) {
    super("ollama", "individual", configRegistry);
  }

  public override supports(modelId: string): boolean {
    return this.ollamaCache.isOllamaModel(modelId);
  }
}

class CohereOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("cohere", "enterprise", configRegistry);
  }
}

class PerplexityOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("perplexity", "individual", configRegistry);
  }
}

class FallbackOidcOAuthStrategy extends ConfiguredProviderOAuthStrategy {
  constructor(configRegistry: IProviderConfigRegistry = modelProviderConfigService) {
    super("custom", "enterprise", configRegistry);
  }

  public override supports(): boolean {
    return true;
  }
}

export class ModelOAuthProviderService {
  private static instance: ModelOAuthProviderService | null = null;
  private readonly strategies: readonly IModelOAuthStrategy[];
  private readonly fallbackStrategy: IModelOAuthStrategy;
  private readonly pkceCodeVerifiers = new Map<string, { verifier: string; expiresAt: number }>();

  constructor(
    customStrategies?: readonly IModelOAuthStrategy[],
    private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
    private readonly oauthClientRepository: IProviderOAuthClientRepository = providerOAuthClientRepository,
  ) {
    this.fallbackStrategy = new FallbackOidcOAuthStrategy(configRegistry);
    this.strategies = customStrategies ?? [
      new GitHubCopilotOAuthStrategy(configRegistry),
      new GoogleGeminiOAuthStrategy(configRegistry),
      new OpenAiOAuthStrategy(configRegistry),
      new AnthropicClaudeOAuthStrategy(configRegistry),
      new AzureOpenAiOAuthStrategy(configRegistry),
      new XAiGrokOAuthStrategy(configRegistry),
      new AwsBedrockOAuthStrategy(configRegistry),
      new GroqOAuthStrategy(configRegistry),
      new MistralOAuthStrategy(configRegistry),
      new DeepSeekOAuthStrategy(configRegistry),
      new TogetherAiOAuthStrategy(configRegistry),
      new CerebrasOAuthStrategy(configRegistry),
      new FireworksAiOAuthStrategy(configRegistry),
      new SambaNovaOAuthStrategy(configRegistry),
      new HuggingFaceOAuthStrategy(configRegistry),
      new OllamaOAuthStrategy(configRegistry, ollamaCache),
      new CohereOAuthStrategy(configRegistry),
      new PerplexityOAuthStrategy(configRegistry),
    ];
  }

  public static getInstance(): ModelOAuthProviderService {
    if (!this.instance) {
      this.instance = new ModelOAuthProviderService();
    }
    return this.instance;
  }

  public listProviderOAuthClients(providerId: string): readonly ProviderOAuthClientRecord[] {
    return this.oauthClientRepository.listByProvider(providerId);
  }

  public listAllProviderOAuthClients(): readonly ProviderOAuthClientRecord[] {
    return this.oauthClientRepository.listAllActive();
  }

  public upsertProviderOAuthClient(request: UpsertProviderOAuthClientRequest): ProviderOAuthClientRecord {
    const clientId = request.clientId?.trim();
    if (!clientId) {
      throw new Error("clientId is required to register a provider OAuth client in the database.");
    }
    const payload: UpsertOAuthClientInput = {
      oauthClientConfigId: request.oauthClientConfigId,
      providerId: request.providerId,
      modelId: request.modelId || "*",
      clientAlias: request.clientAlias || request.clientName || `${request.providerId} OAuth Client`,
      clientId,
      clientSecret: request.clientSecret || "",
      redirectUri: request.redirectUri,
      scopes: request.scopes,
      isDefault: Boolean(request.isDefault),
    };
    return this.oauthClientRepository.upsertClient(payload);
  }

  public deleteProviderOAuthClient(clientConfigId: string): boolean {
    return this.oauthClientRepository.deleteClient(clientConfigId);
  }

  public resolveStrategy(modelId: string): IModelOAuthStrategy {
    const matched = this.strategies.find((strategy) => strategy.supports(modelId));
    return matched ?? this.fallbackStrategy;
  }

  public getAllDescriptors(): readonly ModelOAuthDescriptor[] {
    return Object.freeze([
      ...this.strategies.map((strategy) => strategy.getDescriptor("default")),
      this.fallbackStrategy.getDescriptor("default"),
    ]);
  }

  public buildStructuredState(modelId: string, provider: string): string {
    const stateParams = new URLSearchParams({
      app: "modelbox-studio",
      model: modelId,
      provider,
      flow: "cli_oauth",
      nonce: Math.random().toString(36).substring(2, 10),
      ts: Date.now().toString(),
    });
    return stateParams.toString();
  }

  public consumePkceCodeVerifier(state: string): string | undefined {
    if (!state) return undefined;
    this.clearExpiredPkceCodeVerifiers();
    const entry = this.pkceCodeVerifiers.get(state);
    if (!entry) return undefined;
    this.pkceCodeVerifiers.delete(state);
    return entry.verifier;
  }

  public getOAuthConfigForModel(
    modelId: string,
    redirectUri?: string,
    oauthClientIdOverride?: string,
  ): ModelOAuthConfigResult {
    const descriptor = this.resolveStrategy(modelId).getDescriptor(modelId);
    const platformCallbackUrl = this.configRegistry.getPlatformUrl("oauthCallbackUrl") || DEFAULT_CALLBACK_URL;
    const resolvedRedirectUri =
      redirectUri ||
      (descriptor.provider === ProviderId.GOOGLE
        ? platformCallbackUrl
        : descriptor.defaultRedirectUri || DEFAULT_CALLBACK_URL);
    this.validateOAuthDescriptor(modelId, descriptor, resolvedRedirectUri);
    const resolvedClientId = (oauthClientIdOverride || descriptor.defaultClientId || "").trim();
    const oauthClientIdForPreview = resolvedClientId || "<DB_MANAGED_OAUTH_CLIENT_REFERENCE>";
    const structuredState = this.buildStructuredState(modelId, descriptor.provider);
    const authorizationUrl = this.buildAuthorizationUrl(
      descriptor,
      resolvedRedirectUri,
      modelId,
      oauthClientIdForPreview,
      structuredState,
    );
    const executableLaunchUrl =
      descriptor.provider === ProviderId.GOOGLE
        ? (resolvedClientId
          ? this.buildAuthorizationUrl(descriptor, resolvedRedirectUri, modelId, resolvedClientId, structuredState)
          : undefined)
        : this.buildChooserLaunchUrl(
          descriptor,
          modelId,
          resolvedRedirectUri,
          resolvedClientId,
          descriptor.defaultScopes.join(" "),
          structuredState,
        );
    const requiresClientRegistration = descriptor.provider === ProviderId.GOOGLE && !resolvedClientId;

    return {
      modelId,
      redirectUri: resolvedRedirectUri,
      authorizationUrl,
      executableLaunchUrl,
      usesLoopbackChooser: false,
      requiresClientRegistration,
      ...descriptor,
      defaultClientId: resolvedClientId,
      structuredParams: {
        clientId: oauthClientIdForPreview,
        redirectUri: resolvedRedirectUri,
        scopes: descriptor.defaultScopes,
        state: structuredState,
        responseType: RESPONSE_TYPE_CODE,
        accessType: ACCESS_TYPE_OFFLINE,
        prompt: "select_account consent",
      },
    };
  }

  private buildAuthorizationUrl(
    descriptor: ModelOAuthDescriptor,
    redirectUri: string,
    modelId: string,
    oauthClientId: string,
    state?: string,
  ): string {
    const resolvedState = state || this.buildStructuredState(modelId, descriptor.provider);
    const params = new URLSearchParams({
      client_id: oauthClientId,
      redirect_uri: redirectUri,
      response_type: RESPONSE_TYPE_CODE,
      scope: descriptor.defaultScopes.join(" "),
      state: resolvedState,
      access_type: ACCESS_TYPE_OFFLINE,
      prompt: "select_account consent",
    });
    if (descriptor.provider === ProviderId.GOOGLE) {
      params.set("include_granted_scopes", "true");
      const pkce = this.preparePkceChallenge(resolvedState);
      params.set("code_challenge", pkce.codeChallenge);
      params.set("code_challenge_method", "S256");
    }
    return `${descriptor.authorizationEndpoint}?${params.toString()}`;
  }

  private preparePkceChallenge(state: string): { codeChallenge: string } {
    this.clearExpiredPkceCodeVerifiers();
    const existing = this.pkceCodeVerifiers.get(state);
    const verifier = existing?.verifier || this.createPkceCodeVerifier();
    const codeChallenge = this.toBase64Url(cryptoUtils.createHash("sha256").update(verifier).digest());
    if (!existing) {
      this.pkceCodeVerifiers.set(state, {
        verifier,
        expiresAt: Date.now() + PKCE_CODE_VERIFIER_TTL_MS,
      });
    }
    return { codeChallenge };
  }

  private clearExpiredPkceCodeVerifiers(): void {
    const now = Date.now();
    for (const [key, value] of this.pkceCodeVerifiers.entries()) {
      if (value.expiresAt <= now) {
        this.pkceCodeVerifiers.delete(key);
      }
    }
  }

  private createPkceCodeVerifier(): string {
    return this.toBase64Url(cryptoUtils.randomBytes(48));
  }

  private toBase64Url(value: Buffer): string {
    return value
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  private buildChooserLaunchUrl(
    descriptor: ModelOAuthDescriptor,
    modelId: string,
    redirectUri: string,
    oauthClientId: string,
    scopes: string,
    state: string,
  ): string {
    const chooserBaseUrl =
      this.configRegistry.getPlatformUrl("oauthAuthorizeChooserUrl") || DEFAULT_OAUTH_CHOOSER_URL;
    const params = new URLSearchParams({
      provider: descriptor.provider,
      model: modelId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      prompt: "select_account consent",
      access_type: ACCESS_TYPE_OFFLINE,
    });
    if (oauthClientId.trim()) {
      params.set("client_id", oauthClientId.trim());
    }
    return `${chooserBaseUrl}?${params.toString()}`;
  }

  private validateOAuthDescriptor(
    modelId: string,
    descriptor: ModelOAuthDescriptor,
    redirectUri: string,
  ): void {
    if (!this.isAbsoluteHttpUrl(descriptor.authorizationEndpoint)) {
      throw new Error(`Invalid OAuth authorization endpoint configured for provider '${descriptor.provider}'.`);
    }
    if (!this.isAbsoluteHttpUrl(redirectUri)) {
      throw new Error(`Invalid OAuth redirect URI configured for model '${modelId}'.`);
    }
  }

  private isAbsoluteHttpUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  public executeCliLogin(
    modelId: string,
    options?: { accountCategory?: "individual" | "enterprise"; userEmail?: string },
  ): CliLoginInstructionResult {
    const descriptor = this.resolveStrategy(modelId).getDescriptor(modelId);
    const category = options?.accountCategory || "individual";
    const userEmail =
      options?.userEmail || (category === "individual" ? "personal.developer@gmail.com" : "developer@enterprise.com");
    const accountName =
      category === "individual"
        ? `${descriptor.providerName} (Individual CLI Account)`
        : `${descriptor.providerName} (Enterprise Project)`;
    const hasProviderClient = descriptor.defaultClientId.trim().length > 0;
    const isGoogleIndividualCli = descriptor.provider === ProviderId.GOOGLE && category === "individual";
    const googleClientId = descriptor.defaultClientId.trim() || GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID;
    const platformCallbackUrl = this.configRegistry.getPlatformUrl("oauthCallbackUrl") || DEFAULT_CALLBACK_URL;
    const resolvedRedirectUri =
      descriptor.provider === ProviderId.GOOGLE ? platformCallbackUrl : descriptor.defaultRedirectUri || DEFAULT_CALLBACK_URL;
    const structuredState = this.buildStructuredState(modelId, descriptor.provider);
    const authorizationUrl =
      descriptor.provider === ProviderId.GOOGLE
        ? this.buildAuthorizationUrl(
            descriptor,
            resolvedRedirectUri,
            modelId,
            googleClientId,
            structuredState,
          )
        : this.buildChooserLaunchUrl(
            descriptor,
            modelId,
            resolvedRedirectUri,
            descriptor.defaultClientId,
            descriptor.defaultScopes.join(" "),
            structuredState,
          );
    const isGeminiWithoutClient = descriptor.provider === ProviderId.GOOGLE && !hasProviderClient;
    const requiresClientRegistration = false;

    return {
      provider: descriptor.provider,
      cliCommand: descriptor.cliCommand,
      accountCategory: category,
      userEmail,
      accessToken: "",
      accountName,
      authType: "cli_oauth",
      config: {
        cliCommand: descriptor.cliCommand,
        accountCategory: category,
        provider: descriptor.provider,
        clientId: googleClientId,
        scopes: descriptor.defaultScopes,
        loginTimestamp: new Date().toISOString(),
        authorizationUrl,
        requiresClientRegistration,
        setupGuide: isGeminiWithoutClient
          ? "https://geminicli.com/docs/get-started/authentication/#login-google"
          : undefined,
        nextStep: isGoogleIndividualCli
          ? "Launch the authorization URL in host browser, sign in with your Google account, and authorize Gemini CLI."
          : isGeminiWithoutClient
          ? "Open the authorization URL in host browser and choose '(Recommended) Sign in with Google'."
          : "Open the authorization URL in browser and complete provider consent.",
      },
    };
  }
}

export const modelOAuthProviderService = ModelOAuthProviderService.getInstance();
