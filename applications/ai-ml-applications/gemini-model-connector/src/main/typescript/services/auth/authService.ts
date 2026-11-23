import {
  authRepo,
  type IAuthRepository,
} from "@/repositories/authRepository.js";
import { auditRepo, AuditRepository } from "@/repositories/auditRepository.js";
import { logger } from "@/core/observability/logging/logger.js";
import type { ModelAuth, AuthStatusResponse } from "@/domain/index.js";
import {
  KNOWN_MODELS,
  TimeDurationMs,
  AuthStatusConstant,
  ModelCatalog,
  AuditAction,
  CommonStatus,
  AuthType,
  ModelFamily,
  getModelFamily,
} from "@/domain/constants/index.js";
import {
  authProviderRegistry,
  AuthProviderRegistry,
  type InitiateAuthResult,
} from "@/core/adapters/auth/authProvider.js";
import { config } from "@/core/config/index.js";
import type { IAuthService } from "@/services/auth/iAuthService.js";

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
    providerRegistry = authProviderRegistry,
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
    clientIp?: string,
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
    redirectUriOverride?: string,
  ): Promise<InitiateAuthResult> {
    return this.initiateAuth(model, launchBrowser, redirectUriOverride);
  }

  /**
   * Backwards-compatible alias for initiateProviderAuth.
   */
  async initiateGoogleAuth(
    model: string = ModelCatalog.DEFAULT,
    launchBrowser = true,
    redirectUriOverride?: string,
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
    targetModel?: string,
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
      this.authRepository,
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
      "AUTH",
      `Successfully authenticated model '${savedAuth.model}' via ${provider.providerId} (${savedAuth.account_email})`,
    );
    return savedAuth;
  }

  /**
   * Direct programmatic token / API key login per model.
   * Conforms to Requirement #3: Allows multiple logins with different ID or email.
   */
  async loginWithCredentials(
    model: string,
    token: string,
    email?: string,
    authType: (typeof AuthType)[keyof typeof AuthType] = AuthType.API_KEY,
    clientIp?: string,
    id?: string,
  ): Promise<ModelAuth> {
    const provider = this.providerRegistry.getProvider(model);
    const resolvedAccountName = email
      ? email.split("@")[0]
      : config.getAccountName(model);

    const saved = await this.authRepository.saveModelAuth({
      id,
      model,
      auth_type: authType,
      account_email: email || config.getAccountEmail(model),
      account_name: resolvedAccountName,
      access_token: token,
      status: AuthStatusConstant.AUTHENTICATED,
      expires_at: new Date(
        Date.now() + TimeDurationMs.CREDENTIAL_DEFAULT_EXPIRY,
      ).toISOString(),
      metadata: {
        direct_auth: true,
        provider: provider.providerId,
        session_id: id,
      },
    });

    await provider.syncCredentials(saved);

    await this.auditRepository.logEvent({
      action: AuditAction.AUTH_DIRECT_LOGIN,
      client_ip: clientIp,
      model_used: model,
      status: CommonStatus.SUCCESS,
      details: {
        model,
        auth_type: authType,
        provider: provider.providerId,
        id: saved.id,
      },
    });

    return saved;
  }

  async saveApiKey(model: string, apiKey: string): Promise<ModelAuth> {
    return this.loginWithCredentials(
      model,
      apiKey,
      undefined,
      AuthType.API_KEY,
    );
  }

  /**
   * Logs out a specific model session, account email, or all authenticated models.
   * Conforms to Requirement #2: Logout is executed only when an active session exists.
   */
  async logout(
    options:
      | { model?: string; id?: string; account_email?: string; all?: boolean }
      | string = { all: true },
    clientIp?: string,
  ): Promise<{
    success: boolean;
    model?: string;
    count?: number;
    message: string;
  }> {
    const opts = typeof options === "string" ? { model: options } : options;
    const shouldLogoutAll = Boolean(opts.all) || opts.model === "all";

    if (shouldLogoutAll) {
      const count = await this.authRepository.deleteAllModelAuth();
      await this.clearAllCliCredentials();

      await this.auditRepository.logEvent({
        action: AuditAction.AUTH_LOGOUT_ALL,
        client_ip: clientIp,
        status: CommonStatus.SUCCESS,
        details: { count },
      });
      logger.info(
        "AUTH",
        `Logged out all authenticated models (total: ${count})`,
      );
      return {
        success: true,
        count,
        message:
          "All model connections and sessions have been logged out successfully.",
      };
    }

    let modelToClear = opts.model;
    if (opts.id && !modelToClear) {
      const existing = await this.authRepository.getModelAuthById?.(opts.id);
      if (existing) {
        modelToClear = existing.model;
      }
    }

    const target = opts.id
      ? { id: opts.id }
      : opts.account_email
        ? { model: opts.model, account_email: opts.account_email }
        : opts.model || "";

    const deleted = await this.authRepository.deleteModelAuth(target);

    // Actual CLI logout: if no active sessions remain for this model, purge CLI credentials.
    // Otherwise, sync the CLI with the remaining active session.
    if (modelToClear) {
      const allAuth = this.authRepository.listAllModelAuth
        ? await this.authRepository.listAllModelAuth()
        : [];
      const activeRemaining = allAuth.filter(
        (s) =>
          (s.model === modelToClear ||
            (modelToClear === "gemini-3.8-flash" &&
              (s.model === "default" || s.model === "*"))) &&
          s.status === AuthStatusConstant.AUTHENTICATED,
      );
      const provider = this.providerRegistry.getProvider(modelToClear);
      if (activeRemaining.length > 0) {
        await provider.syncCredentials(activeRemaining[0]);
        logger.info(
          "AUTH",
          `Active session remaining for model '${modelToClear}'. Synced CLI to session '${activeRemaining[0].session_id || activeRemaining[0].id}'`,
        );
      } else {
        await provider.clearCredentials();
        logger.info(
          "AUTH",
          `Zero active sessions remaining for model '${modelToClear}'. Full CLI logout executed.`,
        );
      }
    }

    await this.auditRepository.logEvent({
      action: AuditAction.AUTH_LOGOUT,
      client_ip: clientIp,
      model_used: opts.model,
      status: CommonStatus.SUCCESS,
      details: { target, deleted },
    });

    const targetDesc = opts.id
      ? `Session '${opts.id}'`
      : `Model '${opts.model || "target"}'`;
    logger.info("AUTH", `Logged out ${targetDesc} (deleted: ${deleted})`);
    return {
      success: true,
      model: opts.model,
      message: deleted
        ? `${targetDesc} has been logged out successfully.`
        : `${targetDesc} was not actively authenticated.`,
    };
  }

  async logoutAll(): Promise<{ success: boolean; message: string }> {
    const res = await this.logout({ all: true });
    return { success: res.success, message: res.message };
  }

  /**
   * Switches the active session for a model or CLI in the database.
   * Conforms to Requirement #2: Maintain multiple sessions and dynamic switching.
   */
  async switchSession(
    sessionId: string,
    model?: string,
    clientIp?: string,
  ): Promise<{
    success: boolean;
    active_session?: ModelAuth;
    message: string;
  }> {
    const active = await this.authRepository.setActiveSession(sessionId, model);
    if (!active) {
      return {
        success: false,
        message: `Session '${sessionId}' not found.`,
      };
    }

    await this.syncCliOAuth(active);

    await this.auditRepository.logEvent({
      action: AuditAction.AUTH_SESSION_SWITCH,
      client_ip: clientIp,
      model_used: active.model,
      status: CommonStatus.SUCCESS,
      details: {
        session_id: active.id,
        model: active.model,
        account_email: active.account_email,
        account_name: active.account_name,
      },
    });

    logger.info(
      "AUTH",
      `Switched active session for model '${active.model}' to session '${active.id}' (${active.account_email || active.account_name})`,
    );

    return {
      success: true,
      active_session: active,
      message: `Active session successfully switched to ${active.account_name || active.account_email || active.id} for model '${active.model}'.`,
    };
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
   * Retrieves overall, group-categorized, and per-model active sessions.
   * Conforms to Requirement #1 & #3:
   * 1. Models mention their category/group (Gemini, Grok, Ollama, etc.)
   * 2. Active sessions organized by group with multi-ID support
   */
  async getStatus(): Promise<AuthStatusResponse> {
    const activeAuthList: ModelAuth[] =
      await this.authRepository.listAllModelAuth();
    const defaultGeminiModel = config.geminiDefaultModel || "gemini-3.8-flash";

    // Group active sessions by model
    const sessionsByModel = new Map<string, ModelAuth[]>();
    for (const auth of activeAuthList) {
      const isDefault = auth.model === "default" || auth.model === "*";
      const effectiveModel = isDefault ? defaultGeminiModel : auth.model;

      const list = sessionsByModel.get(effectiveModel) || [];
      list.push(auth);
      sessionsByModel.set(effectiveModel, list);

      if (effectiveModel !== auth.model) {
        const origList = sessionsByModel.get(auth.model) || [];
        origList.push(auth);
        sessionsByModel.set(auth.model, origList);
      }
    }

    const modelsStatus: Record<string, any> = {};

    // Populate all known verified models (omit 'default' as an artificial model card)
    for (const m of KNOWN_MODELS) {
      if (m === "default" || (m as string) === "*") continue;
      const modelSessions = sessionsByModel.get(m) || [];
      const primaryAuth = modelSessions[0];
      const family = getModelFamily(m);

      modelsStatus[m] = {
        family,
        authenticated: modelSessions.some(
          (s) => s.status === AuthStatusConstant.AUTHENTICATED,
        ),
        auth_type: primaryAuth?.auth_type,
        account_email: primaryAuth?.account_email,
        expires_at: primaryAuth?.expires_at,
        status: primaryAuth
          ? primaryAuth.status
          : AuthStatusConstant.UNAUTHENTICATED,
        active_sessions: modelSessions.map((s, idx) => {
          const isDef = s.model === "default" || s.model === "*";
          const resolvedM = isDef ? defaultGeminiModel : s.model;
          const properName =
            s.account_name && s.account_name.trim()
              ? s.account_name.trim()
              : s.account_email
                ? s.account_email.split("@")[0]
                : "Active User";
          const isCurrentActive = Boolean(s.is_active ?? idx === 0);
          return {
            session_id: s.session_id || s.id,
            id: s.session_id || s.id,
            model: resolvedM,
            original_model: s.model,
            display_name: properName,
            display_model: isDef ? `${resolvedM} (Default Engine)` : resolvedM,
            family,
            auth_type: s.auth_type,
            account_email: s.account_email,
            account_name: s.account_name || properName,
            status: s.status,
            is_active: Boolean(s.is_active ?? true),
            is_current_active: isCurrentActive,
            login_state: "Active (Logged In)",
            login_date_time: s.created_timestamp,
            created_timestamp: s.created_timestamp,
          };
        }),
      };
    }

    // Include custom dynamic models
    for (const [m, modelSessions] of sessionsByModel.entries()) {
      if (m === "default" || m === "*") continue;
      if (!modelsStatus[m]) {
        const primaryAuth = modelSessions[0];
        const family = getModelFamily(m);
        modelsStatus[m] = {
          family,
          authenticated: modelSessions.some(
            (s) => s.status === AuthStatusConstant.AUTHENTICATED,
          ),
          auth_type: primaryAuth?.auth_type,
          account_email: primaryAuth?.account_email,
          expires_at: primaryAuth?.expires_at,
          status: primaryAuth
            ? primaryAuth.status
            : AuthStatusConstant.UNAUTHENTICATED,
          active_sessions: modelSessions.map((s, idx) => {
            const properName =
              s.account_name && s.account_name.trim()
                ? s.account_name.trim()
                : s.account_email
                  ? s.account_email.split("@")[0]
                  : "Active User";
            const isCurrentActive = Boolean(s.is_active ?? idx === 0);
            return {
              session_id: s.session_id || s.id,
              id: s.session_id || s.id,
              model: s.model,
              display_name: properName,
              display_model: s.model,
              family,
              auth_type: s.auth_type,
              account_email: s.account_email,
              account_name: s.account_name || properName,
              status: s.status,
              is_active: Boolean(s.is_active ?? true),
              is_current_active: isCurrentActive,
              login_state: "Active (Logged In)",
              login_date_time: s.created_timestamp,
              created_timestamp: s.created_timestamp,
            };
          }),
        };
      }
    }

    const overallAuthenticated = activeAuthList.some(
      (a: ModelAuth) => a.status === AuthStatusConstant.AUTHENTICATED,
    );

    const seenActiveModels = new Set<string>();
    const rootActiveSessions = activeAuthList
      .filter((a) => a.status === AuthStatusConstant.AUTHENTICATED)
      .map((s) => {
        const isDefault = s.model === "default" || s.model === "*";
        const resolvedModel = isDefault ? defaultGeminiModel : s.model;
        const resolvedFamily =
          isDefault && s.auth_type?.includes("google")
            ? ModelFamily.GEMINI
            : getModelFamily(resolvedModel);

        const properName =
          s.account_name && s.account_name.trim()
            ? s.account_name.trim()
            : s.account_email
              ? s.account_email.split("@")[0]
              : "Active User";

        const isCurrentActive =
          Boolean(s.is_active ?? false) || !seenActiveModels.has(resolvedModel);
        if (isCurrentActive) {
          seenActiveModels.add(resolvedModel);
        }

        return {
          session_id: s.session_id || s.id || "",
          id: s.session_id || s.id || "",
          model: resolvedModel,
          original_model: s.model,
          display_name: properName,
          display_model: isDefault
            ? `${resolvedModel} (Default Engine)`
            : resolvedModel,
          family: resolvedFamily,
          auth_type: s.auth_type,
          account_email: s.account_email || "Authenticated User",
          account_name: s.account_name || properName,
          status: s.status,
          is_active: Boolean(s.is_active ?? true),
          is_current_active: isCurrentActive,
          login_state: "Active (Logged In)",
          login_date_time: s.created_timestamp,
          created_timestamp: s.created_timestamp,
        };
      });

    return {
      overall_authenticated: overallAuthenticated,
      global_authenticated: overallAuthenticated,
      models: modelsStatus,
      active_sessions: rootActiveSessions,
    };
  }
}

export const authService = new AuthService();
