import { systemFacade } from "@/core/utils/system/systemFacade.js";
import { logger } from "@/core/observability/logging/logger.js";
import { hostBrowserLauncher } from "@/core/utils/browser/browserLauncher.js";
import {
  TimeDurationMs,
  ModelCatalog,
  AuthStatusConstant,
  AuthType,
} from "@/domain/constants/index.js";
import type { ModelAuth } from "@/domain/index.js";
import type { IAuthRepository } from "@/repositories/authRepository.js";
import type {
  IOAuthProvider,
  InitiateAuthRequest,
  InitiateAuthResult,
  AuthCallbackRequest,
  OAuthTokenResult,
} from "@/core/adapters/auth/oauth/iOAuthProvider.js";

export interface PendingOAuthState {
  readonly model: string;
  readonly timestamp: number;
  readonly codeVerifier?: string;
  readonly redirectUri: string;
}

/**
 * Abstract Base Class for OAuth & Authentication Providers.
 * Implements Template Method pattern and encapsulates PKCE + state tracking.
 *
 * Conforms to:
 * - STD-COD-005: SOLID Principles & Template Method Pattern
 * - STD-COD-006: Complexity Bounds
 */
export abstract class BaseOAuthProvider implements IOAuthProvider {
  public abstract readonly providerId: string;
  protected readonly pendingStates = new Map<string, PendingOAuthState>();

  public abstract supports(modelOrProvider: string): boolean;
  protected abstract getAuthUrl(
    state: string,
    codeChallenge: string,
    redirectUri: string,
  ): string;
  protected abstract exchangeTokens(
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<OAuthTokenResult>;
  protected abstract getAuthType(): (typeof AuthType)[keyof typeof AuthType];

  public async initiateAuth(
    request: InitiateAuthRequest,
  ): Promise<InitiateAuthResult> {
    const { model, launchBrowser, redirectUriOverride } = request;
    const state = systemFacade.crypto.randomHex(16);
    const codeVerifier = systemFacade.crypto.randomBase64Url(32);
    const codeChallenge = systemFacade.crypto.sha256Base64Url(codeVerifier);
    const redirectUri = this.resolveRedirectUri(redirectUriOverride);

    this.trackPendingState(state, {
      model,
      timestamp: Date.now(),
      codeVerifier,
      redirectUri,
    });

    const authUrl = this.getAuthUrl(state, codeChallenge, redirectUri);
    let browserLaunched = false;
    if (launchBrowser) {
      browserLaunched = await hostBrowserLauncher.launch(authUrl);
    }

    logger.info(
      `AUTH_${this.providerId.toUpperCase()}`,
      `Initiated OAuth for '${model}' (browser: ${browserLaunched})`,
    );

    return {
      auth_url: authUrl,
      oauth_url: authUrl,
      state,
      model,
      browser_launched: browserLaunched,
      message: browserLaunched
        ? `Browser launched automatically to authenticate with ${this.providerId}.`
        : `Open the auth_url in your browser to complete ${this.providerId} authentication.`,
      code_verifier: codeVerifier,
      provider: this.providerId,
    };
  }

  public async handleCallback(
    request: AuthCallbackRequest,
    authRepository: IAuthRepository,
  ): Promise<ModelAuth> {
    const { code, state, manualCodeVerifier, redirectUriOverride } = request;
    const pending = state ? this.pendingStates.get(state) : undefined;
    const model = request.model || pending?.model || ModelCatalog.DEFAULT;
    const redirectUri =
      redirectUriOverride || pending?.redirectUri || this.resolveRedirectUri();
    const codeVerifier = manualCodeVerifier || pending?.codeVerifier;

    if (state && pending) {
      this.pendingStates.delete(state);
    }

    // Network exchange boundary: purely HTTP, zero DB connection held
    const tokens = await this.exchangeTokens(code, redirectUri, codeVerifier);

    // Persistence boundary: saves credentials to database repository
    const saved = await authRepository.saveModelAuth({
      model,
      auth_type: this.getAuthType(),
      account_email: tokens.accountEmail,
      account_name: tokens.accountName,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: new Date(
        Date.now() + TimeDurationMs.OAUTH_TOKEN_DEFAULT_EXPIRY,
      ).toISOString(),
      metadata: { code_exchange: true, auth_provider: this.providerId },
      status: AuthStatusConstant.AUTHENTICATED,
    });

    await this.syncCredentials(saved);
    return saved;
  }

  public abstract syncCredentials(auth: ModelAuth): Promise<void>;
  public abstract clearCredentials(): Promise<void>;

  protected resolveRedirectUri(override?: string): string {
    return override || "http://127.0.0.1:8090/api/v1/auth/callback";
  }

  protected trackPendingState(state: string, data: PendingOAuthState): void {
    this.pendingStates.set(state, data);

    const expiryThreshold = Date.now() - TimeDurationMs.PENDING_STATE_EXPIRY;
    for (const [s, val] of this.pendingStates.entries()) {
      if (val.timestamp < expiryThreshold) {
        this.pendingStates.delete(s);
      }
    }
    if (this.pendingStates.size > 1000) {
      const oldestKey = this.pendingStates.keys().next().value;
      if (oldestKey) this.pendingStates.delete(oldestKey);
    }
  }
}
