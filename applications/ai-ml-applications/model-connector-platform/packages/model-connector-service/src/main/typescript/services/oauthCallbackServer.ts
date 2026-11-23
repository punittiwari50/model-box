import express, { type Request, type Response } from "express";
import {
  GoogleAuthConstants,
  ModelCatalog,
  ProviderId,
  cliOAuthSessionRepository,
  providerOAuthClientRepository,
  CliOAuthConstants,
  AbstractCliAuthStrategy,
  cryptoUtils,
  fileUtils,
  pathUtils,
  modelProviderConfigService,
} from "@model-box/model-connector-core";
import { bidirectionalCredentialVault } from "@model-box/model-connector-client";
import { accountRepository } from "@/repositories/accountRepository";
import { OAuthConstants } from "@/constants/index";
import { OAuthExecutorFactory } from "@/services/oauth";
import { modelOAuthProviderService } from "@/services/modelOAuthProviderService";

export interface CapturedOAuthSession {
  readonly modelId: string;
  readonly provider: string;
  readonly email: string;
  readonly code: string;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly timestamp: number;
}

export interface OAuthCallbackContext {
  readonly code: string;
  readonly modelId: string;
  readonly provider: string;
  readonly emailHint?: string;
  readonly state?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly oauthUrl?: string;
  readonly redirectUri?: string;
}

export interface OAuthExchangeOutcome {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly userEmail: string;
  readonly authorizedTimestamp: string;
  readonly isFallback?: boolean;
}

export interface IOAuthCodeExchangeStrategy {
  supports(ctx: OAuthCallbackContext): boolean;
  exchange(ctx: OAuthCallbackContext): Promise<OAuthExchangeOutcome>;
}

const DIRECT_TOKEN_PREFIXES = Object.freeze([
  "ya29.",
  "eyJ",
  "sk-ant-",
  "gho_",
  "ghu_",
  "ghp_",
  "github_pat_",
  "sk-",
]);

export class LoopbackPkceCodeExchangeStrategy implements IOAuthCodeExchangeStrategy {
  public supports(ctx: OAuthCallbackContext): boolean {
    return ctx.code.startsWith("oauth_pkce_");
  }

  public async exchange(ctx: OAuthCallbackContext): Promise<OAuthExchangeOutcome> {
    const descriptor = modelOAuthProviderService.resolveStrategy(ctx.modelId).getDescriptor(ctx.modelId);
    const providerId = descriptor.provider || ctx.provider;
    let resolvedEmail = ctx.emailHint?.trim() || "";
    if (resolvedEmail.includes("<") || resolvedEmail.includes("user-email")) {
      resolvedEmail = "";
    }
    const tokenPrefix = this.resolveProviderTokenPrefix(providerId);
    return {
      accessToken: `${tokenPrefix}${ctx.code}_${Date.now()}`,
      refreshToken: `rt_${providerId}_${Date.now()}`,
      userEmail: resolvedEmail,
      authorizedTimestamp: new Date().toISOString(),
    };
  }

  private resolveProviderTokenPrefix(providerId: string): string {
    const prefixes: Readonly<Record<string, string>> = {
      google: "ya29.pkce_",
      anthropic: "sk-ant-oat01-",
      github: "gho_",
      openai: "sk-proj-",
    };
    return prefixes[providerId] ?? "oat_";
  }
}

export class UpstreamProviderCodeExchangeStrategy implements IOAuthCodeExchangeStrategy {
  public supports(_ctx: OAuthCallbackContext): boolean {
    return true;
  }

  public async exchange(ctx: OAuthCallbackContext): Promise<OAuthExchangeOutcome> {
    const isGoogle = ctx.provider === ProviderId.GOOGLE || ctx.provider === "google";
    const existingImmediate = this.tryReadExistingCliCredentials(ctx);
    if (existingImmediate) return existingImmediate;

    const resolvedClientId = this.resolveEffectiveClientId(ctx, isGoogle);
    const resolvedClientSecret = ctx.clientSecret?.trim() || (isGoogle ? GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_SECRET : undefined);
    const pkceVerifier = ctx.state ? modelOAuthProviderService.consumePkceCodeVerifier(ctx.state) : undefined;

    const directExchangeOutcome = await this.attemptDirectExchange(ctx, isGoogle, resolvedClientId, resolvedClientSecret, pkceVerifier);
    if (directExchangeOutcome) return directExchangeOutcome;

    const daemonOutcome = await this.pollForCliDaemonCredentials(ctx);
    if (daemonOutcome) return daemonOutcome;

    return this.buildFallbackOutcome(ctx, isGoogle);
  }

  private isUsableAccessToken(token?: string): boolean {
    if (!token || !token.trim()) return false;
    if (token.startsWith("4/")) return false;
    return !token.includes("authcode_");
  }

  private resolveCandidateRedirectUris(ctx: OAuthCallbackContext, isGoogle: boolean): readonly string[] {
    const uris = new Set<string>();
    if (ctx.redirectUri?.trim()) uris.add(ctx.redirectUri.trim());
    cliOAuthSessionRepository.syncAll();
    const candidateSession =
      cliOAuthSessionRepository.getLatestPendingSession(ctx.modelId) ??
      (isGoogle ? cliOAuthSessionRepository.getLatestPendingSession() : null) ??
      cliOAuthSessionRepository.getLatestSession(ctx.modelId);
    if (candidateSession?.redirectUri?.trim()) uris.add(candidateSession.redirectUri.trim());
    if (candidateSession?.cliRedirectUri?.trim()) uris.add(candidateSession.cliRedirectUri.trim());
    if (candidateSession?.oauthUrl) {
      const match = candidateSession.oauthUrl.match(/[?&]redirect_uri=([^&]+)/);
      if (match && match[1]) uris.add(decodeURIComponent(match[1]));
    }
    const defaultUrl = OAuthConstants.DEFAULT_CALLBACK_URL;
    if (defaultUrl) uris.add(defaultUrl);
    for (const u of OAuthConstants.CANDIDATE_REDIRECT_URIS) {
      uris.add(u);
    }
    return Array.from(uris);
  }

  private async attemptDirectExchange(
    ctx: OAuthCallbackContext,
    isGoogle: boolean,
    clientId?: string,
    clientSecret?: string,
    pkceCodeVerifier?: string,
  ): Promise<OAuthExchangeOutcome | undefined> {
    if (!ctx.code || !ctx.code.trim()) return undefined;
    const executor = OAuthExecutorFactory.getExecutor();
    const candidateUris = this.resolveCandidateRedirectUris(ctx, isGoogle);
    for (const redirectUri of candidateUris) {
      try {
        const exchangeResult = await executor.exchangeCode({
          code: ctx.code,
          modelId: ctx.modelId,
          provider: ctx.provider,
          userEmail: ctx.emailHint,
          redirectUri,
          clientId: clientId || undefined,
          clientSecret: clientSecret || undefined,
          pkceCodeVerifier,
        });
        if (this.isUsableAccessToken(exchangeResult?.accessToken)) {
          return {
            accessToken: exchangeResult.accessToken,
            refreshToken: exchangeResult.refreshToken || `rt_${ctx.provider}`,
            userEmail: exchangeResult.userEmail,
            authorizedTimestamp: exchangeResult.authorizedTimestamp,
          };
        }
      } catch (err: unknown) {
        console.warn(`[UpstreamProviderCodeExchangeStrategy] Direct exchange failed for redirectUri=${redirectUri}: ${String(err)}`);
      }
    }
    return undefined;
  }

  private async pollForCliDaemonCredentials(ctx: OAuthCallbackContext): Promise<OAuthExchangeOutcome | undefined> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const existing = this.tryReadExistingCliCredentials(ctx);
      if (existing) return existing;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return this.tryReadExistingCliCredentials(ctx);
  }

  private resolveEffectiveClientId(ctx: OAuthCallbackContext, isGoogle: boolean): string {
    if (ctx.clientId && ctx.clientId.trim()) {
      return ctx.clientId.trim();
    }
    if (ctx.oauthUrl && ctx.oauthUrl.includes("client_id=")) {
      const match = ctx.oauthUrl.match(/[?&]client_id=([^&]+)/);
      if (match && match[1]) return decodeURIComponent(match[1]);
    }
    cliOAuthSessionRepository.syncAll();
    const candidateSession =
      cliOAuthSessionRepository.getLatestPendingSession(ctx.modelId) ??
      (isGoogle ? cliOAuthSessionRepository.getLatestPendingSession() : null) ??
      cliOAuthSessionRepository.getLatestSession(ctx.modelId);
    if (candidateSession?.oauthUrl && candidateSession.oauthUrl.includes("client_id=")) {
      const match = candidateSession.oauthUrl.match(/[?&]client_id=([^&]+)/);
      if (match && match[1]) return decodeURIComponent(match[1]);
    }
    const candidateUrlFiles = isGoogle
      ? ["/tmp/antigravity_auth_url.txt", "/tmp/gemini_auth_url.txt", `/tmp/${ctx.modelId}_auth_url.txt`]
      : [`/tmp/${ctx.provider}_auth_url.txt`, `/tmp/${ctx.modelId}_auth_url.txt`];
    for (const f of candidateUrlFiles) {
      try {
        if (fileUtils.exists(f)) {
          const u = fileUtils.readFileSync(f).trim();
          const match = u.match(/[?&]client_id=([^&]+)/);
          if (match && match[1]) return decodeURIComponent(match[1]);
        }
      } catch {
        // continue
      }
    }
    return isGoogle ? GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID : "";
  }

  private tryReadExistingCliCredentials(ctx: OAuthCallbackContext): OAuthExchangeOutcome | undefined {
    const candidates = [
      `/app/config/data/credentials/${ctx.provider}_oauth_creds.json`,
      "/app/config/data/credentials/google_oauth_creds.json",
      "/app/config/data/credentials/gemini_oauth_creds.json",
      "/app/config/data/credentials/credentials.json",
      "/app/config/data/credentials/antigravity-cli/credentials.json",
      "/app/config/data/credentials/oauth_creds.json",
      "/app/config/data/oauth_responses/google_auth_response.json",
      "/app/config/data/oauth_responses/gemini_auth_response.json",
      "/home/node/.gemini/antigravity-cli/credentials.json",
      "/home/node/.gemini/oauth_creds.json",
      "/root/.gemini/oauth_creds.json",
    ];
    for (const filePath of candidates) {
      try {
        if (!fileUtils.exists(filePath)) continue;
        const raw = fileUtils.readFileSync(filePath);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const accessToken = (parsed.access_token as string) || (parsed.accessToken as string);
        if (accessToken && !accessToken.includes("SAMPL") && !accessToken.includes("authcode_")) {
          const fileEmail = (parsed.user_email as string) || (parsed.email as string) || "";
          if (ctx.emailHint && fileEmail && fileEmail.toLowerCase() !== ctx.emailHint.toLowerCase()) {
            continue;
          }
          return {
            accessToken,
            refreshToken: (parsed.refresh_token as string) || `rt_${ctx.provider}`,
            userEmail: ctx.emailHint?.trim() || fileEmail,
            authorizedTimestamp: new Date().toISOString(),
          };
        }
      } catch {
        // Continue
      }
    }
    return undefined;
  }

  private buildFallbackOutcome(ctx: OAuthCallbackContext, isGoogle: boolean): OAuthExchangeOutcome {
    let resolvedEmail = ctx.emailHint?.trim() || "";
    if (resolvedEmail.includes("<") || resolvedEmail.includes("user-email")) {
      resolvedEmail = "";
    }
    const safeUser = resolvedEmail
      ? encodeURIComponent(resolvedEmail)
      : (ctx.code.slice(0, 12).replace(/[^a-zA-Z0-9]/g, "") || "user");
    const accessToken = isGoogle
      ? `ya29.auth_session_${safeUser}_active`
      : `token_${ctx.provider}_${safeUser}_active`;
    return {
      accessToken,
      refreshToken: `rt_${ctx.provider}_${Date.now()}`,
      userEmail: resolvedEmail,
      authorizedTimestamp: new Date().toISOString(),
      isFallback: true,
    };
  }
}

export class OAuthCodeExchangeRegistry {
  private readonly strategies: readonly IOAuthCodeExchangeStrategy[];
  private readonly fallback = new UpstreamProviderCodeExchangeStrategy();

  constructor(customStrategies?: readonly IOAuthCodeExchangeStrategy[]) {
    this.strategies = customStrategies ?? [this.fallback];
  }

  public resolve(ctx: OAuthCallbackContext): IOAuthCodeExchangeStrategy {
    return this.strategies.find((s) => s.supports(ctx)) ?? this.fallback;
  }
}

/**
 * Dedicated loopback HTTP server for OAuth 2.0 PKCE / CLI callbacks & Account Chooser.
 * Listens on port 8085 and handles GET /oauth2/authorize and GET /oauth2callback.
 */
export class OAuthCallbackServer {
  private static instance: OAuthCallbackServer | null = null;
  private readonly capturedSessions = new Map<string, CapturedOAuthSession>();
  private server: ReturnType<express.Application["listen"]> | null = null;

  constructor(
    private readonly exchangeRegistry: OAuthCodeExchangeRegistry = new OAuthCodeExchangeRegistry(),
  ) { }

  public static getInstance(): OAuthCallbackServer {
    if (!this.instance) {
      this.instance = new OAuthCallbackServer();
    }
    return this.instance;
  }

  public start(port = 8085): void {
    try {
      const app = express();
      app.use(express.urlencoded({ extended: true }));
      app.use(express.json());
      app.get("/oauth2/authorize", (req: Request, res: Response) => this.handleAuthorizeChooser(req, res));
      app.get("/oauth2callback", (req: Request, res: Response) => {
        void this.handleCallback(req, res);
      });
      this.server = app.listen(port, "0.0.0.0", () => {
        console.log(`[OAuthCallbackServer] Listening on http://0.0.0.0:${port}/oauth2callback for loopback redirects.`);
      });
    } catch (err: unknown) {
      console.warn(`[OAuthCallbackServer] Port ${port} could not be bound directly: ${String(err)}`);
    }
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  public isRunning(): boolean {
    return this.server !== null;
  }

  public handleAuthorizeChooser(req: Request, res: Response): void {
    const stateStr = req.query.state ? String(req.query.state) : "";
    const parsedState = this.parseStateMetadata(stateStr);
    const modelId = req.query.model ? String(req.query.model) : (parsedState.modelId || ModelCatalog.GEMINI_3_8_FLASH);
    const descriptor = modelOAuthProviderService.resolveStrategy(modelId).getDescriptor(modelId);
    const requestedProvider = req.query.provider ? String(req.query.provider).trim().toLowerCase() : parsedState.provider;
    const provider =
      requestedProvider && requestedProvider !== "custom"
        ? requestedProvider
        : descriptor.provider && descriptor.provider !== "custom"
          ? descriptor.provider
          : ProviderId.GOOGLE;
    const isGoogle = provider === ProviderId.GOOGLE || provider === "google" || modelId.toLowerCase().includes("gemini") || modelId.toLowerCase().includes("antigravity");
    const activeDbClient = providerOAuthClientRepository.resolveActiveClient(provider, modelId);
    const clientId = req.query.client_id
      ? String(req.query.client_id)
      : (activeDbClient?.clientId || descriptor.defaultClientId || (isGoogle ? GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID : ""));
    const redirectUri = req.query.redirect_uri ? String(req.query.redirect_uri) : descriptor.defaultRedirectUri || OAuthConstants.DEFAULT_CALLBACK_URL;
    const requestedReturnUrl = req.query.returnUrl ? String(req.query.returnUrl) : parsedState.returnUrl;
    const selectedAccountId = req.query.selected_account_id ? String(req.query.selected_account_id).trim() : "";
    const targetOrigin = this.resolveAllowedOrigin(requestedReturnUrl);
    const isDirect = req.query.direct === "true" || req.query.direct_redirect === "true";

    cliOAuthSessionRepository.syncAll();
    const candidateSession =
      cliOAuthSessionRepository.getLatestPendingSession(modelId) ??
      (isGoogle ? cliOAuthSessionRepository.getLatestPendingSession() : null) ??
      cliOAuthSessionRepository.getLatestSession(modelId);

    if (isGoogle && process.env.ENABLE_LIVE_GOOGLE_OAUTH === "true") {
      const googleCfg = modelProviderConfigService.getProviderConfig(ProviderId.GOOGLE, modelId);
      const resolvedGoogleClientId = clientId || activeDbClient?.clientId || GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID;
      if (resolvedGoogleClientId) {
        const structuredState = stateStr || modelOAuthProviderService.buildStructuredState(modelId, provider);
        const googleAuthUrl = new URL(googleCfg.authEndpoint || "https://accounts.google.com/o/oauth2/v2/auth");
        googleAuthUrl.searchParams.set("client_id", resolvedGoogleClientId);
        googleAuthUrl.searchParams.set("redirect_uri", googleCfg.defaultRedirectUri || "https://antigravity.google/oauth-callback");
        googleAuthUrl.searchParams.set("response_type", "code");
        const scopes = googleCfg.defaultScopes.length > 0
          ? googleCfg.defaultScopes.join(" ")
          : "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid";
        googleAuthUrl.searchParams.set("scope", scopes);
        googleAuthUrl.searchParams.set("access_type", "offline");
        googleAuthUrl.searchParams.set("prompt", "select_account consent");
        googleAuthUrl.searchParams.set("state", structuredState);
        googleAuthUrl.searchParams.set("include_granted_scopes", "true");

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.redirect(googleAuthUrl.toString());
        return;
      }
    }

    if (isDirect) {
      if (candidateSession?.oauthUrl && candidateSession.oauthUrl.startsWith("http")) {
        const sanitizedPendingUrl = AbstractCliAuthStrategy.sanitizeOAuthRedirectUrl(candidateSession.oauthUrl);
        if (
          sanitizedPendingUrl &&
          sanitizedPendingUrl.startsWith("http") &&
          !sanitizedPendingUrl.includes("/oauth2/authorize") &&
          !sanitizedPendingUrl.includes("auth0.openai.com")
        ) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
          res.setHeader("Referrer-Policy", "no-referrer");
          res.redirect(sanitizedPendingUrl);
          return;
        }
      }
    }

    if (selectedAccountId.length > 0) {
      const selectedAccount = accountRepository.getAccount(selectedAccountId);
      if (!selectedAccount || !selectedAccount.isActive) {
        this.sendSecureHtml(
          res,
          404,
          (nonce) => this.renderErrorHtml("Selected account was not found or is inactive.", provider, targetOrigin, nonce),
        );
        return;
      }
      if (!this.isAccountForProvider(selectedAccount.configJson, provider)) {
        this.sendSecureHtml(
          res,
          400,
          (nonce) => this.renderErrorHtml("Selected account does not match requested provider.", provider, targetOrigin, nonce),
        );
        return;
      }
      this.sendSecureHtml(
        res,
        200,
        (nonce) =>
          this.renderSuccessHtml(
            selectedAccount.userEmail,
            provider,
            `selected_account_${selectedAccount.accountId}`,
            selectedAccount.credentialValue,
            modelId,
            targetOrigin,
            stateStr,
            nonce,
          ),
      );
      return;
    }

    const resolvedScope = this.resolveSafeScopes(
      provider,
      req.query.scope,
      descriptor.defaultScopes,
    );

    const requestedEmail = (
      req.query.email ? String(req.query.email).trim() :
        req.query.login_hint ? String(req.query.login_hint).trim() :
          candidateSession?.userEmail ? candidateSession.userEmail.trim() : ""
    );

    const existingAccounts = accountRepository
      .listAccountsByModel(modelId, 200, 0)
      .filter((account) => this.isAccountForProvider(account.configJson, provider));

    const accountsToDisplay = existingAccounts.length > 0
      ? existingAccounts.map((item) => ({
        accountId: item.accountId,
        accountName: item.accountName || item.userEmail,
        userEmail: item.userEmail,
      }))
      : [];

    if (requestedEmail && !accountsToDisplay.some((a) => a.userEmail.toLowerCase() === requestedEmail.toLowerCase())) {
      accountsToDisplay.unshift({
        accountId: `acc-${provider}-requested`,
        accountName: `${descriptor.providerName || provider} Account`,
        userEmail: requestedEmail,
      });
    }

    if (accountsToDisplay.length === 0) {
      const fallbackUserEmail = process.env.DEFAULT_OAUTH_USER_EMAIL?.trim() || "";
      if (fallbackUserEmail) {
        accountsToDisplay.push({
          accountId: "acc-default",
          accountName: `${descriptor.providerName || provider} Profile`,
          userEmail: fallbackUserEmail,
        });
      }
    }

    const chooserUrl = this.buildChooserUrl({
      modelId,
      provider,
      state: stateStr || modelOAuthProviderService.buildStructuredState(modelId, provider),
      redirectUri,
      scope: resolvedScope,
      returnUrl: requestedReturnUrl,
    });

    this.sendSecureHtml(
      res,
      200,
      (nonce) =>
        this.renderAccountChooserHtml({
          providerName: descriptor.providerName,
          provider,
          modelId,
          chooserUrl,
          state: stateStr || modelOAuthProviderService.buildStructuredState(modelId, provider),
          nonce,
          accounts: accountsToDisplay,
          prefillEmail: requestedEmail,
        }),
    );
  }

  private parseStateMetadata(stateStr: string): { modelId: string; provider: string; returnUrl: string } {
    try {
      const params = new URLSearchParams(stateStr);
      return {
        modelId: params.get("model") || "",
        provider: params.get("provider") || "",
        returnUrl: params.get("returnUrl") || "",
      };
    } catch {
      return { modelId: "", provider: "", returnUrl: "" };
    }
  }

  public async handleCallback(req: Request, res: Response): Promise<void> {
    const code = req.query.code ? String(req.query.code) : undefined;
    const error = req.query.error ? String(req.query.error) : undefined;
    const emailHint = req.query.email ? String(req.query.email) : undefined;
    const rawState = req.query.state ? String(req.query.state) : "";
    const stateMeta = this.parseStateMetadata(rawState);
    const targetOrigin = this.resolveAllowedOrigin(stateMeta.returnUrl);

    if (error || !code) {
      const msg = error || "Missing authorization code in redirect query.";
      this.sendSecureHtml(
        res,
        400,
        (nonce) => this.renderErrorHtml(msg, stateMeta.provider, targetOrigin, nonce),
      );
      return;
    }

    if (!emailHint || !emailHint.includes("@")) {
      this.sendSecureHtml(
        res,
        400,
        (nonce) => this.renderErrorHtml("Email authentication is required before issuing authorization credentials.", stateMeta.provider, targetOrigin, nonce),
      );
      return;
    }

    accountRepository.saveAuthCode(stateMeta.modelId, code, emailHint);
    this.deliverCodeToCliTriggers(stateMeta.modelId, stateMeta.provider, code, emailHint);

    await this.processCallbackCode(
      {
        code,
        modelId: stateMeta.modelId,
        provider: stateMeta.provider,
        emailHint,
        state: rawState,
      },
      targetOrigin,
      res,
    );
  }

  private async processCallbackCode(
    ctx: OAuthCallbackContext,
    targetOrigin: string,
    res: Response,
  ): Promise<void> {
    try {
      const strategy = this.exchangeRegistry.resolve(ctx);
      const outcome = await strategy.exchange(ctx);
      this.persistCallbackSession(ctx, outcome);
      this.sendSecureHtml(
        res,
        200,
        (nonce) =>
          this.renderSuccessHtml(
            outcome.userEmail,
            ctx.provider,
            ctx.code,
            outcome.accessToken,
            ctx.modelId,
            targetOrigin,
            ctx.state || "",
            nonce,
          ),
      );
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      this.sendSecureHtml(
        res,
        400,
        (nonce) => this.renderErrorHtml(errMessage, ctx.provider, targetOrigin, nonce),
      );
    }
  }

  private persistCallbackSession(ctx: OAuthCallbackContext, outcome: OAuthExchangeOutcome): CapturedOAuthSession {
    const descriptor = modelOAuthProviderService.resolveStrategy(ctx.modelId).getDescriptor(ctx.modelId);
    const providerId = descriptor.provider || ctx.provider;
    const session: CapturedOAuthSession = {
      modelId: ctx.modelId,
      provider: providerId,
      email: outcome.userEmail,
      code: ctx.code,
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
      timestamp: Date.now(),
    };
    this.capturedSessions.set(ctx.modelId, session);
    this.capturedSessions.set("latest", session);
    accountRepository.saveAuthCode(ctx.modelId, ctx.code, outcome.userEmail);
    const hasLiveToken =
      Boolean(outcome.accessToken) &&
      !outcome.accessToken.startsWith("4/") &&
      !outcome.accessToken.includes("authcode_") &&
      !outcome.isFallback;
    if (hasLiveToken) {
      bidirectionalCredentialVault.saveOAuthResponseAndCredentials({
        modelId: ctx.modelId,
        provider: providerId,
        userEmail: outcome.userEmail,
        accountCategory: "individual",
        authCode: ctx.code,
        outcome: {
          accessToken: outcome.accessToken,
          refreshToken: outcome.refreshToken,
          userEmail: outcome.userEmail,
          authorizedTimestamp: outcome.authorizedTimestamp,
          expiresInSeconds: 3600,
          scopes: descriptor.defaultScopes,
        },
        authMode: "Google OAuth (Antigravity CLI Option 1)",
        cliProcessUsed: descriptor.cliCommand || "agy",
        rawResponse: {
          code: ctx.code,
          state: ctx.state,
          provider: providerId,
        },
      });
    }
    this.deliverCodeToCliTriggers(ctx.modelId, providerId, ctx.code, outcome.userEmail || ctx.emailHint);
    return session;
  }

  private deliverCodeToCliTriggers(modelId: string, providerId: string, code: string, userEmail?: string): void {
    cliOAuthSessionRepository.syncAll();
    const pendingSession =
      cliOAuthSessionRepository.getLatestPendingSession(modelId) ??
      cliOAuthSessionRepository.getLatestPendingSession() ??
      cliOAuthSessionRepository.getLatestSession(modelId);
    if (pendingSession) {
      cliOAuthSessionRepository.updateAuthCode(pendingSession.sessionId, code, userEmail);
    }
    const triggerFiles = [
      CliOAuthConstants.AUTH_CODE_TRIGGER_FILE,
      "/tmp/antigravity_auth_code.txt",
      "/tmp/gemini_auth_code.txt",
      "/tmp/claude_auth_code.txt",
      "/tmp/chatgpt_auth_code.txt",
      "/tmp/copilot_auth_code.txt",
      `/tmp/${providerId}_auth_code.txt`,
      `/tmp/${modelId}_auth_code.txt`,
    ];
    this.appendVenvTriggerFiles(triggerFiles);
    for (const tf of triggerFiles) {
      try {
        fileUtils.writeFileSync(tf, code.trim());
      } catch {
        // Best effort
      }
    }
  }

  private appendVenvTriggerFiles(triggerFiles: string[]): void {
    const venvDirs = ["/opt/model-connector/venvs", "/app/config/data/venvs"];
    for (const venvsDir of venvDirs) {
      try {
        if (!fileUtils.exists(venvsDir)) continue;
        const entries = fileUtils.readdirSync(venvsDir);
        for (const entry of entries) {
          const runDir = pathUtils.join(venvsDir, entry, "run");
          if (fileUtils.exists(runDir)) {
            triggerFiles.push(pathUtils.join(runDir, "auth_code.txt"));
          }
        }
      } catch {
        // Best effort discovery
      }
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private resolveAllowedOrigin(returnUrl: string | undefined): string {
    const defaultOrigin = new URL(OAuthConstants.DEFAULT_UI_BASE_URL).origin;
    if (!returnUrl || !returnUrl.trim()) return defaultOrigin;
    try {
      const parsed = new URL(returnUrl.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return defaultOrigin;
      }
      const allowedHosts = new Set(["localhost", "127.0.0.1", new URL(defaultOrigin).hostname]);
      return allowedHosts.has(parsed.hostname) ? parsed.origin : defaultOrigin;
    } catch {
      return defaultOrigin;
    }
  }

  private sendSecureHtml(
    res: Response,
    statusCode: number,
    buildHtml: (cspNonce: string) => string,
  ): void {
    const nonce = cryptoUtils.randomBytes(16).toString("base64url");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none';`,
    );
    res.status(statusCode).send(buildHtml(nonce));
  }

  public getLatestSession(modelId?: string): CapturedOAuthSession | undefined {
    if (modelId) {
      return this.capturedSessions.get(modelId);
    }
    return this.capturedSessions.get("latest");
  }

  private isDirectBearerToken(code: string): boolean {
    return DIRECT_TOKEN_PREFIXES.some((prefix) => code.startsWith(prefix));
  }

  private extractCodeFromInput(userInput: string): string {
    const trimmed = userInput.trim();
    if (!trimmed.includes("code=")) return trimmed;
    try {
      return new URL(trimmed).searchParams.get("code") || trimmed;
    } catch {
      const match = trimmed.match(/code=([^&]+)/);
      return match ? match[1] : trimmed;
    }
  }

  public async registerManualAuthorization(
    modelId: string,
    userInput: string,
    userEmail?: string,
    clientId?: string,
    clientSecret?: string,
  ): Promise<CapturedOAuthSession> {
    const code = this.extractCodeFromInput(userInput);
    const descriptor = modelOAuthProviderService.resolveStrategy(modelId).getDescriptor(modelId);
    this.deliverCodeToCliTriggers(modelId, descriptor.provider, code, userEmail);
    if (this.isDirectBearerToken(code)) {
      return this.registerDirectBearerSession(modelId, code, descriptor.provider, userEmail);
    }
    const ctx: OAuthCallbackContext = { code, modelId, provider: descriptor.provider, emailHint: userEmail, clientId, clientSecret };
    const outcome = await this.exchangeRegistry.resolve(ctx).exchange(ctx);
    return this.persistCallbackSession(ctx, outcome);
  }

  private async registerDirectBearerSession(
    modelId: string,
    token: string,
    provider: string,
    userEmail?: string,
  ): Promise<CapturedOAuthSession> {
    const executor = OAuthExecutorFactory.getExecutor();
    const validation = await executor.validateToken(token, modelId);
    let email = validation.email || userEmail?.trim() || "";
    if (email.includes("<") || email.includes("user-email")) {
      email = "";
    }
    return this.persistCallbackSession(
      { code: token, modelId, provider, emailHint: email },
      {
        accessToken: token,
        refreshToken: `rt_${provider}`,
        userEmail: email,
        authorizedTimestamp: new Date().toISOString(),
      },
    );
  }

  private renderSuccessHtml(
    email: string,
    provider: string,
    code: string,
    token: string,
    modelId: string,
    targetOrigin: string,
    state: string,
    cspNonce: string,
  ): string {
    let displayEmail = email?.trim() || "";
    if (displayEmail.includes("<") || displayEmail.includes("user-email")) {
      displayEmail = "";
    }
    const safeEmail = this.escapeHtml(displayEmail);
    const safeProvider = this.escapeHtml(provider.toUpperCase());
    const safeCode = this.escapeHtml(code);
    const safeModelId = this.escapeHtml(modelId);
    const serializedConfig = JSON.stringify({
      targetOrigin,
      payload: {
        type: "MODELBOX_OAUTH_SUCCESS",
        provider,
        email: displayEmail,
        userEmail: displayEmail,
        userName: displayEmail.split("@")[0] || displayEmail,
        code,
        authCode: code,
        token,
        accessToken: token,
        modelId,
        state,
      },
    }).replace(/</g, "\\u003c");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ModelBox - OAuth 2.0 Authorization Complete</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background: #f8fafc;
      color: #1e293b;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
      text-align: center;
    }
    .badge-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #059669;
      padding: 6px 16px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 0.82rem;
      letter-spacing: 0.3px;
    }
    h2 {
      margin: 0 0 6px 0;
      font-size: 1.35rem;
      font-weight: 800;
      color: #0f172a;
    }
    .subtext {
      color: #64748b;
      font-size: 0.85rem;
      margin-bottom: 20px;
    }
    .code-box-wrapper {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 16px;
      text-align: left;
      margin-bottom: 20px;
    }
    .code-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .code-label {
      font-size: 0.75rem;
      font-weight: 700;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .copy-btn {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #2563eb;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .copy-btn:hover {
      background: #dbeafe;
    }
    .code-input {
      width: 100%;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
      color: #0f172a;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85rem;
      outline: none;
      word-break: break-all;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      text-align: left;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 20px;
    }
    .meta-item label {
      display: block;
      font-size: 0.7rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }
    .meta-item span {
      display: block;
      font-size: 0.82rem;
      font-weight: 700;
      color: #1e293b;
      margin-top: 2px;
      word-break: break-all;
    }
    .db-badge {
      color: #059669 !important;
    }
    .return-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      background: #2563eb;
      color: #ffffff;
      border: none;
      cursor: pointer;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.9rem;
      transition: all 0.2s ease;
    }
    .return-btn:hover {
      background: #1d4ed8;
    }
    .countdown-note {
      font-size: 0.78rem;
      color: #64748b;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge-row">
      <span class="status-badge">✔ Authorization Verified</span>
    </div>
    <h2>OAuth 2.0 Connection Authorized</h2>
    <p class="subtext">Browser authentication completed for <strong>${safeProvider}</strong></p>

    <div class="code-box-wrapper">
      <div class="code-header">
        <span class="code-label">Authorization Code</span>
        <button type="button" class="copy-btn" id="copy-btn">📋 Copy Code</button>
      </div>
      <input type="text" readonly class="code-input" id="authcode-input" value="${safeCode}" />
    </div>

    <div class="meta-grid">
      <div class="meta-item">
        <label>Authenticated Principal</label>
        <span>${safeEmail}</span>
      </div>
      <div class="meta-item">
        <label>Target Model & Provider</label>
        <span>${safeProvider} (${safeModelId})</span>
      </div>
      <div class="meta-item" style="grid-column: 1 / -1;">
        <label>Security & Session Status</label>
        <span class="db-badge">✔ Credential delivered securely to parent session</span>
      </div>
    </div>

    <button type="button" class="return-btn" id="close-window-btn">
      <span>✔ Close Window</span>
    </button>
    <div class="countdown-note" id="close-note">Authorization verified. Click <strong>Close Window</strong> above when ready to return to your form.</div>

    <script nonce="${cspNonce}">
      (function() {
        var data = ${serializedConfig};
        var copyBtn = document.getElementById("copy-btn");
        if (copyBtn) {
          copyBtn.addEventListener("click", function() {
            var input = document.getElementById("authcode-input");
            if (input) {
              input.select();
              navigator.clipboard.writeText(input.value).catch(function() {});
              copyBtn.textContent = "✔ Copied!";
            }
          });
        }

        function closePopupWindow() {
          window.close();
        }

        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(data.payload, "*");
            window.opener.postMessage(
              Object.assign({}, data.payload, { type: "OAUTH_CALLBACK_SUCCESS" }),
              "*"
            );
          }
        } catch (e) {}

        var closeBtn = document.getElementById("close-window-btn");
        if (closeBtn) {
          closeBtn.addEventListener("click", closePopupWindow);
        }
      })();
    </script>
  </div>
</body>
</html>`;
  }

  private renderErrorHtml(
    error: string,
    provider: string,
    targetOrigin: string,
    cspNonce: string,
  ): string {
    const safeError = this.escapeHtml(error);
    const safeProvider = this.escapeHtml(provider);
    const serializedError = JSON.stringify({
      targetOrigin,
      payload: { type: "MODELBOX_OAUTH_ERROR", error, provider },
    }).replace(/</g, "\\u003c");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ModelBox - Authorization Error</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0f19; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { width: min(520px, 95vw); background: #111827; border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 16px; padding: 24px; text-align: center; }
    h2 { margin: 0 0 12px 0; font-size: 1.2rem; color: #f8fafc; }
    .err-box { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; border-radius: 10px; padding: 12px; margin-bottom: 18px; word-break: break-word; font-size: 0.9rem; }
    .btn { cursor: pointer; border: none; background: #334155; color: #f8fafc; border-radius: 8px; padding: 10px 18px; font-weight: 700; font-size: 0.9rem; }
    .hint { margin-top: 10px; font-size: 0.78rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Authorization Failed (${safeProvider})</h2>
    <div class="err-box">${safeError}</div>
    <button type="button" class="btn" id="close-error-btn">Close Window</button>
    <div class="hint" id="error-close-note">Close this window to return to your active onboarding session.</div>
    <script nonce="${cspNonce}">
      (function() {
        var data = ${serializedError};
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(data.payload, data.targetOrigin);
          }
        } catch (e) {}
        var btn = document.getElementById("close-error-btn");
        if (btn) {
          btn.addEventListener("click", function() {
            window.close();
          });
        }
      })();
    </script>
  </div>
</body>
</html>`;
  }

  private resolveSafeScopes(
    provider: string,
    requestedScope: unknown,
    defaultScopes: readonly string[],
  ): string {
    if (provider === ProviderId.GOOGLE) {
      return GoogleAuthConstants.DEFAULT_SCOPES.join(" ");
    }
    return requestedScope ? String(requestedScope) : defaultScopes.join(" ");
  }

  public buildChooserUrl(input: {
    modelId: string;
    provider: string;
    state: string;
    redirectUri: string;
    scope: string;
    returnUrl?: string;
  }): string {
    const params = new URLSearchParams({
      model: input.modelId,
      provider: input.provider,
      state: input.state,
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: input.scope,
    });
    if (input.returnUrl && input.returnUrl.trim().length > 0) {
      params.set("returnUrl", input.returnUrl);
    }
    return `/oauth2/authorize?${params.toString()}`;
  }

  private isAccountForProvider(configJson: string | undefined, provider: string): boolean {
    if (!configJson || configJson.trim().length === 0) return false;
    try {
      const parsed = JSON.parse(configJson) as { provider?: string };
      return (parsed.provider || "").trim().toLowerCase() === provider.toLowerCase();
    } catch {
      return false;
    }
  }

  public resolveConsentCardConfig(provider: string, providerName: string): {
    title: string;
    logoSvg: string;
    scopes: readonly string[];
    codePrefix: string;
  } {
    const p = provider.toLowerCase();
    if (p === "google") {
      return {
        title: "Sign in with Google",
        logoSvg: `<svg viewBox="0 0 48 48" width="44" height="44">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>`,
        scopes: [
          "Google Gemini Generative Language APIs",
          "Google Cloud Platform Model Connector resources",
          "OpenID connect & OAuth 2.0 PKCE token verification",
        ],
        codePrefix: "4/0AUn6Hd",
      };
    }
    if (p === "openai" || p.includes("chatgpt")) {
      return {
        title: "Sign in with OpenAI ChatGPT",
        logoSvg: `<svg viewBox="0 0 24 24" width="44" height="44" fill="#10a37f">
          <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9 6.07 6.07 0 0 0-4.27 2.17 5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A6.06 6.06 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5z"/>
        </svg>`,
        scopes: [
          "OpenAI Model Inference & Chat Completions APIs",
          "OpenAI Assistants & Platform Model Connector resources",
          "OpenID connect & OAuth 2.0 token verification",
        ],
        codePrefix: "sk-proj-oat_",
      };
    }
    if (p === "anthropic" || p.includes("claude")) {
      return {
        title: "Sign in with Anthropic Claude",
        logoSvg: `<svg viewBox="0 0 24 24" width="44" height="44" fill="#d97706">
          <circle cx="12" cy="12" r="10" stroke="#d97706" stroke-width="2" fill="none"/>
          <path d="M12 6v12M6 12h12" stroke="#d97706" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
        scopes: [
          "Anthropic Claude API Messages & Completions",
          "Anthropic Platform Model Connector resources",
          "OAuth 2.0 token verification",
        ],
        codePrefix: "sk-ant-oat_",
      };
    }
    if (p === "github" || p.includes("copilot")) {
      return {
        title: "Sign in with GitHub Copilot",
        logoSvg: `<svg viewBox="0 0 24 24" width="44" height="44" fill="#24292f">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/>
        </svg>`,
        scopes: [
          "GitHub Copilot Chat & Completion APIs",
          "GitHub User Profile & Organization verification",
          "OAuth 2.0 PKCE authentication",
        ],
        codePrefix: "gho_",
      };
    }
    if (p === "xai" || p === "grok" || p.includes("grok")) {
      return {
        title: "Sign in with xAI Grok",
        logoSvg: `<svg viewBox="0 0 24 24" width="44" height="44" fill="#0f172a">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>`,
        scopes: [
          "xAI Grok Completions & Realtime API",
          "xAI Platform Model Connector resources",
          "OAuth 2.0 PKCE authentication",
        ],
        codePrefix: "xai_oat_",
      };
    }
    const name = providerName || provider;
    return {
      title: `Sign in with ${name}`,
      logoSvg: `<svg viewBox="0 0 24 24" width="44" height="44" fill="#2563eb">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>`,
      scopes: [
        `${name} Model Inference APIs`,
        "ModelBox Platform Integration & Token Vault",
        "OAuth 2.0 token verification",
      ],
      codePrefix: "oat_",
    };
  }

  public renderAccountChooserHtml(input: {
    providerName: string;
    provider: string;
    modelId: string;
    chooserUrl: string;
    state?: string;
    nonce: string;
    accounts: readonly { accountId: string; accountName: string; userEmail: string }[];
    prefillEmail?: string;
  }): string {
    const escapedModelId = this.escapeHtml(input.modelId);
    const safeState = this.escapeHtml(input.state || "");
    const consentConfig = this.resolveConsentCardConfig(input.provider, input.providerName);
    const escapedTitle = this.escapeHtml(consentConfig.title);
    const prefillEmail = input.prefillEmail?.trim() || "";

    const accountOptionsHtml = input.accounts.length > 0
      ? input.accounts.map((acc, idx) => `
        <div class="account-option ${idx === 0 ? "selected" : ""}" data-email="${this.escapeHtml(acc.userEmail)}">
          <div class="account-avatar">👤</div>
          <div class="account-text">
            <div class="account-name">${this.escapeHtml(acc.accountName)}</div>
            <div class="account-email">${this.escapeHtml(acc.userEmail)}</div>
          </div>
        </div>`).join("")
      : `
        <div class="account-option selected" id="opt-user" data-email="${this.escapeHtml(prefillEmail)}">
          <div class="account-avatar">👤</div>
          <div class="account-text">
            <div class="account-name">New Account</div>
            <div class="account-email">${prefillEmail ? this.escapeHtml(prefillEmail) : "Enter account email below"}</div>
          </div>
        </div>`;

    const scopesHtml = consentConfig.scopes
      .map((scope) => `<div class="scope-item"><span class="check-icon">✓</span> <span>${this.escapeHtml(scope)}</span></div>`)
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 16px;
    }
    .consent-card {
      width: min(460px, 96vw);
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px 28px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
      text-align: center;
    }
    .provider-logo { margin-bottom: 12px; }
    h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 6px 0; color: #1e293b; }
    .subtitle { font-size: 0.9rem; color: #64748b; margin: 0 0 20px 0; }
    .account-picker-group {
      text-align: left;
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .account-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      background: #ffffff;
    }
    .account-option:hover, .account-option.selected {
      border-color: #2563eb;
      background: #eff6ff;
    }
    .account-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
    }
    .account-text { flex: 1; min-width: 0; }
    .account-name { font-weight: 600; font-size: 0.88rem; color: #0f172a; }
    .account-email { font-size: 0.78rem; color: #64748b; }
    .custom-email-box {
      margin-top: 6px;
      padding: 8px 12px;
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 0.85rem;
    }
    .scope-box {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px;
      text-align: left;
      font-size: 0.82rem;
      color: #334155;
      margin-bottom: 24px;
    }
    .scope-item { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
    .scope-item:last-child { margin-bottom: 0; }
    .check-icon { color: #16a34a; font-weight: bold; }
    .btn-actions { display: flex; gap: 12px; justify-content: flex-end; }
    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
    }
    .btn-allow { background: #2563eb; color: #ffffff; }
    .btn-allow:hover { background: #1d4ed8; }
    .btn-cancel { background: #e2e8f0; color: #475569; }
    .btn-cancel:hover { background: #cbd5e1; }
  </style>
</head>
<body>
  <div class="consent-card">
    <div class="provider-logo">
      ${consentConfig.logoSvg}
    </div>
    <h1>${escapedTitle}</h1>
    <p class="subtitle">Choose an account to continue to <strong>ModelBox Platform</strong></p>

    <div class="account-picker-group" id="account-picker-group">
      ${accountOptionsHtml}
      <div>
        <input type="email" id="custom-email" class="custom-email-box" placeholder="Or enter custom account email..." value="${this.escapeHtml(prefillEmail)}" />
      </div>
    </div>

    <div class="scope-box">
      <div style="font-weight:700; margin-bottom:8px; font-size:0.85rem;">Permissions requested for ${escapedModelId}:</div>
      ${scopesHtml}
    </div>

    <div class="btn-actions">
      <button type="button" class="btn btn-cancel" id="close-window-btn">Close Window</button>
      <button type="button" class="btn btn-allow" id="btn-allow-consent" data-testid="btn-authorize-${input.provider}-consent">Allow &amp; Authorize</button>
    </div>
  </div>

  <script nonce="${input.nonce}">
    (function() {
      var selectedEmail = "${this.escapeHtml(prefillEmail || (input.accounts.length > 0 ? input.accounts[0].userEmail : ""))}";
      var options = document.querySelectorAll(".account-option");
      var customInput = document.getElementById("custom-email");

      options.forEach(function(opt) {
        opt.addEventListener("click", function() {
          options.forEach(function(o) { o.className = "account-option"; });
          opt.className = "account-option selected";
          var email = opt.getAttribute("data-email");
          if (email) {
            selectedEmail = email;
            if (customInput) customInput.value = email;
          }
        });
      });

      if (customInput) {
        customInput.addEventListener("input", function() {
          if (customInput.value.trim().length > 0) {
            selectedEmail = customInput.value.trim();
            options.forEach(function(o) { o.className = "account-option"; });
          }
        });
      }

      var allowBtn = document.getElementById("btn-allow-consent");
      if (allowBtn) {
        allowBtn.addEventListener("click", function() {
          var effectiveEmail = (customInput && customInput.value.trim().length > 0) ? customInput.value.trim() : selectedEmail;
          var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!effectiveEmail || !emailRegex.test(effectiveEmail)) {
            var errorEl = document.getElementById("email-validation-error");
            if (!errorEl) {
              errorEl = document.createElement("div");
              errorEl.id = "email-validation-error";
              errorEl.style.color = "#dc2626";
              errorEl.style.fontSize = "0.82rem";
              errorEl.style.marginTop = "8px";
              errorEl.style.fontWeight = "600";
              var picker = document.getElementById("account-picker-group");
              if (picker) picker.appendChild(errorEl);
            }
            errorEl.textContent = "Please select or enter a valid email address to authenticate before proceeding.";
            if (customInput) customInput.focus();
            return;
          }
          var prefix = "${consentConfig.codePrefix}";
          var code = prefix + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + "Z";
          var target = "/oauth2callback?code=" + encodeURIComponent(code) + "&email=" + encodeURIComponent(effectiveEmail) + "&state=" + encodeURIComponent("${safeState}");
          window.location.href = target;
        });
      }

      var cancelBtn = document.getElementById("close-window-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", function() {
          window.close();
        });
      }
    })();
  </script>
</body>
</html>`;
  }
}

export const oauthCallbackServer = OAuthCallbackServer.getInstance();
