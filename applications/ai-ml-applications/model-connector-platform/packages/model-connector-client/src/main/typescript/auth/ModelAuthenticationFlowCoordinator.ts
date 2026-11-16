import {
  GoogleAuthConstants,
  CliAuthStrategyFactory,
  directoryAccountSyncService,
} from "@model-box/model-connector-core";
import {
  accountRepository,
  type ModelAccount,
} from "@/auth/ModelAccountRepository.js";
import {
  modelOAuthProviderService,
  ModelOAuthProviderService,
  type ModelOAuthConfigResult,
} from "@/auth/ModelOAuthProviderService.js";
import {
  OAuthExecutorFactory,
  type IOAuthTokenExchangeResult,
} from "@/auth/oauth/index.js";
import {
  bidirectionalCredentialVault,
  type BidirectionalSaveParams,
  type BidirectionalSaveResult,
} from "@/auth/BidirectionalCredentialVault.js";
import {
  protocolVerificationRegistry,
  type ConnectionTestResult,
  type IProtocolVerificationRegistry,
  type VerificationContext,
} from "@/auth/verification/index.js";

export interface ExchangeOAuthCodeParams {
  readonly modelId: string;
  readonly code: string;
  readonly userEmail?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly redirectUri?: string;
  readonly accountName?: string;
}

export interface ExchangeOAuthCodeOutcome {
  readonly modelId: string;
  readonly result: IOAuthTokenExchangeResult;
  readonly account: ModelAccount;
}

export interface CliLoginRequestParams {
  readonly modelId: string;
  readonly userEmail?: string;
  readonly accountCategory?: "individual" | "enterprise";
  readonly clientId?: string;
  readonly cliTool?: string;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
}

export interface CliLoginOutcome {
  readonly success: boolean;
  readonly modelId: string;
  readonly session: Record<string, unknown>;
  readonly syncedAccount: unknown | null;
}

/**
 * Master Enterprise Authentication Flow Coordinator in model-connector-client.
 * Encapsulates the entire end-to-end model authentication lifecycle:
 * - OAuth URL resolution with application.yml overrides
 * - CLI daemon session execution and tracking
 * - Authorization code exchange
 * - Connection and token verification
 * - Bidirectional credential vaulting
 * - Automatic deactivation on failure
 */
export class ModelAuthenticationFlowCoordinator {
  constructor(
    private readonly oauthProviderService: ModelOAuthProviderService = modelOAuthProviderService,
    private readonly verificationRegistry: IProtocolVerificationRegistry = protocolVerificationRegistry,
  ) {}

  public getOAuthConfig(
    modelId: string,
    redirectUri?: string,
    clientId?: string,
  ): ModelOAuthConfigResult {
    return this.oauthProviderService.getOAuthConfigForModel(modelId, redirectUri, clientId);
  }

  public async exchangeOAuthCode(params: ExchangeOAuthCodeParams): Promise<ExchangeOAuthCodeOutcome> {
    const { modelId, code, userEmail, clientId, clientSecret, redirectUri, accountName } = params;
    if (!code || !code.trim()) {
      throw new Error("Authorization code cannot be blank or empty.");
    }
    const strategy = this.oauthProviderService.resolveStrategy(modelId);
    const descriptor = strategy.getDescriptor(modelId);
    const executor = OAuthExecutorFactory.getExecutor();
    const result = await executor.exchangeCode({
      code,
      modelId,
      provider: descriptor.provider,
      clientId,
      clientSecret,
      redirectUri,
      userEmail,
    });
    const resolvedEmail = result.userEmail || userEmail || "authenticated-user";
    const resolvedName = this.resolveCleanAccountName(accountName, resolvedEmail, descriptor.providerName);
    const configJson = this.buildOAuthAccountConfigJson(descriptor, clientId, result);
    const savedAccount = this.upsertAccountInRepository(modelId, resolvedName, resolvedEmail, result.accessToken, configJson);
    this.vaultCredentialsBestEffort(modelId, descriptor.provider, resolvedEmail, result, code);
    return { modelId, result, account: savedAccount };
  }

  private resolveCleanAccountName(accountName: string | undefined, email: string, defaultName: string): string {
    if (!accountName) return defaultName;
    const cleaned = accountName
      .replace(new RegExp(`\\s*\\(?${email}\\)?`, "gi"), "")
      .replace(/\s*\([^)]*@[^)]*\)/g, "")
      .trim();
    return cleaned || defaultName;
  }

  private buildOAuthAccountConfigJson(
    descriptor: { provider: string; defaultClientId: string; tokenEndpoint: string; authorizationEndpoint: string; defaultScopes: readonly string[] },
    clientId: string | undefined,
    result: IOAuthTokenExchangeResult,
  ): string {
    return JSON.stringify({
      provider: descriptor.provider,
      oauthClientId: clientId || descriptor.defaultClientId,
      oauthTokenUrl: descriptor.tokenEndpoint,
      oauthAuthUrl: descriptor.authorizationEndpoint,
      oauthScopes: descriptor.defaultScopes,
      refreshToken: result.refreshToken,
      authorizedTimestamp: result.authorizedTimestamp,
    });
  }

  private upsertAccountInRepository(
    modelId: string,
    accountName: string,
    userEmail: string,
    accessToken: string,
    configJson: string,
  ): ModelAccount {
    const match = accountRepository.findMatchingAccount(modelId, accountName, userEmail);
    if (match) {
      return (
        accountRepository.updateAccount(match.accountId, {
          accountName,
          userEmail,
          authType: "cli_oauth",
          credentialValue: accessToken,
          isActive: true,
          configJson,
        }) || match
      );
    }
    return accountRepository.createAccount({
      modelId,
      accountName,
      userEmail,
      authType: "cli_oauth",
      credentialValue: accessToken,
      isActive: true,
      configJson,
    });
  }

  private vaultCredentialsBestEffort(
    modelId: string,
    provider: string,
    userEmail: string,
    result: IOAuthTokenExchangeResult,
    code: string,
  ): void {
    try {
      bidirectionalCredentialVault.saveOAuthResponseAndCredentials({
        modelId,
        provider,
        userEmail,
        authCode: code,
        outcome: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || "",
          userEmail,
          authorizedTimestamp: result.authorizedTimestamp,
          expiresInSeconds: result.expiresInSeconds,
          scopes: result.scopes,
        },
      });
    } catch {
      // Best-effort local vault storage
    }
  }

  public async verifyConnection(
    authType: string,
    ctx: VerificationContext,
  ): Promise<ConnectionTestResult> {
    const strategy = this.verificationRegistry.resolve(authType);
    const testResult = await strategy.verify(ctx);
    this.deactivateAccountOnFailure(ctx.modelId, ctx.credentialValue, testResult.status);
    return testResult;
  }

  public deactivateAccountOnFailure(modelId: string, credentialValue: string, status: string): void {
    if (status === "VERIFIED") return;
    const accounts = accountRepository.listAccountsByModel(modelId);
    for (const acc of accounts) {
      const match =
        acc.credentialValue === credentialValue ||
        (credentialValue && acc.credentialValue.includes(credentialValue.slice(0, 16))) ||
        acc.isActive;
      if (match) {
        accountRepository.updateAccount(acc.accountId, { isActive: false });
      }
    }
  }

  public async executeCliLogin(params: CliLoginRequestParams): Promise<CliLoginOutcome> {
    const { modelId, userEmail, accountCategory, clientId, cliTool } = params;
    const vcsResult = await directoryAccountSyncService.executeWithVcsTracking(
      modelId,
      "cli-login",
      async () => {
        const strategy = CliAuthStrategyFactory.getStrategy(modelId);
        return strategy.triggerAuth({
          userEmail,
          accountCategory,
          clientId,
          cliTool,
          modelId,
          correlationId: params.correlationId,
          traceId: params.traceId,
          spanId: params.spanId,
          parentSpanId: params.parentSpanId,
        });
      },
      undefined,
      userEmail,
    );
    const session = vcsResult.result;
    const effectiveAuthUrl = this.resolveEffectiveAuthUrl(modelId, session);
    const isFailed = session.status === "FAILED" && !effectiveAuthUrl;
    const syncedAccount = vcsResult.syncedAccounts[0] || null;
    return {
      success: !isFailed,
      modelId,
      session: {
        ...session,
        oauthUrl: effectiveAuthUrl || session.oauthUrl,
        authorizationUrl: effectiveAuthUrl || session.oauthUrl,
        appRedirectUri: effectiveAuthUrl || session.appRedirectUri,
      },
      syncedAccount,
    };
  }

  private resolveEffectiveAuthUrl(
    modelId: string,
    session: { oauthUrl?: string; appRedirectUri?: string },
  ): string {
    const descriptor = this.oauthProviderService.resolveStrategy(modelId).getDescriptor(modelId);
    const oauthConfig = this.oauthProviderService.getOAuthConfigForModel(modelId);
    const isGoogle = descriptor.provider === "google" || modelId.toLowerCase().includes("gemini");
    const googleFallbackAuthUrl =
      isGoogle
        ? (oauthConfig.authorizationUrl.includes("accounts.google.com")
            ? oauthConfig.authorizationUrl
            : this.oauthProviderService.getOAuthConfigForModel(
                modelId,
                oauthConfig.redirectUri,
                GoogleAuthConstants.DEFAULT_GEMINI_CLIENT_ID,
              ).authorizationUrl)
        : "";
    const isGoogleSessionUrl = Boolean(session.oauthUrl && session.oauthUrl.includes("accounts.google.com"));
    const validSessionUrl = !isGoogle && isGoogleSessionUrl ? "" : session.oauthUrl;
    const candidate =
      validSessionUrl ||
      googleFallbackAuthUrl ||
      oauthConfig.authorizationUrl ||
      session.appRedirectUri ||
      "";
    return this.ensureValidAuthorizationUrl(candidate, modelId);
  }

  private ensureValidAuthorizationUrl(url: string, modelId?: string): string {
    if (!url || !url.trim()) return "";
    let cleanUrl = url.trim().replace(/^["']|["']$/g, "").replace(/[\r\n]/g, "");
    const isGoogle = modelId ? (modelId.toLowerCase().includes("gemini") || modelId.toLowerCase().includes("google")) : cleanUrl.includes("accounts.google.com");
    if (!isGoogle && cleanUrl.includes("accounts.google.com") && modelId) {
      const oauthConfig = this.oauthProviderService.getOAuthConfigForModel(modelId);
      return oauthConfig.authorizationUrl;
    }
    if (!cleanUrl.includes("response_type=") && cleanUrl.includes("accounts.google.com")) {
      const sep = cleanUrl.includes("?") ? "&" : "?";
      cleanUrl = `${cleanUrl}${sep}response_type=code&access_type=offline&prompt=consent`;
    }
    return cleanUrl;
  }

  public saveAuthenticatedCredentials(params: BidirectionalSaveParams): BidirectionalSaveResult {
    return bidirectionalCredentialVault.saveOAuthResponseAndCredentials(params);
  }
}

export const modelAuthenticationFlowCoordinator = new ModelAuthenticationFlowCoordinator();
