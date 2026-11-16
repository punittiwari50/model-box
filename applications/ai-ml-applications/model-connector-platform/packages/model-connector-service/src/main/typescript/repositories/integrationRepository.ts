import { platformDatabase } from "@/database/platformDatabase";

export interface IntegrationRecord {
  readonly integrationId: string;
  readonly providerName: string;
  readonly providerShortCode: string;
  readonly category: string;
  readonly description: string;
  readonly icon: string;
  readonly brandColor: string;
  readonly accountCategory: "individual" | "enterprise";
  readonly supportedProtocols: readonly string[];
  readonly capabilities: readonly string[];
  readonly authUrl: string;
  readonly tokenUrl: string;
  readonly apiBaseUrl: string;
  readonly cliCommand: string;
  readonly docsUrl: string;
  readonly lifecycleStatus: "ACTIVE" | "INACTIVE" | "DRAFT";
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly createdTimestamp: string;
  readonly updatedTimestamp: string;
}

export interface UpsertIntegrationInput {
  readonly integrationId: string;
  readonly providerName: string;
  readonly providerShortCode?: string;
  readonly category: string;
  readonly description?: string;
  readonly icon?: string;
  readonly brandColor?: string;
  readonly accountCategory?: "individual" | "enterprise";
  readonly supportedProtocols: readonly string[];
  readonly capabilities: readonly string[];
  readonly authUrl?: string;
  readonly tokenUrl?: string;
  readonly apiBaseUrl?: string;
  readonly cliCommand?: string;
  readonly docsUrl?: string;
  readonly lifecycleStatus?: "ACTIVE" | "INACTIVE" | "DRAFT";
  readonly actorUserId?: string;
}

const INTEGRATION_SELECT_PG = `
  SELECT
    INTEGRATION_ID as "integrationId",
    PROVIDER_NAME as "providerName",
    PROVIDER_SHORT_CODE as "providerShortCode",
    CATEGORY as "category",
    DESCRIPTION as "description",
    ICON as "icon",
    BRAND_COLOR as "brandColor",
    ACCOUNT_CATEGORY as "accountCategory",
    SUPPORTED_PROTOCOLS as "supportedProtocols",
    CAPABILITIES_JSON as "capabilitiesJson",
    AUTH_URL as "authUrl",
    TOKEN_URL as "tokenUrl",
    API_BASE_URL as "apiBaseUrl",
    CLI_COMMAND as "cliCommand",
    DOCS_URL as "docsUrl",
    LIFECYCLE_STATUS as "lifecycleStatus",
    CREATED_BY as "createdBy",
    UPDATED_BY as "updatedBy",
    CREATED_TIMESTAMP as "createdTimestamp",
    UPDATED_TIMESTAMP as "updatedTimestamp"
  FROM INTEGRATIONS
`;

const INTEGRATION_SELECT_SQLITE = `
  SELECT
    INTEGRATION_ID as integrationId,
    PROVIDER_NAME as providerName,
    PROVIDER_SHORT_CODE as providerShortCode,
    CATEGORY as category,
    DESCRIPTION as description,
    ICON as icon,
    BRAND_COLOR as brandColor,
    ACCOUNT_CATEGORY as accountCategory,
    SUPPORTED_PROTOCOLS as supportedProtocols,
    CAPABILITIES_JSON as capabilitiesJson,
    AUTH_URL as authUrl,
    TOKEN_URL as tokenUrl,
    API_BASE_URL as apiBaseUrl,
    CLI_COMMAND as cliCommand,
    DOCS_URL as docsUrl,
    LIFECYCLE_STATUS as lifecycleStatus,
    CREATED_BY as createdBy,
    UPDATED_BY as updatedBy,
    CREATED_TIMESTAMP as createdTimestamp,
    UPDATED_TIMESTAMP as updatedTimestamp
  FROM INTEGRATIONS
`;

export class IntegrationRepository {
  public async listAllAsync(): Promise<IntegrationRecord[]> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<Record<string, unknown>>(`${INTEGRATION_SELECT_PG} ORDER BY PROVIDER_NAME ASC`);
      return rows.map((row) => this.mapRow(row));
    } catch {
      return this.listAllSync();
    }
  }

  public async findByIdAsync(integrationId: string): Promise<IntegrationRecord | undefined> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<Record<string, unknown>>(
        `${INTEGRATION_SELECT_PG} WHERE INTEGRATION_ID = $1`,
        [integrationId],
      );
      return rows.length > 0 ? this.mapRow(rows[0]) : undefined;
    } catch {
      return this.findByIdSync(integrationId);
    }
  }

  public async createAsync(input: UpsertIntegrationInput): Promise<IntegrationRecord> {
    const record = this.buildNormalizedRecord(input);
    const serializedCaps = JSON.stringify(record.capabilities);
    const serializedProtos = record.supportedProtocols.join(",");
    try {
      const pg = platformDatabase.getPostgresManager();
      await pg.execute(
        `INSERT INTO INTEGRATIONS (
          INTEGRATION_ID, PROVIDER_NAME, PROVIDER_SHORT_CODE, CATEGORY, DESCRIPTION,
          ICON, BRAND_COLOR, ACCOUNT_CATEGORY, SUPPORTED_PROTOCOLS, CAPABILITIES_JSON,
          AUTH_URL, TOKEN_URL, API_BASE_URL, CLI_COMMAND, DOCS_URL, LIFECYCLE_STATUS,
          CREATED_BY, UPDATED_BY, CREATED_TIMESTAMP, UPDATED_TIMESTAMP
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          record.integrationId, record.providerName, record.providerShortCode, record.category, record.description,
          record.icon, record.brandColor, record.accountCategory, serializedProtos, serializedCaps,
          record.authUrl, record.tokenUrl, record.apiBaseUrl, record.cliCommand, record.docsUrl, record.lifecycleStatus,
          record.createdBy || "usr-admin", record.updatedBy || "usr-admin", record.createdTimestamp, record.updatedTimestamp,
        ],
      );
    } catch {
      this.createSync(record, serializedProtos, serializedCaps);
    }
    return record;
  }

  public async updateAsync(integrationId: string, input: Partial<UpsertIntegrationInput>): Promise<IntegrationRecord | undefined> {
    const existing = await this.findByIdAsync(integrationId);
    if (!existing) return undefined;

    const merged: IntegrationRecord = {
      ...existing,
      providerName: input.providerName ?? existing.providerName,
      providerShortCode: input.providerShortCode ?? existing.providerShortCode,
      category: input.category ?? existing.category,
      description: input.description ?? existing.description,
      icon: input.icon ?? existing.icon,
      brandColor: input.brandColor ?? existing.brandColor,
      accountCategory: input.accountCategory ?? existing.accountCategory,
      supportedProtocols: input.supportedProtocols ?? existing.supportedProtocols,
      capabilities: input.capabilities ?? existing.capabilities,
      authUrl: input.authUrl ?? existing.authUrl,
      tokenUrl: input.tokenUrl ?? existing.tokenUrl,
      apiBaseUrl: input.apiBaseUrl ?? existing.apiBaseUrl,
      cliCommand: input.cliCommand ?? existing.cliCommand,
      docsUrl: input.docsUrl ?? existing.docsUrl,
      lifecycleStatus: input.lifecycleStatus ?? existing.lifecycleStatus,
      updatedBy: input.actorUserId ?? existing.updatedBy,
      updatedTimestamp: new Date().toISOString(),
    };

    try {
      const pg = platformDatabase.getPostgresManager();
      await pg.execute(
        `UPDATE INTEGRATIONS SET
          PROVIDER_NAME = $2, PROVIDER_SHORT_CODE = $3, CATEGORY = $4, DESCRIPTION = $5,
          ICON = $6, BRAND_COLOR = $7, ACCOUNT_CATEGORY = $8, SUPPORTED_PROTOCOLS = $9,
          CAPABILITIES_JSON = $10, AUTH_URL = $11, TOKEN_URL = $12, API_BASE_URL = $13,
          CLI_COMMAND = $14, DOCS_URL = $15, LIFECYCLE_STATUS = $16, UPDATED_BY = $17,
          UPDATED_TIMESTAMP = $18
         WHERE INTEGRATION_ID = $1`,
        [
          merged.integrationId, merged.providerName, merged.providerShortCode, merged.category, merged.description,
          merged.icon, merged.brandColor, merged.accountCategory, merged.supportedProtocols.join(","),
          JSON.stringify(merged.capabilities), merged.authUrl, merged.tokenUrl, merged.apiBaseUrl,
          merged.cliCommand, merged.docsUrl, merged.lifecycleStatus, merged.updatedBy || "usr-admin", merged.updatedTimestamp,
        ],
      );
    } catch {
      this.updateSync(merged);
    }
    return merged;
  }

  public async deleteAsync(integrationId: string): Promise<boolean> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{ integrationId: string }>(
        `DELETE FROM INTEGRATIONS WHERE INTEGRATION_ID = $1 RETURNING INTEGRATION_ID as "integrationId"`,
        [integrationId],
      );
      return rows.length > 0;
    } catch {
      const db = platformDatabase.getDatabase();
      const result = db.prepare("DELETE FROM INTEGRATIONS WHERE INTEGRATION_ID = ?").run(integrationId);
      return Number(result.changes || 0) > 0;
    }
  }

  private listAllSync(): IntegrationRecord[] {
    const db = platformDatabase.getDatabase();
    const rows = db.prepare(`${INTEGRATION_SELECT_SQLITE} ORDER BY PROVIDER_NAME ASC`).all() as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  private findByIdSync(integrationId: string): IntegrationRecord | undefined {
    const db = platformDatabase.getDatabase();
    const row = db.prepare(`${INTEGRATION_SELECT_SQLITE} WHERE INTEGRATION_ID = ?`).get(integrationId) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  private createSync(record: IntegrationRecord, protos: string, capsJson: string): void {
    const db = platformDatabase.getDatabase();
    db.prepare(
      `INSERT INTO INTEGRATIONS (
        INTEGRATION_ID, PROVIDER_NAME, PROVIDER_SHORT_CODE, CATEGORY, DESCRIPTION,
        ICON, BRAND_COLOR, ACCOUNT_CATEGORY, SUPPORTED_PROTOCOLS, CAPABILITIES_JSON,
        AUTH_URL, TOKEN_URL, API_BASE_URL, CLI_COMMAND, DOCS_URL, LIFECYCLE_STATUS,
        CREATED_BY, UPDATED_BY, CREATED_TIMESTAMP, UPDATED_TIMESTAMP
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      record.integrationId, record.providerName, record.providerShortCode, record.category, record.description,
      record.icon, record.brandColor, record.accountCategory, protos, capsJson,
      record.authUrl, record.tokenUrl, record.apiBaseUrl, record.cliCommand, record.docsUrl, record.lifecycleStatus,
      record.createdBy || "usr-admin", record.updatedBy || "usr-admin", record.createdTimestamp, record.updatedTimestamp,
    );
  }

  private updateSync(record: IntegrationRecord): void {
    const db = platformDatabase.getDatabase();
    db.prepare(
      `UPDATE INTEGRATIONS SET
        PROVIDER_NAME = ?, PROVIDER_SHORT_CODE = ?, CATEGORY = ?, DESCRIPTION = ?,
        ICON = ?, BRAND_COLOR = ?, ACCOUNT_CATEGORY = ?, SUPPORTED_PROTOCOLS = ?,
        CAPABILITIES_JSON = ?, AUTH_URL = ?, TOKEN_URL = ?, API_BASE_URL = ?,
        CLI_COMMAND = ?, DOCS_URL = ?, LIFECYCLE_STATUS = ?, UPDATED_BY = ?,
        UPDATED_TIMESTAMP = ?
       WHERE INTEGRATION_ID = ?`,
    ).run(
      record.providerName, record.providerShortCode, record.category, record.description,
      record.icon, record.brandColor, record.accountCategory, record.supportedProtocols.join(","),
      JSON.stringify(record.capabilities), record.authUrl, record.tokenUrl, record.apiBaseUrl,
      record.cliCommand, record.docsUrl, record.lifecycleStatus, record.updatedBy || "usr-admin",
      record.updatedTimestamp, record.integrationId,
    );
  }

  private buildNormalizedRecord(input: UpsertIntegrationInput): IntegrationRecord {
    const now = new Date().toISOString();
    const shortCode = (input.providerShortCode || input.providerName.slice(0, 2)).toUpperCase();
    return {
      integrationId: input.integrationId.trim().toLowerCase(),
      providerName: input.providerName.trim(),
      providerShortCode: shortCode,
      category: input.category.trim(),
      description: (input.description || "").trim(),
      icon: input.icon || "🧩",
      brandColor: input.brandColor || "#2563EB",
      accountCategory: input.accountCategory || "enterprise",
      supportedProtocols: input.supportedProtocols.length > 0 ? input.supportedProtocols : ["api"],
      capabilities: input.capabilities,
      authUrl: (input.authUrl || "").trim(),
      tokenUrl: (input.tokenUrl || "").trim(),
      apiBaseUrl: (input.apiBaseUrl || "").trim(),
      cliCommand: (input.cliCommand || "").trim(),
      docsUrl: (input.docsUrl || "").trim(),
      lifecycleStatus: input.lifecycleStatus || "ACTIVE",
      createdBy: input.actorUserId || "usr-admin",
      updatedBy: input.actorUserId || "usr-admin",
      createdTimestamp: now,
      updatedTimestamp: now,
    };
  }

  private mapRow(row: Record<string, unknown>): IntegrationRecord {
    const rawProtos = String(row.supportedProtocols || "api");
    const rawCaps = String(row.capabilitiesJson || "[]");
    let capabilities: string[] = [];
    try {
      const parsed = JSON.parse(rawCaps);
      if (Array.isArray(parsed)) capabilities = parsed.map(String);
    } catch {
      capabilities = [];
    }

    return {
      integrationId: String(row.integrationId),
      providerName: String(row.providerName),
      providerShortCode: String(row.providerShortCode || ""),
      category: String(row.category || "AI Model Providers"),
      description: String(row.description || ""),
      icon: String(row.icon || "🧩"),
      brandColor: String(row.brandColor || "#2563EB"),
      accountCategory: row.accountCategory === "individual" ? "individual" : "enterprise",
      supportedProtocols: rawProtos.split(",").map((s) => s.trim()).filter(Boolean),
      capabilities,
      authUrl: String(row.authUrl || ""),
      tokenUrl: String(row.tokenUrl || ""),
      apiBaseUrl: String(row.apiBaseUrl || ""),
      cliCommand: String(row.cliCommand || ""),
      docsUrl: String(row.docsUrl || ""),
      lifecycleStatus: (String(row.lifecycleStatus || "ACTIVE") as IntegrationRecord["lifecycleStatus"]),
      createdBy: row.createdBy ? String(row.createdBy) : undefined,
      updatedBy: row.updatedBy ? String(row.updatedBy) : undefined,
      createdTimestamp: String(row.createdTimestamp || ""),
      updatedTimestamp: String(row.updatedTimestamp || ""),
    };
  }
}

export const integrationRepository = new IntegrationRepository();

