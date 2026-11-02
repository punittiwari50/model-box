import { coreDatabaseManager, randomUUID } from "@model-box/model-connector-core";
import { GoogleAuthConstants } from "@/domain/constants/index.js";
import type { GeminiOAuthCredentialFile } from "@/domain/models/geminiOAuth.types.js";

export type AuthType = "api_key" | "cookie" | "cli_oauth" | "api" | "cli" | "oauth";

export interface ModelAccount {
  accountId: string;
  modelId: string;
  accountName: string;
  userEmail: string;
  authType: AuthType;
  credentialValue: string;
  isActive: boolean;
  configJson?: string;
  customLocation?: string;
  credentialsFileContent?: string;
  authMethod?: string;
  createdTimestamp: string;
  updatedTimestamp: string;
}

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

function sanitizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  const n = Math.floor(Number(limit));
  if (n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}

function sanitizeOffset(offset?: number): number {
  if (!Number.isFinite(offset)) return 0;
  const n = Math.floor(Number(offset));
  return n < 0 ? 0 : n;
}

export class AccountRepository {
  public listAccountsByModel(modelId: string, limit?: number, offset?: number): ModelAccount[] {
    const db = coreDatabaseManager.getDatabase();
    const rows = db
      .prepare(
        `SELECT ACCOUNT_ID as accountId,
                MODEL_ID as modelId,
                ACCOUNT_NAME as accountName,
                USER_EMAIL as userEmail,
                AUTH_TYPE as authType,
                CREDENTIAL_VALUE as credentialValue,
                IS_ACTIVE as isActive,
                CONFIG_JSON as configJson,
                CREATED_TIMESTAMP as createdTimestamp,
                UPDATED_TIMESTAMP as updatedTimestamp
         FROM MODEL_ACCOUNTS
         WHERE MODEL_ID = ?
         ORDER BY IS_ACTIVE DESC, CREATED_TIMESTAMP DESC
         LIMIT ? OFFSET ?`,
      )
      .all(modelId, sanitizeLimit(limit), sanitizeOffset(offset)) as any[];
    return rows.map((r) => this.mapRowToAccount(r));
  }

  public listAllAccounts(limit?: number, offset?: number): ModelAccount[] {
    const db = coreDatabaseManager.getDatabase();
    const rows = db
      .prepare(
        `SELECT ACCOUNT_ID as accountId,
                MODEL_ID as modelId,
                ACCOUNT_NAME as accountName,
                USER_EMAIL as userEmail,
                AUTH_TYPE as authType,
                CREDENTIAL_VALUE as credentialValue,
                IS_ACTIVE as isActive,
                CONFIG_JSON as configJson,
                CREATED_TIMESTAMP as createdTimestamp,
                UPDATED_TIMESTAMP as updatedTimestamp
         FROM MODEL_ACCOUNTS
         ORDER BY MODEL_ID ASC, IS_ACTIVE DESC, CREATED_TIMESTAMP DESC
         LIMIT ? OFFSET ?`,
      )
      .all(sanitizeLimit(limit), sanitizeOffset(offset)) as any[];
    return rows.map((r) => this.mapRowToAccount(r));
  }

  public getAccount(accountId: string): ModelAccount | undefined {
    const db = coreDatabaseManager.getDatabase();
    const row = db
      .prepare(
        `SELECT ACCOUNT_ID as accountId,
                MODEL_ID as modelId,
                ACCOUNT_NAME as accountName,
                USER_EMAIL as userEmail,
                AUTH_TYPE as authType,
                CREDENTIAL_VALUE as credentialValue,
                IS_ACTIVE as isActive,
                CONFIG_JSON as configJson,
                CREATED_TIMESTAMP as createdTimestamp,
                UPDATED_TIMESTAMP as updatedTimestamp
         FROM MODEL_ACCOUNTS
         WHERE ACCOUNT_ID = ?`,
      )
      .get(accountId) as any;
    return row ? this.mapRowToAccount(row) : undefined;
  }

  public getActiveAccount(modelId: string): ModelAccount | undefined {
    const db = coreDatabaseManager.getDatabase();
    const row = db
      .prepare(
        `SELECT ACCOUNT_ID as accountId,
                MODEL_ID as modelId,
                ACCOUNT_NAME as accountName,
                USER_EMAIL as userEmail,
                AUTH_TYPE as authType,
                CREDENTIAL_VALUE as credentialValue,
                IS_ACTIVE as isActive,
                CONFIG_JSON as configJson,
                CREATED_TIMESTAMP as createdTimestamp,
                UPDATED_TIMESTAMP as updatedTimestamp
         FROM MODEL_ACCOUNTS
         WHERE MODEL_ID = ? AND IS_ACTIVE = 1
         ORDER BY UPDATED_TIMESTAMP DESC
         LIMIT 1`,
      )
      .get(modelId) as any;
    return row ? this.mapRowToAccount(row) : undefined;
  }

  public createAccount(data: {
    accountId?: string;
    modelId: string;
    accountName: string;
    userEmail: string;
    authType: AuthType;
    credentialValue: string;
    isActive?: boolean;
    configJson?: string;
  }): ModelAccount {
    const existing = this.findMatchingAccount(data.modelId, data.accountName, data.userEmail, data.accountId);
    if (existing) {
      const updated = this.updateAccount(existing.accountId, {
        accountName: data.accountName,
        userEmail: data.userEmail,
        authType: data.authType,
        credentialValue: data.credentialValue,
        isActive: data.isActive,
        configJson: data.configJson,
      });
      if (updated) {
        return updated;
      }
    }

    const db = coreDatabaseManager.getDatabase();
    const accountId = data.accountId || randomUUID();
    const now = new Date().toISOString();
    const active = data.isActive ? 1 : 0;
    if (active) {
      db.prepare(`UPDATE MODEL_ACCOUNTS SET IS_ACTIVE = 0 WHERE MODEL_ID = ?`).run(data.modelId);
    }
    db.prepare(
      `INSERT INTO MODEL_ACCOUNTS (
         ACCOUNT_ID, MODEL_ID, ACCOUNT_NAME, USER_EMAIL,
         AUTH_TYPE, CREDENTIAL_VALUE, IS_ACTIVE, CONFIG_JSON, CREATED_TIMESTAMP, UPDATED_TIMESTAMP
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      accountId,
      data.modelId,
      data.accountName,
      data.userEmail,
      data.authType,
      data.credentialValue,
      active,
      data.configJson || null,
      now,
      now,
    );
    return this.getAccount(accountId)!;
  }

  public findMatchingAccount(
    modelId: string,
    accountName?: string,
    userEmail?: string,
    accountId?: string,
  ): ModelAccount | undefined {
    if (accountId) {
      const acc = this.getAccount(accountId);
      if (acc) return acc;
    }
    const db = coreDatabaseManager.getDatabase();
    if (userEmail && userEmail.trim().length > 0) {
      const row = db
        .prepare(
          `SELECT ACCOUNT_ID as accountId FROM MODEL_ACCOUNTS WHERE MODEL_ID = ? AND LOWER(USER_EMAIL) = LOWER(?) LIMIT 1`,
        )
        .get(modelId, userEmail.trim()) as any;
      if (row?.accountId) {
        return this.getAccount(row.accountId);
      }
    }
    if (accountName && accountName.trim().length > 0) {
      const row = db
        .prepare(
          `SELECT ACCOUNT_ID as accountId FROM MODEL_ACCOUNTS WHERE MODEL_ID = ? AND LOWER(ACCOUNT_NAME) = LOWER(?) LIMIT 1`,
        )
        .get(modelId, accountName.trim()) as any;
      if (row?.accountId) {
        return this.getAccount(row.accountId);
      }
    }
    return undefined;
  }

  public updateAccount(
    accountId: string,
    data: {
      accountName?: string;
      userEmail?: string;
      authType?: AuthType;
      credentialValue?: string;
      isActive?: boolean;
      configJson?: string;
    },
  ): ModelAccount | undefined {
    const existing = this.getAccount(accountId);
    if (!existing) return undefined;
    const db = coreDatabaseManager.getDatabase();
    const now = new Date().toISOString();
    const nextActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing.isActive ? 1 : 0;
    if (nextActive) {
      db.prepare(`UPDATE MODEL_ACCOUNTS SET IS_ACTIVE = 0 WHERE MODEL_ID = ?`).run(existing.modelId);
    }
    db.prepare(
      `UPDATE MODEL_ACCOUNTS
       SET ACCOUNT_NAME = ?,
           USER_EMAIL = ?,
           AUTH_TYPE = ?,
           CREDENTIAL_VALUE = ?,
           IS_ACTIVE = ?,
           CONFIG_JSON = ?,
           UPDATED_TIMESTAMP = ?
       WHERE ACCOUNT_ID = ?`,
    ).run(
      data.accountName ?? existing.accountName,
      data.userEmail ?? existing.userEmail,
      data.authType ?? existing.authType,
      data.credentialValue ?? existing.credentialValue,
      nextActive,
      data.configJson !== undefined ? data.configJson : existing.configJson || null,
      now,
      accountId,
    );
    return this.getAccount(accountId);
  }

  public saveGoogleOAuthCredentialFile(params: {
    accountId: string;
    fileContent: string;
    customLocation?: string;
    tokens?: GeminiOAuthCredentialFile;
  }): ModelAccount | undefined {
    const existing = this.getAccount(params.accountId);
    if (!existing) return undefined;
    const existingCfg = this.parseJsonSafe(existing.configJson);
    const updatedCfg = {
      ...existingCfg,
      authMethod: GoogleAuthConstants.SIGN_IN_WITH_GOOGLE,
      authProvider: "google",
      credentialsFileContent: params.fileContent,
      credentialsFileName: GoogleAuthConstants.DEFAULT_GEMINI_OAUTH_FILE,
      ...(params.customLocation ? { customLocation: params.customLocation } : {}),
      ...(params.tokens ? { tokens: params.tokens } : {}),
      lastSyncedAt: new Date().toISOString(),
    };
    const tokenVal = params.tokens?.access_token || existing.credentialValue;
    return this.updateAccount(params.accountId, {
      credentialValue: tokenVal,
      configJson: JSON.stringify(updatedCfg),
    });
  }

  public createGoogleOAuthAccount(params: {
    modelId?: string;
    accountName: string;
    userEmail: string;
    fileContent: string;
    customLocation?: string;
    tokens?: GeminiOAuthCredentialFile;
    isActive?: boolean;
  }): ModelAccount {
    const modelId = params.modelId || "gemini";
    const configPayload = {
      authProvider: "google",
      authMethod: GoogleAuthConstants.SIGN_IN_WITH_GOOGLE,
      credentialsFileContent: params.fileContent,
      credentialsFileName: GoogleAuthConstants.DEFAULT_GEMINI_OAUTH_FILE,
      customLocation: params.customLocation,
      tokens: params.tokens,
      lastSyncedAt: new Date().toISOString(),
    };
    return this.createAccount({
      modelId,
      accountName: params.accountName,
      userEmail: params.userEmail,
      authType: "cli_oauth",
      credentialValue: params.tokens?.access_token || params.fileContent,
      isActive: params.isActive ?? true,
      configJson: JSON.stringify(configPayload),
    });
  }

  public getGoogleOAuthAccount(
    modelId: string,
    userEmail?: string,
    accountId?: string,
  ): ModelAccount | undefined {
    if (accountId) {
      return this.getAccount(accountId);
    }
    if (userEmail) {
      const db = coreDatabaseManager.getDatabase();
      const row = db
        .prepare(
          `SELECT ACCOUNT_ID as accountId, MODEL_ID as modelId, ACCOUNT_NAME as accountName,
                  USER_EMAIL as userEmail, AUTH_TYPE as authType, CREDENTIAL_VALUE as credentialValue,
                  IS_ACTIVE as isActive, CONFIG_JSON as configJson, CREATED_TIMESTAMP as createdTimestamp,
                  UPDATED_TIMESTAMP as updatedTimestamp
           FROM MODEL_ACCOUNTS
           WHERE MODEL_ID = ? AND LOWER(USER_EMAIL) = LOWER(?)
           ORDER BY IS_ACTIVE DESC, UPDATED_TIMESTAMP DESC LIMIT 1`,
        )
        .get(modelId, userEmail.trim()) as any;
      if (row) return this.mapRowToAccount(row);
    }
    return this.getActiveAccount(modelId);
  }

  public setActiveAccount(modelId: string, accountId: string): boolean {
    const db = coreDatabaseManager.getDatabase();
    const now = new Date().toISOString();
    db.prepare(`UPDATE MODEL_ACCOUNTS SET IS_ACTIVE = 0, UPDATED_TIMESTAMP = ? WHERE MODEL_ID = ?`).run(now, modelId);
    const res = db
      .prepare(`UPDATE MODEL_ACCOUNTS SET IS_ACTIVE = 1, UPDATED_TIMESTAMP = ? WHERE ACCOUNT_ID = ? AND MODEL_ID = ?`)
      .run(now, accountId, modelId);
    return res.changes > 0;
  }

  public deactivateAccount(modelId: string, accountId: string): boolean {
    const db = coreDatabaseManager.getDatabase();
    const now = new Date().toISOString();
    const res = db
      .prepare(`UPDATE MODEL_ACCOUNTS SET IS_ACTIVE = 0, UPDATED_TIMESTAMP = ? WHERE ACCOUNT_ID = ? AND MODEL_ID = ?`)
      .run(now, accountId, modelId);
    return res.changes > 0;
  }

  public deactivateActiveAccount(modelId: string): boolean {
    const db = coreDatabaseManager.getDatabase();
    const now = new Date().toISOString();
    const res = db
      .prepare(`UPDATE MODEL_ACCOUNTS SET IS_ACTIVE = 0, UPDATED_TIMESTAMP = ? WHERE MODEL_ID = ? AND IS_ACTIVE = 1`)
      .run(now, modelId);
    return res.changes > 0;
  }

  public deleteAccount(accountId: string): boolean {
    const db = coreDatabaseManager.getDatabase();
    const res = db.prepare(`DELETE FROM MODEL_ACCOUNTS WHERE ACCOUNT_ID = ?`).run(accountId);
    return res.changes > 0;
  }

  private parseJsonSafe(raw?: string): Record<string, unknown> {
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private mapRowToAccount(row: any): ModelAccount {
    const parsedCfg = this.parseJsonSafe(row.configJson);
    return {
      accountId: String(row.accountId),
      modelId: String(row.modelId),
      accountName: String(row.accountName),
      userEmail: String(row.userEmail),
      authType: row.authType as AuthType,
      credentialValue: String(row.credentialValue || ""),
      isActive: Boolean(row.isActive),
      configJson: row.configJson ? String(row.configJson) : undefined,
      customLocation: parsedCfg.customLocation ? String(parsedCfg.customLocation) : undefined,
      credentialsFileContent: parsedCfg.credentialsFileContent ? String(parsedCfg.credentialsFileContent) : undefined,
      authMethod: parsedCfg.authMethod ? String(parsedCfg.authMethod) : undefined,
      createdTimestamp: String(row.createdTimestamp),
      updatedTimestamp: String(row.updatedTimestamp),
    };
  }
}

export const accountRepository = new AccountRepository();
