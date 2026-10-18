import { authRepo, type IAuthRepository } from '@/repositories/authRepository.js';
import { auditRepo, AuditRepository } from '@/repositories/auditRepository.js';
import { logger } from '@/core/observability/logging/logger.js';
import type { ModelAuth, AuthStatusResponse } from '@/domain/index.js';
import {
  KNOWN_MODELS,
  TimeDurationMs,
  AuthStatusConstant,
  ModelCatalog,
  AuditAction,
  CommonStatus,
  AuthType,
} from '@/domain/constants/index.js';
import {
  authProviderRegistry,
  AuthProviderRegistry,
  type InitiateAuthResult,
} from '@/core/adapters/auth/authProvider.js';
import { config } from '@/core/config/index.js';
import type { IAuthService } from '@/services/auth/iAuthService.js';

export { KNOWN_MODELS, type InitiateAuthResult };

/**
 * High-Level Authentication Orchestrator Service.
 * Dispatches to model-specific AuthProvider strategies (Google Gemini, Anthropic Claude, OpenAI Codex).
 *
 * Conforms to:
 * - STD-COD-005: Strategy Pattern & Polymorphic Dispatch
 * - STD-COD-006: Max Cyclomatic Complexity <= 10
 * - STD-COD-007: SLAP & Clean Separation of Concerns
 */
export class AuthService implements IAuthService {
  private readonly authRepository: IAuthRepository;
  private readonly auditRepository: AuditRepository;
  private readonly providerRegistry: AuthProviderRegistry;

  constructor(
    auth: IAuthRepository = authRepo,
    audit = auditRepo,
    providerRegistry = authProviderRegistry
  ) {
    this.authRepository = auth;
    this.auditRepository = audit;
    this.providerRegistry = providerRegistry;
  }

  /**
   * Initiates authentication for any supported model (Gemini, Claude, Codex, etc.).
   * Dispatches via Strategy Pattern without procedural if/else branching.
   */
  async initiateAuth(
    model: string = ModelCatalog.DEFAULT,
    launchBrowser = true,
    redirectUriOverride?: string,
    clientIp?: string
  ): Promise<InitiateAuthResult> {
    const provider = this.providerRegistry.getProvider(model);
    return provider.initiateAuth({
      model,
      launchBrowser,
      redirectUriOverride,
      clientIp,
    });
  }

  /**
   * Generic provider authorization initiation (Requirement #4).
   */
  async initiateProviderAuth(
    model: string = ModelCatalog.DEFAULT,
    launchBrowser = true,
    redirectUriOverride?: string
  ): Promise<InitiateAuthResult> {
    return this.initiateAuth(model, launchBrowser, redirectUriOverride);
  }

  /**
   * Backwards-compatible alias for initiateProviderAuth.
   */
  async initiateGoogleAuth(
    model: string = ModelCatalog.DEFAULT,
    launchBrowser = true,
    redirectUriOverride?: string
  ): Promise<InitiateAuthResult> {
    return this.initiateProviderAuth(model, launchBrowser, redirectUriOverride);
  }

  /**
   * Handles OAuth callback or manual authorization code exchange across any provider.
   */
  async handleOAuthCallback(
    code: string,
    state?: string,
    clientIp?: string,
    redirectUriOverride?: string,
    manualCodeVerifier?: string,
    targetModel?: string
  ): Promise<ModelAuth> {
    const model = targetModel || ModelCatalog.DEFAULT;
    const provider = this.providerRegistry.getProvider(model);

    const savedAuth = await provider.handleCallback(
      {
        code,
        state,
        clientIp,
        redirectUriOverride,
        manualCodeVerifier,
        model,
      },
      this.authRepository
    );

    await this.auditRepository.logEvent({
      action: AuditAction.AUTH_LOGIN_SUCCESS,
      client_ip: clientIp,
      model_used: savedAuth.model,
      status: CommonStatus.SUCCESS,
      details: {
        model: savedAuth.model,
        account_email: savedAuth.account_email,
        auth_type: savedAuth.auth_type,
        provider: provider.providerId,
      },
    });

    logger.info(
      'AUTH',
      `Successfully authenticated model '${savedAuth.model}' via ${provider.providerId} (${savedAuth.account_email})`
    );
    return savedAuth;
  }

  /**
   * Direct programmatic token / API key login per model.
   */
  async loginWithCredentials(
    model: string,
    token: string,
    email?: string,
    authType: (typeof AuthType)[keyof typeof AuthType] = AuthType.API_KEY,
    clientIp?: string
  ): Promise<ModelAuth> {
    const provider = this.providerRegistry.getProvider(model);

    const saved = await this.authRepository.saveModelAuth({
      model,
      auth_type: authType,
      account_email: email || config.getAccountEmail(model),
      account_name: config.getAccountName(model),
      access_token: token,
      status: AuthStatusConstant.AUTHENTICATED,
      expires_at: new Date(Date.now() + TimeDurationMs.CREDENTIAL_DEFAULT_EXPIRY).toISOString(),
      metadata: { direct_auth: true, provider: provider.providerId },
    });

    await provider.syncCredentials(saved);

    await this.auditRepository.logEvent({
      action: AuditAction.AUTH_DIRECT_LOGIN,
      client_ip: clientIp,
      model_used: model,
      status: CommonStatus.SUCCESS,
      details: { model, auth_type: authType, provider: provider.providerId },
    });

    return saved;
  }

  async saveApiKey(model: string, apiKey: string): Promise<ModelAuth> {
    return this.loginWithCredentials(model, apiKey, undefined, AuthType.API_KEY);
  }

  /**
   * Logs out a specific model or all authenticated models.
   */
  async logout(
    options: { model?: string; all?: boolean } | string = { all: true },
    clientIp?: string
  ): Promise<{ success: boolean; model?: string; count?: number; message: string }> {
    const opts = typeof options === 'string' ? { model: options } : options;
    const shouldLogoutAll = Boolean(opts.all) || opts.model === 'all' || !opts.model;

    if (shouldLogoutAll) {
      const count = await this.authRepository.deleteAllModelAuth();
      await this.clearAllCliCredentials();

      await this.auditRepository.logEvent({
        action: AuditAction.AUTH_LOGOUT_ALL,
        client_ip: clientIp,
        status: CommonStatus.SUCCESS,
        details: { count },
      });
      logger.info('AUTH', `Logged out all authenticated models (total: ${count})`);
      return {
        success: true,
        count,
        message: 'All model connections and sessions have been logged out successfully.',
      };
    }

    const targetModel = opts.model!;
    const deleted = await this.authRepository.deleteModelAuth(targetModel);
    const provider = this.providerRegistry.getProvider(targetModel);
    await provider.clearCredentials();

    await this.auditRepository.logEvent({
      action: AuditAction.AUTH_LOGOUT,
      client_ip: clientIp,
      model_used: targetModel,
      status: CommonStatus.SUCCESS,
      details: { model: targetModel, deleted },
    });

    logger.info('AUTH', `Logged out model '${targetModel}' (deleted: ${deleted})`);
    return {
      success: true,
      model: targetModel,
      message: deleted
        ? `Model '${targetModel}' has been logged out successfully.`
        : `Model '${targetModel}' was not actively authenticated.`,
    };
  }

  async logoutAll(): Promise<{ success: boolean; message: string }> {
    const res = await this.logout({ all: true });
    return { success: res.success, message: res.message };
  }

  /**
   * Synchronizes credentials via model's provider strategy.
   * Conforms to Requirement #4: generic decoupled naming conventions.
   */
  async syncCliOAuth(auth: ModelAuth): Promise<void> {
    const provider = this.providerRegistry.getProvider(auth.model);
    await provider.syncCredentials(auth);
  }

  async syncGeminiCliOAuth(auth: ModelAuth): Promise<void> {
    await this.syncCliOAuth(auth);
  }

  /**
   * Clears credentials across all registered providers.
   */
  async clearAllCliCredentials(): Promise<void> {
    for (const p of this.providerRegistry.getAllProviders()) {
      await p.clearCredentials();
    }
  }

  async clearGeminiCliOAuth(): Promise<void> {
    await this.clearAllCliCredentials();
  }

  /**
   * Retrieves overall and per-model authentication status across all verified models.
   */
  async getStatus(): Promise<AuthStatusResponse> {
    const activeAuthList: ModelAuth[] = await this.authRepository.listAllModelAuth();
    const activeMap = new Map<string, ModelAuth>(activeAuthList.map((a: ModelAuth) => [a.model, a]));
    const modelsStatus: Record<string, any> = {};

    // Check all verified available models
    for (const m of KNOWN_MODELS) {
      const auth = activeMap.get(m);
      if (auth) {
        modelsStatus[m] = {
          authenticated: auth.status === AuthStatusConstant.AUTHENTICATED,
          auth_type: auth.auth_type,
          account_email: auth.account_email,
          expires_at: auth.expires_at,
          status: auth.status,
        };
      } else {
        modelsStatus[m] = {
          authenticated: false,
          auth_type: undefined,
          account_email: undefined,
          expires_at: undefined,
          status: AuthStatusConstant.UNAUTHENTICATED,
        };
      }
    }

    // Add any custom authenticated models
    for (const [m, auth] of activeMap.entries()) {
      if (!modelsStatus[m]) {
        modelsStatus[m] = {
          authenticated: auth.status === AuthStatusConstant.AUTHENTICATED,
          auth_type: auth.auth_type,
          account_email: auth.account_email,
          expires_at: auth.expires_at,
          status: auth.status,
        };
      }
    }

    const overallAuthenticated = activeAuthList.some(
      (a: ModelAuth) => a.status === AuthStatusConstant.AUTHENTICATED
    );

    return {
      overall_authenticated: overallAuthenticated,
      global_authenticated: overallAuthenticated,
      models: modelsStatus,
    };
  }
}

export const authService = new AuthService();
