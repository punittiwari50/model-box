import { randomUUID } from "@/utils/crypto/cryptoUtils.js";
import { coreDatabaseManager, type CoreDatabaseConnectionManager } from "@/database/CoreDatabaseEngine.js";

export interface ProviderOAuthClientRecord {
  readonly oauthClientConfigId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly clientAlias: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri?: string;
  readonly scopes?: readonly string[];
  readonly tenantId?: string;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly createdTimestamp: string;
  readonly updatedTimestamp: string;
}

export interface UpsertOAuthClientInput {
  readonly oauthClientConfigId?: string;
  readonly providerId: string;
  readonly modelId?: string;
  readonly clientAlias: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri?: string;
  readonly scopes?: readonly string[];
  readonly tenantId?: string;
  readonly isDefault?: boolean;
  readonly isActive?: boolean;
}

export interface IProviderOAuthClientRepository {
  listByProvider(providerId: string, modelId?: string): readonly ProviderOAuthClientRecord[];
  listAllActive(): readonly ProviderOAuthClientRecord[];
  resolveActiveClient(providerId: string, modelId?: string, clientConfigId?: string): ProviderOAuthClientRecord | null;
  upsertClient(input: UpsertOAuthClientInput): ProviderOAuthClientRecord;
  deleteClient(oauthClientConfigId: string): boolean;
}

/**
 * Multi-Client OAuth Configuration Repository (Requirement 7).
 * Stores and resolves multiple OAuth Client IDs and Client Secrets across different
 * model providers and models via the PROVIDER_OAUTH_CLIENTS database table,
 * eliminating hardcoded/single clientId/clientSecret entries in application.yml.
 */
export class ProviderOAuthClientRepository implements IProviderOAuthClientRepository {
  constructor(
    private readonly dbManager: CoreDatabaseConnectionManager = coreDatabaseManager,
  ) {}

  public listByProvider(providerId: string, modelId?: string): readonly ProviderOAuthClientRecord[] {
    try {
      const db = this.dbManager.getDatabase();
      const normalizedProvider = providerId.toLowerCase().trim();
      const rows = modelId
        ? (db
            .prepare(
              `SELECT * FROM PROVIDER_OAUTH_CLIENTS
               WHERE PROVIDER_ID = ? AND (MODEL_ID = ? OR MODEL_ID = '*')
               ORDER BY IS_DEFAULT DESC, IS_ACTIVE DESC, UPDATED_TIMESTAMP DESC`,
            )
            .all(normalizedProvider, modelId) as Record<string, unknown>[])
        : (db
            .prepare(
              `SELECT * FROM PROVIDER_OAUTH_CLIENTS
               WHERE PROVIDER_ID = ?
               ORDER BY IS_DEFAULT DESC, IS_ACTIVE DESC, UPDATED_TIMESTAMP DESC`,
            )
            .all(normalizedProvider) as Record<string, unknown>[]);
      return Object.freeze(rows.map((r) => this.mapRow(r)));
    } catch {
      return Object.freeze([]);
    }
  }

  public listAllActive(): readonly ProviderOAuthClientRecord[] {
    try {
      const db = this.dbManager.getDatabase();
      const rows = db
        .prepare(
          `SELECT * FROM PROVIDER_OAUTH_CLIENTS
           WHERE IS_ACTIVE = 1
           ORDER BY PROVIDER_ID ASC, IS_DEFAULT DESC, UPDATED_TIMESTAMP DESC`,
        )
        .all() as Record<string, unknown>[];
      return Object.freeze(rows.map((r) => this.mapRow(r)));
    } catch {
      return Object.freeze([]);
    }
  }

  public resolveActiveClient(
    providerId: string,
    modelId?: string,
    clientConfigId?: string,
  ): ProviderOAuthClientRecord | null {
    if (clientConfigId) {
      const byId = this.findById(clientConfigId);
      if (byId) return byId;
    }
    const candidates = this.listByProvider(providerId, modelId).filter((c) => c.isActive);
    if (candidates.length > 0) {
      const exactModel = modelId ? candidates.find((c) => c.modelId === modelId) : undefined;
      return exactModel ?? candidates[0];
    }
    return this.resolveFromModelAccountConfig(providerId, modelId);
  }

  public upsertClient(input: UpsertOAuthClientInput): ProviderOAuthClientRecord {
    const db = this.dbManager.getDatabase();
    const configId = input.oauthClientConfigId?.trim() || randomUUID();
    const providerId = input.providerId.toLowerCase().trim();
    const modelId = input.modelId?.trim() || "*";
    const now = new Date().toISOString();
    const isDefault = input.isDefault ? 1 : 0;
    const isActive = input.isActive !== false ? 1 : 0;
    const scopesText = input.scopes ? input.scopes.join(" ") : null;

    if (isDefault) {
      db.prepare(`UPDATE PROVIDER_OAUTH_CLIENTS SET IS_DEFAULT = 0 WHERE PROVIDER_ID = ? AND MODEL_ID = ?`).run(
        providerId,
        modelId,
      );
    }

    this.executeUpsertStatement(db, {
      configId,
      providerId,
      modelId,
      clientAlias: input.clientAlias,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      redirectUri: input.redirectUri || null,
      scopesText,
      tenantId: input.tenantId || null,
      isDefault,
      isActive,
      now,
    });

    return this.findById(configId)!;
  }

  private executeUpsertStatement(
    db: ReturnType<CoreDatabaseConnectionManager["getDatabase"]>,
    p: Record<string, string | number | null>,
  ): void {
    db.prepare(
      `INSERT INTO PROVIDER_OAUTH_CLIENTS (
        OAUTH_CLIENT_CONFIG_ID, PROVIDER_ID, MODEL_ID, CLIENT_ALIAS, CLIENT_ID, CLIENT_SECRET,
        REDIRECT_URI, SCOPES_TEXT, TENANT_ID, IS_DEFAULT, IS_ACTIVE, CREATED_TIMESTAMP, UPDATED_TIMESTAMP
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(OAUTH_CLIENT_CONFIG_ID) DO UPDATE SET
        PROVIDER_ID = excluded.PROVIDER_ID,
        MODEL_ID = excluded.MODEL_ID,
        CLIENT_ALIAS = excluded.CLIENT_ALIAS,
        CLIENT_ID = excluded.CLIENT_ID,
        CLIENT_SECRET = excluded.CLIENT_SECRET,
        REDIRECT_URI = excluded.REDIRECT_URI,
        SCOPES_TEXT = excluded.SCOPES_TEXT,
        TENANT_ID = excluded.TENANT_ID,
        IS_DEFAULT = excluded.IS_DEFAULT,
        IS_ACTIVE = excluded.IS_ACTIVE,
        UPDATED_TIMESTAMP = excluded.UPDATED_TIMESTAMP`,
    ).run(
      p.configId, p.providerId, p.modelId, p.clientAlias, p.clientId, p.clientSecret,
      p.redirectUri, p.scopesText, p.tenantId, p.isDefault, p.isActive, p.now, p.now,
    );
  }

  public deleteClient(oauthClientConfigId: string): boolean {
    try {
      const db = this.dbManager.getDatabase();
      const res = db
        .prepare(`DELETE FROM PROVIDER_OAUTH_CLIENTS WHERE OAUTH_CLIENT_CONFIG_ID = ?`)
        .run(oauthClientConfigId);
      return res.changes > 0;
    } catch {
      return false;
    }
  }

  private findById(oauthClientConfigId: string): ProviderOAuthClientRecord | null {
    try {
      const db = this.dbManager.getDatabase();
      const row = db
        .prepare(`SELECT * FROM PROVIDER_OAUTH_CLIENTS WHERE OAUTH_CLIENT_CONFIG_ID = ?`)
        .get(oauthClientConfigId) as Record<string, unknown> | undefined;
      return row ? this.mapRow(row) : null;
    } catch {
      return null;
    }
  }

  private resolveFromModelAccountConfig(
    providerId: string,
    modelId?: string,
  ): ProviderOAuthClientRecord | null {
    try {
      const db = this.dbManager.getDatabase();
      const rows = (modelId
        ? db.prepare(`SELECT * FROM MODEL_ACCOUNTS WHERE MODEL_ID = ? AND CONFIG_JSON IS NOT NULL ORDER BY IS_ACTIVE DESC, UPDATED_TIMESTAMP DESC`).all(modelId)
        : db.prepare(`SELECT * FROM MODEL_ACCOUNTS WHERE CONFIG_JSON IS NOT NULL ORDER BY IS_ACTIVE DESC, UPDATED_TIMESTAMP DESC`).all()) as Record<string, unknown>[];
      for (const r of rows) {
        const parsed = this.parseAccountConfigJson(r, providerId);
        if (parsed) return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseAccountConfigJson(
    row: Record<string, unknown>,
    providerId: string,
  ): ProviderOAuthClientRecord | null {
    try {
      const cfg = JSON.parse(String(row.CONFIG_JSON || "{}")) as Record<string, unknown>;
      const cfgProvider = String(cfg.provider || "").trim().toLowerCase();
      if (!cfgProvider || cfgProvider !== providerId.toLowerCase()) {
        return null;
      }
      const clientId = String(cfg.oauthClientId || cfg.clientId || "").trim();
      if (!clientId) return null;
      return Object.freeze({
        oauthClientConfigId: String(row.ACCOUNT_ID),
        providerId,
        modelId: String(row.MODEL_ID || "*"),
        clientAlias: String(row.ACCOUNT_NAME || `${providerId}-account-client`),
        clientId,
        clientSecret: String(cfg.oauthClientSecret || cfg.clientSecret || ""),
        redirectUri: cfg.redirectUri ? String(cfg.redirectUri) : undefined,
        isDefault: Boolean(row.IS_ACTIVE),
        isActive: Boolean(row.IS_ACTIVE),
        createdTimestamp: String(row.CREATED_TIMESTAMP || new Date().toISOString()),
        updatedTimestamp: String(row.UPDATED_TIMESTAMP || new Date().toISOString()),
      });
    } catch {
      return null;
    }
  }

  private mapRow(r: Record<string, unknown>): ProviderOAuthClientRecord {
    const scopesRaw = r.SCOPES_TEXT ? String(r.SCOPES_TEXT) : "";
    return Object.freeze({
      oauthClientConfigId: String(r.OAUTH_CLIENT_CONFIG_ID),
      providerId: String(r.PROVIDER_ID),
      modelId: String(r.MODEL_ID || "*"),
      clientAlias: String(r.CLIENT_ALIAS),
      clientId: String(r.CLIENT_ID),
      clientSecret: String(r.CLIENT_SECRET || ""),
      redirectUri: r.REDIRECT_URI ? String(r.REDIRECT_URI) : undefined,
      scopes: scopesRaw ? Object.freeze(scopesRaw.split(" ").filter(Boolean)) : undefined,
      tenantId: r.TENANT_ID ? String(r.TENANT_ID) : undefined,
      isDefault: Boolean(r.IS_DEFAULT),
      isActive: Boolean(r.IS_ACTIVE),
      createdTimestamp: String(r.CREATED_TIMESTAMP),
      updatedTimestamp: String(r.UPDATED_TIMESTAMP),
    });
  }
}

export const providerOAuthClientRepository: IProviderOAuthClientRepository =
  new ProviderOAuthClientRepository();
