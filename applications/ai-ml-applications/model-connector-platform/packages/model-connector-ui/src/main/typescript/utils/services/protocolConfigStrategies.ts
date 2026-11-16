export type ConfigProtocolType = "api" | "cli" | "cookie" | "oauth";
export type StorageAuthType = "api_key" | "cli_oauth" | "cookie" | "oauth";

export interface ProtocolFormContext {
  readonly apiKey: string;
  readonly apiBaseUrl: string;
  readonly apiVersion: string;
  readonly cliExecutable: string;
  readonly cliArgs: string;
  readonly cliWorkingDir: string;
  readonly cookieString: string;
  readonly cookieDomain: string;
  readonly cookiePath: string;
  readonly oauthClientId: string;
  readonly oauthClientSecret: string;
  readonly oauthAuthUrl: string;
  readonly oauthTokenUrl: string;
  readonly oauthScopes: string;
  readonly selectedProviderId: string;
  readonly oauthAccessToken?: string;
  readonly oauthAuthorizedTimestamp?: string;
  readonly oauthRefreshToken?: string;
}

export interface IProtocolConfigStrategy {
  readonly protocolId: ConfigProtocolType;
  readonly storageAuthType: StorageAuthType;
  resolveCredentialValue(ctx: ProtocolFormContext): string;
  buildConfigObject(ctx: ProtocolFormContext): Record<string, unknown>;
}

export interface IProtocolConfigStrategyRegistry {
  resolve(protocol: ConfigProtocolType): IProtocolConfigStrategy;
}

export class ApiProtocolConfigStrategy implements IProtocolConfigStrategy {
  public readonly protocolId = "api" as const;
  public readonly storageAuthType = "api_key" as const;

  public resolveCredentialValue(ctx: ProtocolFormContext): string {
    return ctx.apiKey.trim();
  }

  public buildConfigObject(ctx: ProtocolFormContext): Record<string, unknown> {
    return {
      apiBaseUrl: ctx.apiBaseUrl,
      apiVersion: ctx.apiVersion,
      headers: { "X-Goog-Api-Client": "model-connector/1.0" },
    };
  }
}

export class CliProtocolConfigStrategy implements IProtocolConfigStrategy {
  public readonly protocolId = "cli" as const;
  public readonly storageAuthType = "cli_oauth" as const;

  public resolveCredentialValue(ctx: ProtocolFormContext): string {
    return `${ctx.cliExecutable} ${ctx.cliArgs}`.trim();
  }

  public buildConfigObject(ctx: ProtocolFormContext): Record<string, unknown> {
    return {
      cliExecutable: ctx.cliExecutable,
      cliArguments: ctx.cliArgs,
      cliWorkingDir: ctx.cliWorkingDir,
    };
  }
}

export class CookieProtocolConfigStrategy implements IProtocolConfigStrategy {
  public readonly protocolId = "cookie" as const;
  public readonly storageAuthType = "cookie" as const;

  public resolveCredentialValue(ctx: ProtocolFormContext): string {
    return ctx.cookieString.trim();
  }

  public buildConfigObject(ctx: ProtocolFormContext): Record<string, unknown> {
    return {
      cookieDomain: ctx.cookieDomain,
      cookiePath: ctx.cookiePath,
    };
  }
}

export class OAuthProtocolConfigStrategy implements IProtocolConfigStrategy {
  public readonly protocolId = "oauth" as const;
  public readonly storageAuthType = "oauth" as const;

  public resolveCredentialValue(ctx: ProtocolFormContext): string {
    return ctx.oauthAccessToken || "";
  }

  public buildConfigObject(ctx: ProtocolFormContext): Record<string, unknown> {
    return {
      oauthClientId: ctx.oauthClientId,
      oauthClientSecret: ctx.oauthClientSecret,
      oauthAuthUrl: ctx.oauthAuthUrl,
      oauthTokenUrl: ctx.oauthTokenUrl,
      oauthScopes: ctx.oauthScopes,
      providerId: ctx.selectedProviderId,
      isAuthorized: Boolean(ctx.oauthAccessToken),
      authorizedTimestamp: ctx.oauthAuthorizedTimestamp,
      refreshToken: ctx.oauthRefreshToken,
    };
  }
}

export class ProtocolConfigStrategyRegistry implements IProtocolConfigStrategyRegistry {
  private readonly strategies = new Map<ConfigProtocolType, IProtocolConfigStrategy>();
  private readonly fallbackStrategy = new OAuthProtocolConfigStrategy();

  constructor(customStrategies?: readonly IProtocolConfigStrategy[]) {
    const list = customStrategies ?? [
      new ApiProtocolConfigStrategy(),
      new CliProtocolConfigStrategy(),
      new CookieProtocolConfigStrategy(),
      this.fallbackStrategy,
    ];
    for (const strategy of list) {
      this.strategies.set(strategy.protocolId, strategy);
    }
  }

  public resolve(protocol: ConfigProtocolType): IProtocolConfigStrategy {
    return this.strategies.get(protocol) ?? this.fallbackStrategy;
  }
}

export const protocolConfigStrategyRegistry: IProtocolConfigStrategyRegistry =
  new ProtocolConfigStrategyRegistry();
