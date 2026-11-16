import {
  coreDatabaseManager,
  providerOAuthClientRepository,
  type CoreDatabaseConnectionManager,
  type IProviderOAuthClientRepository,
  type ProviderOAuthClientRecord,
} from "@model-box/model-connector-core";

export interface ResolvedUserModelCredential {
  readonly accountId: string;
  readonly modelId: string;
  readonly accountName: string;
  readonly userEmail: string;
  readonly authType: string;
  readonly apiKey?: string;
  readonly oauthToken?: string;
  readonly cookieData?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly redirectUri?: string;
  readonly isActive: boolean;
  readonly configJson?: Readonly<Record<string, unknown>>;
  readonly customLocation?: string;
  readonly credentialsFileContent?: string;
  readonly credentialsFileName?: string;
  readonly authMethod?: string;
  readonly tokens?: Readonly<Record<string, unknown>>;
}

export interface CredentialLookupCriteria {
  readonly modelId: string;
  readonly userId?: string;
  readonly userEmail?: string;
  readonly accountId?: string;
  readonly providerId?: string;
}

export interface IUserModelCredentialResolver {
  resolveUserCredential(criteria: CredentialLookupCriteria): ResolvedUserModelCredential | null;
  resolveOAuthClient(providerId: string, modelId?: string): ProviderOAuthClientRecord | null;
  registerCredentialOverride(key: string, credential: ResolvedUserModelCredential): void;
}

/**
 * Database-Backed User-Specific Model Credential & OAuth Client Resolver.
 * Queries MODEL_ACCOUNTS and PROVIDER_OAUTH_CLIENTS for user-specific model execution.
 * Conforms to:
 * - STD-COD-005: Dependency Injection & SOLID Principles
 * - STD-COD-007: Immutability by Default & <= 20 lines per function
 */
export class DatabaseUserModelCredentialResolver implements IUserModelCredentialResolver {
  private readonly overrides = new Map<string, ResolvedUserModelCredential>();

  constructor(
    private readonly dbManager: CoreDatabaseConnectionManager = coreDatabaseManager,
    private readonly oauthClientRepo: IProviderOAuthClientRepository = providerOAuthClientRepository,
  ) {}

  public registerCredentialOverride(key: string, credential: ResolvedUserModelCredential): void {
    this.overrides.set(key.toLowerCase().trim(), Object.freeze({ ...credential }));
  }

  public resolveOAuthClient(providerId: string, modelId?: string): ProviderOAuthClientRecord | null {
    return this.oauthClientRepo.resolveActiveClient(providerId, modelId);
  }

  public resolveUserCredential(criteria: CredentialLookupCriteria): ResolvedUserModelCredential | null {
    const fromOverride = this.lookupOverride(criteria);
    if (fromOverride) {
      return fromOverride;
    }
    const row = this.queryAccountRow(criteria);
    if (!row) {
      return null;
    }
    return this.mapAccountRow(row, criteria.providerId);
  }

  private lookupOverride(criteria: CredentialLookupCriteria): ResolvedUserModelCredential | null {
    const emailKey = criteria.userEmail ? `${criteria.modelId}:${criteria.userEmail}`.toLowerCase() : "";
    if (emailKey && this.overrides.has(emailKey)) {
      return this.overrides.get(emailKey) ?? null;
    }
    const userKey = criteria.userId ? `${criteria.modelId}:${criteria.userId}`.toLowerCase() : "";
    if (userKey && this.overrides.has(userKey)) {
      return this.overrides.get(userKey) ?? null;
    }
    return this.overrides.get(criteria.modelId.toLowerCase()) ?? null;
  }

  private queryAccountRow(criteria: CredentialLookupCriteria): Record<string, unknown> | null {
    try {
      if (criteria.accountId) {
        const byAccount = this.queryByAccountId(criteria.accountId);
        if (byAccount) return byAccount;
      }
      if (criteria.userEmail) {
        const byEmail = this.queryByModelAndEmail(criteria.modelId, criteria.userEmail);
        if (byEmail) return byEmail;
      }
      return this.queryActiveByModel(criteria.modelId);
    } catch {
      return null;
    }
  }

  private queryByAccountId(accountId: string): Record<string, unknown> | null {
    const db = this.dbManager.getDatabase();
    const row = db
      .prepare(`SELECT * FROM MODEL_ACCOUNTS WHERE ACCOUNT_ID = ? LIMIT 1`)
      .get(accountId) as Record<string, unknown> | undefined;
    return row ?? null;
  }

  private queryByModelAndEmail(modelId: string, userEmail: string): Record<string, unknown> | null {
    const db = this.dbManager.getDatabase();
    const row = db
      .prepare(
        `SELECT * FROM MODEL_ACCOUNTS
         WHERE MODEL_ID = ? AND LOWER(USER_EMAIL) = LOWER(?)
         ORDER BY IS_ACTIVE DESC, UPDATED_TIMESTAMP DESC LIMIT 1`,
      )
      .get(modelId, userEmail.trim()) as Record<string, unknown> | undefined;
    return row ?? null;
  }

  private queryActiveByModel(modelId: string): Record<string, unknown> | null {
    const db = this.dbManager.getDatabase();
    const row = db
      .prepare(
        `SELECT * FROM MODEL_ACCOUNTS
         WHERE MODEL_ID = ?
         ORDER BY IS_ACTIVE DESC, UPDATED_TIMESTAMP DESC LIMIT 1`,
      )
      .get(modelId) as Record<string, unknown> | undefined;
    return row ?? null;
  }

  private mapAccountRow(
    row: Record<string, unknown>,
    providerId?: string,
  ): ResolvedUserModelCredential {
    const configJson = this.parseJsonSafe(row.CONFIG_JSON);
    const modelId = String(row.MODEL_ID || "");
    const oauthClient = providerId ? this.resolveOAuthClient(providerId, modelId) : null;
    const rawKey = row.API_KEY ? String(row.API_KEY) : undefined;
    const tokenFromCfg = configJson.oauthAccessToken ? String(configJson.oauthAccessToken) : undefined;
    return Object.freeze({
      accountId: String(row.ACCOUNT_ID || ""),
      modelId,
      accountName: String(row.ACCOUNT_NAME || ""),
      userEmail: String(row.USER_EMAIL || ""),
      authType: String(row.AUTH_TYPE || "api_key"),
      apiKey: rawKey,
      oauthToken: tokenFromCfg ?? rawKey,
      cookieData: row.COOKIE_DATA ? String(row.COOKIE_DATA) : undefined,
      clientId: oauthClient?.clientId ?? (configJson.oauthClientId ? String(configJson.oauthClientId) : undefined),
      clientSecret: oauthClient?.clientSecret,
      redirectUri: oauthClient?.redirectUri,
      isActive: Boolean(row.IS_ACTIVE),
      configJson,
      customLocation: configJson.customLocation ? String(configJson.customLocation) : undefined,
      credentialsFileContent: configJson.credentialsFileContent ? String(configJson.credentialsFileContent) : undefined,
      credentialsFileName: configJson.credentialsFileName ? String(configJson.credentialsFileName) : undefined,
      authMethod: configJson.authMethod ? String(configJson.authMethod) : undefined,
      tokens: typeof configJson.tokens === "object" && configJson.tokens !== null ? (configJson.tokens as Record<string, unknown>) : undefined,
    });
  }

  private parseJsonSafe(raw: unknown): Readonly<Record<string, unknown>> {
    if (!raw) {
      return Object.freeze({});
    }
    try {
      const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
      return Object.freeze(parsed);
    } catch {
      return Object.freeze({});
    }
  }
}

export const defaultUserModelCredentialResolver: IUserModelCredentialResolver =
  new DatabaseUserModelCredentialResolver();

