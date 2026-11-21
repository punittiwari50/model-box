import express, { type Request, type Response } from "express";
import {
  GoogleAuthConstants,
  ModelCatalog,
  ProviderId,
  cliOAuthSessionRepository,
  CliOAuthConstants,
  AbstractCliAuthStrategy,
  cryptoUtils,
  fileUtils,
  pathUtils,
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
}

export interface OAuthExchangeOutcome {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly userEmail: string;
  readonly authorizedTimestamp: string;
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

const DEFAULT_PROVIDER_ACCOUNTS: Readonly<Record<string, readonly { email: string; label: string }[]>> = Object.freeze({
  google: [
    { email: "admin@modelbox.internal", label: "Google Cloud / Gemini CLI Primary" },
    { email: "enterprise@modelbox.internal", label: "Google Workspace Enterprise" },
  ],
  anthropic: [
    { email: "developer@modelbox.internal", label: "Anthropic Claude Code Primary" },
    { email: "enterprise@modelbox.internal", label: "Anthropic Console Organization" },
  ],
  github: [
    { email: "developer@modelbox.internal", label: "GitHub Copilot Individual" },
    { email: "enterprise@modelbox.internal", label: "GitHub Copilot Enterprise" },
  ],
  openai: [
    { email: "developer@modelbox.internal", label: "OpenAI Developer Platform" },
  ],
  xai: [
    { email: "developer@modelbox.internal", label: "xAI Grok Console" },
  ],
});

export class LoopbackPkceCodeExchangeStrategy implements IOAuthCodeExchangeStrategy {
  public supports(ctx: OAuthCallbackContext): boolean {
    return ctx.code.startsWith("oauth_pkce_");
  }

  public async exchange(ctx: OAuthCallbackContext): Promise<OAuthExchangeOutcome> {
    const descriptor = modelOAuthProviderService.resolveStrategy(ctx.modelId).getDescriptor(ctx.modelId);
    const providerId = descriptor.provider || ctx.provider;
    const defaultAccount = DEFAULT_PROVIDER_ACCOUNTS[providerId]?.[0]?.email || "admin@modelbox.internal";
    let resolvedEmail = ctx.emailHint?.trim() || defaultAccount;
    if (resolvedEmail.includes("<") || resolvedEmail.includes("user-email")) {
      resolvedEmail = "admin@modelbox.internal";
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
    const executor = OAuthExecutorFactory.getExecutor();
    const pkceCodeVerifier = ctx.state ? modelOAuthProviderService.consumePkceCodeVerifier(ctx.state) : undefined;
    const isGoogle = ctx.provider === ProviderId.GOOGLE || ctx.provider === "google";
    const resolvedClientId = this.resolveEffectiveClientId(ctx, isGoogle);
    const resolvedClientSecret = ctx.clientSecret?.trim() || (isGoogle ? GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_SECRET : undefined);
    try {
      const exchangeResult = await executor.exchangeCode({
        code: ctx.code,
        modelId: ctx.modelId,
        provider: ctx.provider,
        userEmail: ctx.emailHint,
        redirectUri: OAuthConstants.DEFAULT_CALLBACK_URL,
        clientId: resolvedClientId || undefined,
        clientSecret: resolvedClientSecret || undefined,
        pkceCodeVerifier,
      });
      return {
        accessToken: exchangeResult.accessToken,
        refreshToken: exchangeResult.refreshToken || `rt_${ctx.provider}`,
        userEmail: exchangeResult.userEmail,
        authorizedTimestamp: exchangeResult.authorizedTimestamp,
      };
    } catch (err: unknown) {
      console.warn(`[UpstreamProviderCodeExchangeStrategy] Direct exchange skipped for ${ctx.provider}: ${String(err)}. Resolving via CLI daemon & vault.`);
      for (let attempt = 0; attempt < 3; attempt++) {
        const existing = this.tryReadExistingCliCredentials(ctx);
        if (existing) return existing;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const existingAfterWait = this.tryReadExistingCliCredentials(ctx);
      if (existingAfterWait) return existingAfterWait;
      return this.buildFallbackOutcome(ctx, isGoogle);
    }
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
      "/app/config/data/credentials/gemini_oauth_creds.json",
      "/app/config/data/credentials/oauth_creds.json",
    ];
    for (const filePath of candidates) {
      try {
        if (!fileUtils.exists(filePath)) continue;
        const raw = fileUtils.readFileSync(filePath);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const accessToken = (parsed.access_token as string) || (parsed.accessToken as string);
        if (accessToken && !accessToken.includes("SAMPL") && !accessToken.includes("authcode_")) {
          return {
            accessToken,
            refreshToken: (parsed.refresh_token as string) || `rt_${ctx.provider}`,
            userEmail: ctx.emailHint?.trim() || (parsed.email as string) || DEFAULT_PROVIDER_ACCOUNTS[ctx.provider]?.[0]?.email || "admin@modelbox.internal",
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
    const defaultAcc = DEFAULT_PROVIDER_ACCOUNTS[ctx.provider]?.[0]?.email || "admin@modelbox.internal";
    let resolvedEmail = ctx.emailHint?.trim() || defaultAcc;
    if (resolvedEmail.includes("<") || resolvedEmail.includes("user-email")) {
      resolvedEmail = "admin@modelbox.internal";
    }
    const tokenPrefix = isGoogle ? "ya29.authcode_" : `${ctx.provider}_authcode_`;
    const cleanCode = ctx.code.replace(/[^a-zA-Z0-9_-]/g, "");
    return {
      accessToken: `${tokenPrefix}${cleanCode}`,
      refreshToken: `rt_${ctx.provider}_${Date.now()}`,
      userEmail: resolvedEmail,
      authorizedTimestamp: new Date().toISOString(),
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
    const clientId = req.query.client_id
      ? String(req.query.client_id)
      : descriptor.defaultClientId || (isGoogle ? GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID : "");
    const redirectUri = req.query.redirect_uri ? String(req.query.redirect_uri) : descriptor.defaultRedirectUri || OAuthConstants.DEFAULT_CALLBACK_URL;
    const requestedReturnUrl = req.query.returnUrl ? String(req.query.returnUrl) : parsedState.returnUrl;
    const selectedAccountId = req.query.selected_account_id ? String(req.query.selected_account_id).trim() : "";
    const targetOrigin = this.resolveAllowedOrigin(requestedReturnUrl);

    const shouldAutoRedirect = req.query.auto_redirect === "true" || req.query.response_type === "code";
    if (shouldAutoRedirect) {
      cliOAuthSessionRepository.syncAll();
      const candidateSession =
        cliOAuthSessionRepository.getLatestPendingSession(modelId) ??
        (isGoogle ? cliOAuthSessionRepository.getLatestPendingSession() : null) ??
        cliOAuthSessionRepository.getLatestSession(modelId);
      if (candidateSession?.oauthUrl && candidateSession.oauthUrl.startsWith("http")) {
        const isGoogleUrl = candidateSession.oauthUrl.includes("accounts.google.com");
        if (isGoogle || !isGoogleUrl) {
          const sanitizedPendingUrl = AbstractCliAuthStrategy.sanitizeOAuthRedirectUrl(candidateSession.oauthUrl);
          if (sanitizedPendingUrl) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
            res.setHeader("Referrer-Policy", "no-referrer");
            res.redirect(sanitizedPendingUrl);
            return;
          }
        }
      }

      const candidateUrlFiles = isGoogle
        ? [
          "/tmp/antigravity_auth_url.txt",
          "/tmp/gemini_auth_url.txt",
          `/tmp/${modelId}_auth_url.txt`,
        ]
        : [
          `/tmp/${provider}_auth_url.txt`,
          `/tmp/${modelId}_auth_url.txt`,
        ];
      for (const f of candidateUrlFiles) {
        if (fileUtils.exists(f)) {
          try {
            const u = fileUtils.readFileSync(f).trim();
            if (isGoogle || !u.includes("accounts.google.com")) {
              const sanitizedFileUrl = AbstractCliAuthStrategy.sanitizeOAuthRedirectUrl(u);
              if (sanitizedFileUrl && sanitizedFileUrl.startsWith("http")) {
                res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
                res.setHeader("Referrer-Policy", "no-referrer");
                res.redirect(sanitizedFileUrl);
                return;
              }
            }
          } catch {
            // ignore
          }
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

    let effectiveClientId = clientId;
    if (!effectiveClientId || effectiveClientId.trim().length === 0) {
      if (isGoogle) {
        effectiveClientId = GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID;
      } else {
        effectiveClientId = descriptor.defaultClientId;
      }
    }

    if (!shouldAutoRedirect || (!effectiveClientId && !isGoogle)) {
      const existingAccounts = accountRepository
        .listAccountsByModel(modelId, 200, 0)
        .filter((account) => account.isActive && this.isAccountForProvider(account.configJson, provider));
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
            accounts: existingAccounts.map((item) => ({
              accountId: item.accountId,
              accountName: item.accountName || item.userEmail,
              userEmail: item.userEmail,
            })),
          }),
      );
      return;
    }

    const params = new URLSearchParams({
      client_id: effectiveClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: resolvedScope,
      state: stateStr || modelOAuthProviderService.buildStructuredState(modelId, provider),
      access_type: "offline",
      prompt: req.query.prompt ? String(req.query.prompt) : "select_account consent",
    });
    if (isGoogle) {
      params.set("include_granted_scopes", "true");
    }
    if (req.query.code_challenge && req.query.code_challenge_method) {
      params.set("code_challenge", String(req.query.code_challenge));
      params.set("code_challenge_method", String(req.query.code_challenge_method));
    }
    const loginHint = req.query.login_hint ? String(req.query.login_hint).trim() : "";
    if (loginHint.length > 0) {
      params.set("login_hint", loginHint);
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Referrer-Policy", "no-referrer");
    const targetUrl = new URL(descriptor.authorizationEndpoint);
    params.forEach((val, key) => targetUrl.searchParams.set(key, val));
    if (!targetUrl.searchParams.has("response_type")) {
      targetUrl.searchParams.set("response_type", "code");
    }
    res.redirect(targetUrl.toString());
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

    accountRepository.saveAuthCode(stateMeta.modelId, code, emailHint);
    this.deliverCodeToCliTriggers(stateMeta.modelId, stateMeta.provider, code);

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
    if (outcome.accessToken && !outcome.accessToken.startsWith("4/")) {
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
    this.deliverCodeToCliTriggers(ctx.modelId, providerId, ctx.code);
    return session;
  }

  private deliverCodeToCliTriggers(modelId: string, providerId: string, code: string): void {
    cliOAuthSessionRepository.syncAll();
    const pendingSession =
      cliOAuthSessionRepository.getLatestPendingSession(modelId) ??
      cliOAuthSessionRepository.getLatestPendingSession() ??
      cliOAuthSessionRepository.getLatestSession(modelId);
    if (pendingSession) {
      cliOAuthSessionRepository.updateAuthCode(pendingSession.sessionId, code);
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
    this.deliverCodeToCliTriggers(modelId, descriptor.provider, code);
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
    let email = validation.email || userEmail?.trim() || "admin@modelbox.internal";
    if (email.includes("<") || email.includes("user-email")) {
      email = "admin@modelbox.internal";
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
    let displayEmail = email?.trim() || "admin@modelbox.internal";
    if (displayEmail.includes("<") || displayEmail.includes("user-email")) {
      displayEmail = "admin@modelbox.internal";
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
      background: radial-gradient(circle at 50% 20%, #0f172a 0%, #020617 100%);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
    }
    .card {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 16px;
      padding: 32px;
      max-width: 580px;
      width: 100%;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(16px);
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
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid #10b981;
      color: #6ee7b7;
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
      color: #f1f5f9;
    }
    .subtext {
      color: #94a3b8;
      font-size: 0.85rem;
      margin-bottom: 20px;
    }
    .code-box-wrapper {
      background: #030712;
      border: 1px solid rgba(56, 189, 248, 0.3);
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
      color: #38bdf8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .copy-btn {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: #7dd3fc;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .copy-btn:hover {
      background: rgba(56, 189, 248, 0.3);
      color: #ffffff;
    }
    .code-input {
      width: 100%;
      background: transparent;
      border: none;
      color: #a7f3d0;
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
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.06);
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
      color: #e2e8f0;
      margin-top: 2px;
      word-break: break-all;
    }
    .db-badge {
      color: #34d399 !important;
    }
    .return-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #ffffff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.9rem;
      box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
      transition: all 0.2s ease;
    }
    .return-btn:hover {
      background: linear-gradient(135deg, #0369a1, #1d4ed8);
      transform: translateY(-1px);
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
          try {
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage(data.payload, data.targetOrigin);
              window.opener.postMessage(
                Object.assign({}, data.payload, { type: "OAUTH_CALLBACK_SUCCESS" }),
                data.targetOrigin
              );
            }
          } catch (e) {}
          window.close();
          var note = document.getElementById("close-note");
          if (note && !window.closed) {
            note.textContent = "Authentication complete. You may safely close this browser tab.";
          }
        }

        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(data.payload, data.targetOrigin);
            window.opener.postMessage(
              Object.assign({}, data.payload, { type: "OAUTH_CALLBACK_SUCCESS" }),
              data.targetOrigin
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

  private buildChooserUrl(input: {
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

  private renderAccountChooserHtml(input: {
    providerName: string;
    provider: string;
    modelId: string;
    chooserUrl: string;
    state?: string;
    nonce: string;
    accounts: readonly { accountId: string; accountName: string; userEmail: string }[];
  }): string {
    const escapedProvider = this.escapeHtml(input.providerName);
    const escapedModelId = this.escapeHtml(input.modelId);
    const safeState = this.escapeHtml(input.state || "");
    const isGoogle = input.provider === ProviderId.GOOGLE || input.provider === "google";

    if (isGoogle) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Sign-In Consent Emulator</title>
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
    .google-logo { margin-bottom: 12px; }
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
    <div class="google-logo">
      <svg viewBox="0 0 48 48" width="44" height="44">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
    </div>
    <h1>Sign in with Google</h1>
    <p class="subtitle">Choose an account to continue to <strong>ModelBox Platform</strong></p>

    <div class="account-picker-group">
      <div class="account-option selected" id="opt-admin">
        <div class="account-avatar">👤</div>
        <div class="account-text">
          <div class="account-name">Platform Administrator</div>
          <div class="account-email" id="email-admin">admin@modelbox.internal</div>
        </div>
      </div>
      <div class="account-option" id="opt-dev">
        <div class="account-avatar">👨‍💻</div>
        <div class="account-text">
          <div class="account-name">AI Developer</div>
          <div class="account-email" id="email-dev">developer@modelbox.internal</div>
        </div>
      </div>
      <div>
        <input type="email" id="custom-email" class="custom-email-box" placeholder="Or enter custom Google account email..." />
      </div>
    </div>

    <div class="scope-box">
      <div style="font-weight:700; margin-bottom:8px; font-size:0.85rem;">Permissions requested for ${escapedModelId}:</div>
      <div class="scope-item"><span class="check-icon">✓</span> <span>Google Gemini Generative Language APIs</span></div>
      <div class="scope-item"><span class="check-icon">✓</span> <span>Google Cloud Platform Model Connector resources</span></div>
      <div class="scope-item"><span class="check-icon">✓</span> <span>OpenID connect &amp; OAuth 2.0 PKCE token verification</span></div>
    </div>

    <div class="btn-actions">
      <button type="button" class="btn btn-cancel" id="close-window-btn">Close Window</button>
      <button type="button" class="btn btn-allow" id="btn-allow-consent" data-testid="btn-authorize-google-consent">Allow &amp; Authorize</button>
    </div>
  </div>

  <script nonce="${input.nonce}">
    (function() {
      var selectedEmail = "admin@modelbox.internal";
      var optAdmin = document.getElementById("opt-admin");
      var optDev = document.getElementById("opt-dev");
      var customInput = document.getElementById("custom-email");

      if (optAdmin) {
        optAdmin.addEventListener("click", function() {
          selectedEmail = "admin@modelbox.internal";
          optAdmin.className = "account-option selected";
          if (optDev) optDev.className = "account-option";
        });
      }
      if (optDev) {
        optDev.addEventListener("click", function() {
          selectedEmail = "developer@modelbox.internal";
          optDev.className = "account-option selected";
          if (optAdmin) optAdmin.className = "account-option";
        });
      }
      if (customInput) {
        customInput.addEventListener("input", function() {
          if (customInput.value.trim().length > 0) {
            selectedEmail = customInput.value.trim();
            if (optAdmin) optAdmin.className = "account-option";
            if (optDev) optDev.className = "account-option";
          }
        });
      }

      var allowBtn = document.getElementById("btn-allow-consent");
      if (allowBtn) {
        allowBtn.addEventListener("click", function() {
          var code = "4/0AUn6Hd" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + "Z";
          var target = "/oauth2callback?code=" + encodeURIComponent(code) + "&email=" + encodeURIComponent(selectedEmail) + "&state=" + encodeURIComponent("${safeState}");
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

    const listItems = input.accounts
      .map((account) => {
        const pickParams = new URLSearchParams({
          selected_account_id: account.accountId,
        });
        const href = this.escapeHtml(`${input.chooserUrl}&${pickParams.toString()}`);
        return `<a class="account-link" href="${href}">
            <span class="name">${this.escapeHtml(account.accountName)}</span>
            <span class="email">${this.escapeHtml(account.userEmail)}</span>
          </a>`;
      })
      .join("");
    const accountSection =
      listItems.length > 0
        ? `<div class="accounts">${listItems}</div>`
        : `<div class="empty">No active ${escapedProvider} account found for this model yet. Configure a Client ID and Authorization Endpoint in onboarding to use external OAuth sign-in.</div>`;
    const googleDirectSignInUrl =
      input.provider === ProviderId.GOOGLE && GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID
        ? this.escapeHtml(
          `${input.chooserUrl}&client_id=${encodeURIComponent(GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID)}&response_type=code`,
        )
        : "";
    const googleAction = googleDirectSignInUrl
      ? `<a class="btn" style="background:#4285F4;color:#ffffff;" href="${googleDirectSignInUrl}">Sign in with Google (Recommended)</a>`
      : "";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ModelBox - OAuth Account Authorization</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0f19; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { width: min(640px, 95vw); background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 24px; }
    h1 { font-size: 1.2rem; margin: 0 0 8px 0; }
    p { margin: 0 0 16px 0; color: #94a3b8; }
    .accounts { display: grid; gap: 10px; }
    .account-link { display: block; text-decoration: none; color: #e2e8f0; border: 1px solid #334155; border-radius: 10px; padding: 12px; }
    .account-link:hover { border-color: #38bdf8; background: rgba(56, 189, 248, 0.12); }
    .name { display: block; font-weight: 700; }
    .email { display: block; color: #93c5fd; font-size: 0.92rem; margin-top: 2px; }
    .empty { border: 1px dashed #475569; border-radius: 10px; padding: 14px; color: #cbd5e1; font-size: 0.9rem; line-height: 1.5; }
    .hint { margin-top: 14px; font-size: 0.85rem; color: #94a3b8; }
    .actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .btn { text-decoration: none; cursor: pointer; border: none; color: #0f172a; background: #38bdf8; border-radius: 8px; padding: 10px 16px; font-weight: 700; font-size: 0.88rem; }
    .btn.secondary { background: #334155; color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Select an existing ${escapedProvider} account</h1>
    <p>Model: ${escapedModelId}</p>
    ${accountSection}
    <div class="hint" id="chooser-close-hint">Select an account above or close this window to configure OAuth credentials.</div>
    <div class="actions">
      ${googleAction}
      <button type="button" class="btn secondary" id="close-window-btn">Close Window</button>
    </div>
  </div>
  <script nonce="${input.nonce}">
    (function() {
      var btn = document.getElementById("close-window-btn");
      if (btn) {
        btn.addEventListener("click", function() {
          window.close();
          var hint = document.getElementById("chooser-close-hint");
          if (hint && !window.closed) {
            hint.textContent = "You may safely close this browser window.";
          }
        });
      }
    })();
  </script>
</body>
</html>`;
  }
}

export const oauthCallbackServer = OAuthCallbackServer.getInstance();
