import type { Request, Response } from "express";
import { HttpStatus } from "@/constants/index";
import { modelOAuthProviderService } from "@/services/modelOAuthProviderService";
import { accountRepository } from "@/repositories/accountRepository";
import { oauthCallbackServer } from "@/services/oauthCallbackServer";
import { OAuthExecutorFactory } from "@/services/oauth";
import {
  protocolVerificationRegistry,
  type IProtocolVerificationRegistry,
} from "@/services/verification/connectionVerificationStrategies";
import {
  modelProviderConfigService,
  ollamaModelDiscoveryCache,
  type IOllamaModelDiscoveryCache,
  type IProviderConfigRegistry,
} from "@model-box/model-connector-core";

export interface TestConnectionRequest {
  readonly modelId: string;
  readonly authType: "api" | "cli" | "cookie" | "oauth" | "api_key" | "cli_oauth";
  readonly credentialValue: string;
  readonly prompt?: string;
  readonly config?: {
    readonly apiBaseUrl?: string;
    readonly apiVersion?: string;
    readonly headers?: Record<string, string>;
    readonly cliExecutable?: string;
    readonly cliArguments?: string;
    readonly cookieDomain?: string;
    readonly oauthClientId?: string;
    readonly oauthTokenUrl?: string;
    readonly oauthScopes?: string;
  };
}

export interface ConnectionTestResult {
  readonly status: "VERIFIED" | "FAILED" | "DEGRADED";
  readonly protocol: string;
  readonly message: string;
  readonly latencyMs: number;
  readonly modelOutput?: string;
  readonly errorMessage?: string;
  readonly details: Record<string, unknown>;
}

/**
 * Controller for Model Connection Verification, OAuth Handshake, and CLI Login.
 * Uses Strategy Pattern + Dependency Injection (STD-COD-005) for protocol & provider dispatch.
 */
export class ModelConfigController {
  constructor(
    private readonly verificationRegistry: IProtocolVerificationRegistry = protocolVerificationRegistry,
    private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    private readonly ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
  ) {}

  public async getProviderCatalog(req: Request, res: Response): Promise<void> {
    const forceRefresh = req.query.refresh === "true";
    await this.warmProviderCaches(forceRefresh);
    res.status(HttpStatus.OK).json({
      success: true,
      platformUrls: this.buildPlatformUrlsPayload(),
      providers: this.configRegistry.getAllProviderConfigs(),
      ollamaCache: this.ollamaCache.getCacheMetadata(),
      providerCaches: this.configRegistry.getAllProvidersCacheMetadata(),
      oauthClients: modelOAuthProviderService.listAllProviderOAuthClients(),
      correlationId: req.correlationId,
    });
  }

  private async warmProviderCaches(forceRefresh: boolean): Promise<void> {
    await this.ollamaCache.getAvailableModels(forceRefresh);
    for (const cfg of this.configRegistry.getAllProviderConfigs()) {
      await this.configRegistry.getProviderModels(cfg.providerId, forceRefresh);
    }
  }

  private buildPlatformUrlsPayload(): Readonly<Record<string, string>> {
    return Object.freeze({
      uiBaseUrl: this.configRegistry.getPlatformUrl("uiBaseUrl"),
      serviceBaseUrl: this.configRegistry.getPlatformUrl("serviceBaseUrl"),
      oauthCallbackUrl: this.configRegistry.getPlatformUrl("oauthCallbackUrl"),
      oauthAuthorizeChooserUrl: this.configRegistry.getPlatformUrl("oauthAuthorizeChooserUrl"),
      ollamaOAuthBaseUrl: this.configRegistry.getPlatformUrl("ollamaOAuthBaseUrl"),
    });
  }

  public async getProviderModelsCached(req: Request, res: Response): Promise<void> {
    const { providerId } = req.params;
    const forceRefresh = req.query.refresh === "true";
    const models = await this.configRegistry.getProviderModels(providerId, forceRefresh);
    const cacheMeta = this.configRegistry.getAllProvidersCacheMetadata()[providerId];
    res.status(HttpStatus.OK).json({
      success: true,
      providerId,
      models,
      cache: cacheMeta,
      correlationId: req.correlationId,
    });
  }

  public listProviderOAuthClients(req: Request, res: Response): void {
    const { providerId } = req.params;
    const clients = modelOAuthProviderService.listProviderOAuthClients(providerId);
    res.status(HttpStatus.OK).json({
      success: true,
      providerId,
      clients,
      correlationId: req.correlationId,
    });
  }

  public upsertProviderOAuthClient(req: Request, res: Response): void {
    const { providerId } = req.params;
    const {
      oauthClientConfigId,
      modelId,
      clientAlias,
      clientName,
      clientId,
      clientSecret,
      redirectUri,
      scopes,
      isDefault,
    } = req.body ?? {};
    try {
      const saved = modelOAuthProviderService.upsertProviderOAuthClient({
        providerId,
        oauthClientConfigId,
        modelId,
        clientAlias,
        clientName,
        clientId,
        clientSecret,
        redirectUri,
        scopes,
        isDefault,
      });
      res.status(HttpStatus.CREATED).json({
        success: true,
        client: saved,
        correlationId: req.correlationId,
      });
    } catch (err: unknown) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err instanceof Error ? err.message : "Failed to register provider OAuth client.",
        correlationId: req.correlationId,
      });
    }
  }

  public deleteProviderOAuthClient(req: Request, res: Response): void {
    const { clientConfigId } = req.params;
    const deleted = modelOAuthProviderService.deleteProviderOAuthClient(clientConfigId);
    res.status(deleted ? HttpStatus.OK : HttpStatus.NOT_FOUND).json({
      success: deleted,
      clientConfigId,
      correlationId: req.correlationId,
    });
  }

  public async testConnection(req: Request, res: Response): Promise<void> {
    const { modelId, authType, credentialValue, prompt } = req.body as TestConnectionRequest;

    if (!modelId || !authType) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Missing modelId or authType for connection verification.",
        correlationId: req.correlationId,
      });
      return;
    }

    const startTime = Date.now();
    const userPrompt = prompt?.trim() || "Hi , whats date time now ?";
    const strategy = this.verificationRegistry.resolve(authType);
    const testResult = await strategy.verify({
      modelId,
      credentialValue: credentialValue || "",
      userPrompt,
      startTime,
    });

    this.deactivateAccountOnFailure(modelId, credentialValue, testResult.status);

    res.status(HttpStatus.OK).json({
      success: testResult.status === "VERIFIED",
      modelId,
      result: testResult,
      correlationId: req.correlationId,
    });
  }

  private deactivateAccountOnFailure(modelId: string, credentialValue: string, status: string): void {
    if (status !== "FAILED") return;
    const active = accountRepository.getActiveAccount(modelId);
    if (!active) return;
    const matchesActive = !credentialValue ? true : active.credentialValue === credentialValue;
    if (matchesActive) {
      accountRepository.deactivateActiveAccount(modelId);
    }
  }

  public getOAuthConfig(req: Request, res: Response): void {
    const { modelId } = req.params;
    const redirectUri = req.query.redirectUri ? String(req.query.redirectUri) : undefined;
    const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
    try {
      const config = modelOAuthProviderService.getOAuthConfigForModel(modelId, redirectUri, clientId);
      res.status(HttpStatus.OK).json({
        success: true,
        config,
        correlationId: req.correlationId,
      });
    } catch (err: unknown) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err instanceof Error ? err.message : "Invalid OAuth configuration",
        correlationId: req.correlationId,
      });
    }
  }

  public async exchangeOAuthToken(req: Request, res: Response): Promise<void> {
    const { modelId } = req.params;
    const { code, userEmail, clientId, clientSecret, redirectUri, accountName } = req.body || {};
    const strategy = modelOAuthProviderService.resolveStrategy(modelId);
    const descriptor = strategy.getDescriptor(modelId);

    try {
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
      const savedAccount = accountRepository.createAccount({
        modelId,
        accountName: accountName || `${descriptor.providerName} (${resolvedEmail})`,
        userEmail: resolvedEmail,
        authType: "cli_oauth",
        credentialValue: result.accessToken,
        isActive: true,
        configJson: JSON.stringify({
          provider: descriptor.provider,
          oauthClientId: clientId || descriptor.defaultClientId,
          oauthTokenUrl: descriptor.tokenEndpoint,
          oauthAuthUrl: descriptor.authorizationEndpoint,
          oauthScopes: descriptor.defaultScopes,
          refreshToken: result.refreshToken,
          authorizedTimestamp: result.authorizedTimestamp,
        }),
      });

      res.status(HttpStatus.OK).json({
        success: true,
        modelId,
        result,
        account: savedAccount,
        correlationId: req.correlationId,
      });
    } catch (err: unknown) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        modelId,
        message: err instanceof Error ? err.message : "OAuth code exchange failed",
        correlationId: req.correlationId,
      });
    }
  }

  public executeCliLogin(req: Request, res: Response): void {
    const { modelId } = req.params;
    const { userEmail, accountCategory } = req.body || {};
    const loginResult = modelOAuthProviderService.executeCliLogin(modelId, {
      userEmail,
      accountCategory,
    });

    res.status(HttpStatus.OK).json({
      success: true,
      modelId,
      loginResult,
      message: `CLI login instructions generated for ${loginResult.cliCommand}`,
      correlationId: req.correlationId,
    });
  }

  public getLatestOAuthCallback(req: Request, res: Response): void {
    const { modelId } = req.params;
    const session = oauthCallbackServer.getLatestSession(modelId);
    res.status(HttpStatus.OK).json({
      success: Boolean(session),
      session: session || null,
      correlationId: req.correlationId,
    });
  }

  public async verifyOAuthManual(req: Request, res: Response): Promise<void> {
    const { modelId } = req.params;
    const { input, userEmail } = req.body || {};

    if (!input || !String(input).trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Please provide a callback URL, code, or token to verify.",
        correlationId: req.correlationId,
      });
      return;
    }

    try {
      const session = await oauthCallbackServer.registerManualAuthorization(modelId, String(input), userEmail);
      res.status(HttpStatus.OK).json({
        success: true,
        session,
        message: `Successfully verified and registered account for ${session.email}`,
        correlationId: req.correlationId,
      });
    } catch (err: unknown) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err instanceof Error ? err.message : "Manual verification failed",
        correlationId: req.correlationId,
      });
    }
  }
}

export const modelConfigController = new ModelConfigController();
