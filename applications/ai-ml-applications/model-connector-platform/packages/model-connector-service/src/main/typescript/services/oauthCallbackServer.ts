import express, { type Request, type Response } from "express";
import { GoogleAuthConstants, ModelCatalog, ProviderId } from "@model-box/model-connector-core";
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
    { email: "gemini.developer@gmail.com", label: "Google Cloud / Gemini CLI Primary" },
    { email: "cloud.architect@workspace.google.com", label: "Google Workspace Enterprise" },
  ],
  anthropic: [
    { email: "claude.developer@anthropic.account", label: "Anthropic Claude Code Primary" },
    { email: "engineering@claude.console", label: "Anthropic Console Organization" },
  ],
  github: [
    { email: "copilot.developer@github.account", label: "GitHub Copilot Individual" },
    { email: "org.enterprise@github.account", label: "GitHub Copilot Enterprise" },
  ],
  openai: [
    { email: "chatgpt.developer@openai.account", label: "OpenAI Developer Platform" },
  ],
  xai: [
    { email: "grok.developer@x.ai", label: "xAI Grok Console" },
  ],
});

export class LoopbackPkceCodeExchangeStrategy implements IOAuthCodeExchangeStrategy {
  public supports(ctx: OAuthCallbackContext): boolean {
    return ctx.code.startsWith("oauth_pkce_");
  }

  public async exchange(ctx: OAuthCallbackContext): Promise<OAuthExchangeOutcome> {
    const descriptor = modelOAuthProviderService.resolveStrategy(ctx.modelId).getDescriptor(ctx.modelId);
    const providerId = descriptor.provider || ctx.provider;
    const defaultAccount = DEFAULT_PROVIDER_ACCOUNTS[providerId]?.[0]?.email || `${providerId}.user@authorized.account`;
    const resolvedEmail = ctx.emailHint?.trim() || defaultAccount;
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
    const isGoogle = ctx.provider === ProviderId.GOOGLE;
    const exchangeResult = await executor.exchangeCode({
      code: ctx.code,
      modelId: ctx.modelId,
      provider: ctx.provider,
      userEmail: ctx.emailHint,
      redirectUri: OAuthConstants.DEFAULT_CALLBACK_URL,
      clientId: isGoogle ? GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID : undefined,
      clientSecret: isGoogle ? GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_SECRET : undefined,
      pkceCodeVerifier,
    });
    return {
      accessToken: exchangeResult.accessToken,
      refreshToken: exchangeResult.refreshToken || `rt_${ctx.provider}`,
      userEmail: exchangeResult.userEmail,
      authorizedTimestamp: exchangeResult.authorizedTimestamp,
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
    const modelId = req.query.model ? String(req.query.model) : parsedState.modelId;
    const descriptor = modelOAuthProviderService.resolveStrategy(modelId).getDescriptor(modelId);
    const provider = req.query.provider ? String(req.query.provider) : descriptor.provider;
    const clientId = req.query.client_id ? String(req.query.client_id) : descriptor.defaultClientId;
    const redirectUri = req.query.redirect_uri ? String(req.query.redirect_uri) : descriptor.defaultRedirectUri || OAuthConstants.DEFAULT_CALLBACK_URL;
    const requestedReturnUrl = req.query.returnUrl ? String(req.query.returnUrl) : parsedState.returnUrl;
    const selectedAccountId = req.query.selected_account_id ? String(req.query.selected_account_id).trim() : "";
    const returnUrl = this.resolveReturnUrl(requestedReturnUrl, modelId, "");

    if (selectedAccountId.length > 0) {
      const selectedAccount = accountRepository.getAccount(selectedAccountId);
      if (!selectedAccount || !selectedAccount.isActive) {
        res.status(404).send(this.renderErrorHtml("Selected account was not found or is inactive.", provider, returnUrl));
        return;
      }
      if (!this.isAccountForProvider(selectedAccount.configJson, provider)) {
        res.status(400).send(this.renderErrorHtml("Selected account does not match requested provider.", provider, returnUrl));
        return;
      }
      const successReturnUrl = this.resolveReturnUrl(requestedReturnUrl, modelId, selectedAccount.userEmail);
      res.status(200).send(
        this.renderSuccessHtml(
          selectedAccount.userEmail,
          provider,
          `selected_account_${selectedAccount.accountId}`,
          selectedAccount.credentialValue,
          modelId,
          successReturnUrl,
        ),
      );
      return;
    }

    const resolvedScope = this.resolveSafeScopes(
      provider,
      req.query.scope,
      descriptor.defaultScopes,
    );

    if (!clientId || clientId.trim().length === 0) {
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
      res.status(200).send(
        this.renderAccountChooserHtml({
          providerName: descriptor.providerName,
          provider,
          modelId,
          returnUrl,
          chooserUrl,
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
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: resolvedScope,
      state: stateStr || modelOAuthProviderService.buildStructuredState(modelId, provider),
      access_type: "offline",
      prompt: req.query.prompt ? String(req.query.prompt) : "select_account consent",
    });
    if (provider === ProviderId.GOOGLE) {
      params.set("include_granted_scopes", "true");
    }
    const loginHint = req.query.login_hint ? String(req.query.login_hint).trim() : "";
    if (loginHint.length > 0) {
      params.set("login_hint", loginHint);
    }
    res.redirect(`${descriptor.authorizationEndpoint}?${params.toString()}`);
  }

  private parseStateMetadata(stateStr: string): { modelId: string; provider: string; returnUrl: string } {
    try {
      const params = new URLSearchParams(stateStr);
      return {
        modelId: params.get("model") || ModelCatalog.GEMINI_3_8_FLASH,
        provider: params.get("provider") || ProviderId.GOOGLE,
        returnUrl: params.get("returnUrl") || "",
      };
    } catch {
      return { modelId: ModelCatalog.GEMINI_3_8_FLASH, provider: ProviderId.GOOGLE, returnUrl: "" };
    }
  }

  public async handleCallback(req: Request, res: Response): Promise<void> {
    const code = req.query.code ? String(req.query.code) : undefined;
    const error = req.query.error ? String(req.query.error) : undefined;
    const emailHint = req.query.email ? String(req.query.email) : undefined;
    const stateMeta = this.parseStateMetadata(req.query.state ? String(req.query.state) : "");
    const targetUrl = this.resolveReturnUrl(stateMeta.returnUrl, stateMeta.modelId, "");

    if (error || !code) {
      const msg = error || "Missing authorization code in redirect query.";
      res.status(400).send(this.renderErrorHtml(msg, stateMeta.provider, targetUrl));
      return;
    }

    await this.processCallbackCode(
      {
        code,
        modelId: stateMeta.modelId,
        provider: stateMeta.provider,
        emailHint,
        state: req.query.state ? String(req.query.state) : "",
      },
      stateMeta.returnUrl,
      res,
    );
  }

  private async processCallbackCode(
    ctx: OAuthCallbackContext,
    returnUrl: string,
    res: Response,
  ): Promise<void> {
    try {
      const strategy = this.exchangeRegistry.resolve(ctx);
      const outcome = await strategy.exchange(ctx);
      this.persistCallbackSession(ctx, outcome);
      const successReturnUrl = this.resolveReturnUrl(returnUrl, ctx.modelId, outcome.userEmail);
      res.status(200).send(
        this.renderSuccessHtml(outcome.userEmail, ctx.provider, ctx.code, outcome.accessToken, ctx.modelId, successReturnUrl),
      );
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      const fallbackUrl = this.resolveReturnUrl(returnUrl, ctx.modelId, "");
      res.status(400).send(this.renderErrorHtml(errMessage, ctx.provider, fallbackUrl));
    }
  }

  private persistCallbackSession(ctx: OAuthCallbackContext, outcome: OAuthExchangeOutcome): CapturedOAuthSession {
    const descriptor = modelOAuthProviderService.resolveStrategy(ctx.modelId).getDescriptor(ctx.modelId);
    const providerId = descriptor.provider || ctx.provider;
    const providerLabel = descriptor.providerName || ctx.provider;
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
    const credentialsFileContent = JSON.stringify(
      {
        access_token: outcome.accessToken,
        refresh_token: outcome.refreshToken,
        scope: descriptor.defaultScopes.join(" "),
        token_type: "Bearer",
        expiry_date: Date.now() + 3600 * 1000,
      },
      null,
      2,
    );
    accountRepository.createAccount({
      modelId: ctx.modelId,
      accountName: `${providerLabel} (${outcome.userEmail})`,
      userEmail: outcome.userEmail,
      authType: "cli_oauth",
      credentialValue: outcome.accessToken,
      isActive: true,
      configJson: JSON.stringify({
        provider: providerId,
        oauthClientId: descriptor.defaultClientId || (providerId === ProviderId.GOOGLE ? GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID : ""),
        oauthAuthUrl: descriptor.authorizationEndpoint || "",
        oauthTokenUrl: descriptor.tokenEndpoint || "",
        oauthScopes: descriptor.defaultScopes,
        redirectUri: descriptor.defaultRedirectUri || OAuthConstants.DEFAULT_CALLBACK_URL,
        code: ctx.code,
        refreshToken: outcome.refreshToken,
        authorizedTimestamp: outcome.authorizedTimestamp,
        credentialsFileContent,
      }),
    });
    return session;
  }

  private resolveReturnUrl(returnUrl: string | undefined, modelId: string, email: string): string {
    const defaultUiUrl = OAuthConstants.DEFAULT_UI_BASE_URL;
    const base = returnUrl && returnUrl.startsWith("http") ? returnUrl : defaultUiUrl;
    try {
      const url = new URL(base);
      url.searchParams.set("oauth_success", "true");
      url.searchParams.set("model", modelId);
      if (email) url.searchParams.set("email", email);
      url.searchParams.set("tab", "model-config");
      return url.toString();
    } catch {
      const emailParam = email ? `&email=${encodeURIComponent(email)}` : "";
      return `${defaultUiUrl}/?oauth_success=true&model=${encodeURIComponent(modelId)}&tab=model-config${emailParam}`;
    }
  }

  public getLatestSession(modelId?: string): CapturedOAuthSession | undefined {
    if (modelId && this.capturedSessions.has(modelId)) {
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
  ): Promise<CapturedOAuthSession> {
    const code = this.extractCodeFromInput(userInput);
    const descriptor = modelOAuthProviderService.resolveStrategy(modelId).getDescriptor(modelId);
    if (this.isDirectBearerToken(code)) {
      return this.registerDirectBearerSession(modelId, code, descriptor.provider, userEmail);
    }
    const ctx: OAuthCallbackContext = { code, modelId, provider: descriptor.provider, emailHint: userEmail };
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
    const email = validation.email || userEmail?.trim() || `${provider}-cli@authorized.local`;
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
    targetUrl: string,
  ): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="2;url=${targetUrl}">
  <title>ModelBox - Account Connected</title>
  <style>
    body { background: #0b0f19; color: #f8fafc; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #131d31; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 16px; padding: 36px; max-width: 500px; text-align: center; }
    .badge { display: inline-block; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #6ee7b7; padding: 5px 14px; border-radius: 9999px; font-weight: 700; font-size: 0.85rem; margin-bottom: 16px; }
    .email-chip { background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-weight: 700; padding: 6px 14px; border-radius: 8px; display: inline-block; margin: 6px 0 16px 0; font-family: monospace; }
    .return-btn { display: inline-block; background: #0284c7; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✔ Account Connected Successfully</div>
    <h2>Authorization Complete</h2>
    <div class="email-chip" id="connected-email">${email}</div>
    <p>Redirecting to ModelBox Studio in <span id="countdown">2</span>s...</p>
    <a href="${targetUrl}" class="return-btn" id="return-now-btn">Return to ModelBox Studio Now &rarr;</a>
    <script>
      (function() {
        var targetUrl = "${targetUrl}";
        var payload = {
          type: "MODELBOX_OAUTH_SUCCESS",
          provider: "${provider}",
          email: "${email}",
          userEmail: "${email}",
          userName: "${email.split("@")[0]}",
          code: "${code}",
          token: "${token}",
          accessToken: "${token}",
          modelId: "${modelId}"
        };
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, "*");
            window.opener.postMessage(Object.assign({}, payload, { type: "OAUTH_CALLBACK_SUCCESS" }), "*");
          }
        } catch (e) {}
        var seconds = 1;
        var timer = setInterval(function() {
          seconds--;
          if (seconds <= 0) {
            clearInterval(timer);
            try { if (window.opener && !window.opener.closed) { window.close(); return; } } catch (e) {}
            window.location.replace(targetUrl);
          }
        }, 500);
      })();
    </script>
  </div>
</body>
</html>`;
  }

  private renderErrorHtml(error: string, provider: string, targetUrl: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>ModelBox - Authorization Error</title></head>
<body>
  <div class="card">
    <h2>Authorization Failed (${provider})</h2>
    <div class="err-box">${error}</div>
    <a href="${targetUrl}" class="btn">Return to ModelBox Studio</a>
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
    returnUrl: string;
    chooserUrl: string;
    accounts: readonly { accountId: string; accountName: string; userEmail: string }[];
  }): string {
    const escapedProvider = input.providerName.replace(/"/g, "&quot;");
    const listItems = input.accounts
      .map((account) => {
        const pickParams = new URLSearchParams({
          selected_account_id: account.accountId,
        });
        const href = `${input.chooserUrl}&${pickParams.toString()}`;
        return `<a class="account-link" href="${href}">
            <span class="name">${account.accountName}</span>
            <span class="email">${account.userEmail}</span>
          </a>`;
      })
      .join("");
    const accountSection =
      listItems.length > 0
        ? `<div class="accounts">${listItems}</div>`
        : `<div class="empty">No active ${escapedProvider} account found for this model yet.</div>`;
    const googleDirectSignInUrl =
      input.provider === ProviderId.GOOGLE
        ? `${input.chooserUrl}&client_id=${encodeURIComponent(GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID)}`
        : "";
    const googleAction = googleDirectSignInUrl
      ? `<a class="btn" style="background:#4285F4;color:#ffffff;" href="${googleDirectSignInUrl}">Sign in with Google (Recommended)</a>`
      : "";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ModelBox - Select Account</title>
  <style>
    body { margin: 0; font-family: sans-serif; background: #0b0f19; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { width: min(720px, 95vw); background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 24px; }
    h1 { font-size: 1.2rem; margin: 0 0 8px 0; }
    p { margin: 0 0 16px 0; color: #94a3b8; }
    .accounts { display: grid; gap: 10px; }
    .account-link { display: block; text-decoration: none; color: #e2e8f0; border: 1px solid #334155; border-radius: 10px; padding: 12px; }
    .account-link:hover { border-color: #38bdf8; background: rgba(56, 189, 248, 0.12); }
    .name { display: block; font-weight: 700; }
    .email { display: block; color: #93c5fd; font-size: 0.92rem; margin-top: 2px; }
    .empty { border: 1px dashed #475569; border-radius: 10px; padding: 14px; color: #cbd5e1; }
    .hint { margin-top: 14px; font-size: 0.9rem; }
    .actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
    .btn { text-decoration: none; color: #0f172a; background: #38bdf8; border-radius: 8px; padding: 10px 14px; font-weight: 700; }
    .btn.secondary { background: #334155; color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Select an existing ${escapedProvider} account</h1>
    <p>Model: ${input.modelId}</p>
    ${accountSection}
    <div class="hint">You can choose an existing mapped account above or sign in with a new account.</div>
    <div class="actions">
      ${googleAction}
      <a class="btn secondary" href="${input.returnUrl}">Return to ModelBox Studio</a>
    </div>
  </div>
</body>
</html>`;
  }
}

export const oauthCallbackServer = OAuthCallbackServer.getInstance();
