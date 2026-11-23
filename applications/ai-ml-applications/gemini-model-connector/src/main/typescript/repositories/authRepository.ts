import { randomUUID } from "node:crypto";
import {
  dataSourceManager,
  DataSourceManager,
} from "@/core/datasource/dataSourceManager.js";
import type { ModelAuth } from "@/domain/index.js";
import { logger } from "@/core/observability/logging/logger.js";
import { config } from "@/core/config/index.js";
import { DatabaseTable, DatabaseColumn } from "@/domain/constants/index.js";

export interface IAuthRepository {
  saveModelAuth(
    auth: Omit<ModelAuth, "id" | "created_at" | "updated_at"> & {
      id?: string;
      is_active?: number | boolean;
    },
  ): Promise<ModelAuth>;
  getModelAuth(model: string): Promise<ModelAuth | null>;
  getModelAuthById?(id: string): Promise<ModelAuth | null>;
  listAllModelAuth(): Promise<ModelAuth[]>;
  setActiveSession(id: string, model?: string): Promise<ModelAuth | null>;
  deleteModelAuth(
    target: string | { model?: string; id?: string; account_email?: string },
  ): Promise<boolean>;
  deleteAllModelAuth(): Promise<number>;
}

export class AuthRepository implements IAuthRepository {
  private dataSource: DataSourceManager;

  constructor(dataSource = dataSourceManager) {
    this.dataSource = dataSource;
  }

  async saveModelAuth(
    auth: Omit<ModelAuth, "id" | "created_at" | "updated_at"> & {
      id?: string;
      is_active?: number | boolean;
    },
  ): Promise<ModelAuth> {
    const driver = await this.dataSource.getDriver();
    let id = auth.id;

    if (!id && auth.account_email) {
      let existing: any = null;
      try {
        existing = await driver.get<any>(
          `SELECT ${DatabaseColumn.SESSION_ID} AS sid FROM ${DatabaseTable.MODEL_AUTH} WHERE ${DatabaseColumn.MODEL} = ? AND ${DatabaseColumn.ACCOUNT_EMAIL} = ?`,
          [auth.model, auth.account_email],
        );
      } catch {
        existing = await driver.get<any>(
          `SELECT ${DatabaseColumn.ID} AS id FROM ${DatabaseTable.MODEL_AUTH} WHERE ${DatabaseColumn.MODEL} = ? AND ${DatabaseColumn.ACCOUNT_EMAIL} = ?`,
          [auth.model, auth.account_email],
        );
      }
      if (
        existing &&
        (existing.sid || existing.id || existing.SESSION_ID || existing.ID)
      ) {
        id = existing.sid || existing.id || existing.SESSION_ID || existing.ID;
      }
    }

    if (!id) {
      id = randomUUID();
    }

    const now = new Date().toISOString();
    const isActive =
      auth.is_active !== undefined ? (auth.is_active ? 1 : 0) : 1;

    // Set other sessions for this model to inactive if this session is active
    if (isActive === 1) {
      try {
        await driver.run(
          `UPDATE ${DatabaseTable.MODEL_AUTH} SET ${DatabaseColumn.IS_ACTIVE} = 0 WHERE ${DatabaseColumn.MODEL} = ? AND ${DatabaseColumn.SESSION_ID} != ?`,
          [auth.model, id],
        );
      } catch {
        try {
          await driver.run(
            `UPDATE ${DatabaseTable.MODEL_AUTH} SET ${DatabaseColumn.IS_ACTIVE} = 0 WHERE ${DatabaseColumn.MODEL} = ? AND ${DatabaseColumn.ID} != ?`,
            [auth.model, id],
          );
        } catch {
          try {
            await driver.run(
              `UPDATE ${DatabaseTable.MODEL_AUTH} SET ${DatabaseColumn.IS_ACTIVE} = 0 WHERE ${DatabaseColumn.MODEL} = ?`,
              [auth.model],
            );
          } catch {
            // Safe ignore
          }
        }
      }
    }

    const sql = `
      INSERT OR REPLACE INTO ${DatabaseTable.MODEL_AUTH} (
        ${DatabaseColumn.SESSION_ID},
        ${DatabaseColumn.MODEL},
        ${DatabaseColumn.AUTH_TYPE},
        ${DatabaseColumn.ACCOUNT_EMAIL},
        ${DatabaseColumn.ACCOUNT_NAME},
        ${DatabaseColumn.ACCESS_TOKEN},
        ${DatabaseColumn.REFRESH_TOKEN},
        ${DatabaseColumn.EXPIRES_AT},
        ${DatabaseColumn.METADATA},
        ${DatabaseColumn.STATUS},
        ${DatabaseColumn.IS_ACTIVE},
        ${DatabaseColumn.CREATED_TIMESTAMP},
        ${DatabaseColumn.UPDATE_TIMESTAMP}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id,
      auth.model,
      auth.auth_type,
      auth.account_email || null,
      auth.account_name || null,
      auth.access_token,
      auth.refresh_token || null,
      auth.expires_at || null,
      JSON.stringify(auth.metadata || {}),
      auth.status,
      isActive,
      now,
      now,
    ];

    try {
      await driver.run(sql, params);
    } catch {
      // Fallback for unmigrated ID column
      const legacySql = sql.replace(
        DatabaseColumn.SESSION_ID,
        DatabaseColumn.ID,
      );
      await driver.run(legacySql, params);
    }
    logger.datasource(
      `Persisted model_auth for model '${auth.model}' [session_id: ${id}] (status: ${auth.status}, active: ${isActive})`,
    );

    const saved = await this.getModelAuthById(id);
    return saved || (await this.getModelAuth(auth.model))!;
  }

  async setActiveSession(
    id: string,
    model?: string,
  ): Promise<ModelAuth | null> {
    const driver = await this.dataSource.getDriver();
    const target = await this.getModelAuthById(id);
    if (!target) return null;

    const targetModel = model || target.model;
    const now = new Date().toISOString();

    // Mark other sessions for this model as inactive
    await driver.run(
      `UPDATE ${DatabaseTable.MODEL_AUTH} SET ${DatabaseColumn.IS_ACTIVE} = 0 WHERE ${DatabaseColumn.MODEL} = ?`,
      [targetModel],
    );

    // Mark this session as active and bump update_timestamp
    try {
      await driver.run(
        `UPDATE ${DatabaseTable.MODEL_AUTH} SET ${DatabaseColumn.IS_ACTIVE} = 1, ${DatabaseColumn.UPDATE_TIMESTAMP} = ? WHERE ${DatabaseColumn.SESSION_ID} = ?`,
        [now, id],
      );
    } catch {
      await driver.run(
        `UPDATE ${DatabaseTable.MODEL_AUTH} SET ${DatabaseColumn.IS_ACTIVE} = 1, ${DatabaseColumn.UPDATE_TIMESTAMP} = ? WHERE ${DatabaseColumn.ID} = ?`,
        [now, id],
      );
    }

    logger.datasource(
      `Switched active session for model '${targetModel}' to [session_id: ${id}] (${target.account_email || target.account_name})`,
    );
    return this.getModelAuthById(id);
  }

  async getModelAuthById(id: string): Promise<ModelAuth | null> {
    const driver = await this.dataSource.getDriver();
    let row: any = null;
    try {
      row = await driver.get<any>(
        `SELECT * FROM ${DatabaseTable.MODEL_AUTH} WHERE ${DatabaseColumn.SESSION_ID} = ?`,
        [id],
      );
    } catch {
      row = await driver.get<any>(
        `SELECT * FROM ${DatabaseTable.MODEL_AUTH} WHERE ${DatabaseColumn.ID} = ?`,
        [id],
      );
    }
    return row ? this.mapRow(row) : null;
  }

  async getModelAuth(model: string): Promise<ModelAuth | null> {
    const driver = await this.dataSource.getDriver();
    const row = await driver.get<any>(
      `SELECT * FROM ${DatabaseTable.MODEL_AUTH} WHERE ${DatabaseColumn.MODEL} = ? ORDER BY ${DatabaseColumn.IS_ACTIVE} DESC, ${DatabaseColumn.UPDATE_TIMESTAMP} DESC`,
      [model],
    );

    if (!row) {
      if (model !== "default" && model !== "*") {
        const fallback = await driver.get<any>(
          `SELECT * FROM ${DatabaseTable.MODEL_AUTH} WHERE ${DatabaseColumn.MODEL} = ? OR ${DatabaseColumn.MODEL} = ? ORDER BY ${DatabaseColumn.IS_ACTIVE} DESC, ${DatabaseColumn.UPDATE_TIMESTAMP} DESC`,
          ["default", "*"],
        );
        if (fallback) return this.mapRow(fallback);
      }
      return null;
    }

    return this.mapRow(row);
  }

  async listAllModelAuth(): Promise<ModelAuth[]> {
    const driver = await this.dataSource.getDriver();
    const rows = await driver.all<any>(
      `SELECT * FROM ${DatabaseTable.MODEL_AUTH} ORDER BY ${DatabaseColumn.IS_ACTIVE} DESC, ${DatabaseColumn.UPDATE_TIMESTAMP} DESC`,
    );
    return rows.map((r) => this.mapRow(r));
  }

  async deleteModelAuth(
    target: string | { model?: string; id?: string; account_email?: string },
  ): Promise<boolean> {
    const driver = await this.dataSource.getDriver();

    const executeDelete = async (pkCol: string): Promise<number> => {
      let sql = `DELETE FROM ${DatabaseTable.MODEL_AUTH} WHERE `;
      const params: any[] = [];

      if (typeof target === "string") {
        const isDefaultTarget =
          target === config.geminiDefaultModel || target === "gemini-3.8-flash";
        sql += isDefaultTarget
          ? `${pkCol} = ? OR ${DatabaseColumn.MODEL} = ? OR ${DatabaseColumn.MODEL} = 'default' OR ${DatabaseColumn.MODEL} = '*'`
          : `${pkCol} = ? OR ${DatabaseColumn.MODEL} = ?`;
        params.push(target, target);
      } else if (target.id) {
        sql += `${pkCol} = ?`;
        params.push(target.id);
      } else if (target.model && target.account_email) {
        sql += `${DatabaseColumn.MODEL} = ? AND ${DatabaseColumn.ACCOUNT_EMAIL} = ?`;
        params.push(target.model, target.account_email);
      } else if (target.model) {
        const isDefaultTarget =
          target.model === config.geminiDefaultModel ||
          target.model === "gemini-3.8-flash";
        sql += isDefaultTarget
          ? `(${DatabaseColumn.MODEL} = ? OR ${DatabaseColumn.MODEL} = 'default' OR ${DatabaseColumn.MODEL} = '*')`
          : `${DatabaseColumn.MODEL} = ?`;
        params.push(target.model);
      } else {
        return 0;
      }

      const res = await driver.run(sql, params);
      return res.changes;
    };

    let changes = 0;
    try {
      changes = await executeDelete(DatabaseColumn.SESSION_ID);
    } catch {
      try {
        changes = await executeDelete(DatabaseColumn.ID);
      } catch {
        return false;
      }
    }

    logger.datasource(
      `Deleted model_auth for target '${typeof target === "object" ? JSON.stringify(target) : target}' (changes: ${changes})`,
    );
    return changes > 0;
  }

  async deleteAllModelAuth(): Promise<number> {
    const driver = await this.dataSource.getDriver();
    const res = await driver.run(`DELETE FROM ${DatabaseTable.MODEL_AUTH}`);
    logger.datasource(`Deleted all model_auth records (count: ${res.changes})`);
    return res.changes;
  }

  private mapRow(row: any): ModelAuth {
    let metadata = {};
    const rawMetadata = row.METADATA ?? row.metadata;
    try {
      metadata =
        typeof rawMetadata === "string"
          ? JSON.parse(rawMetadata)
          : rawMetadata || {};
    } catch {
      metadata = {};
    }

    const createdTimestamp =
      row.CREATED_TIMESTAMP ??
      row.CREATED_AT ??
      row.created_timestamp ??
      row.created_at;
    const updateTimestamp =
      row.UPDATE_TIMESTAMP ??
      row.UPDATED_AT ??
      row.update_timestamp ??
      row.updated_at ??
      createdTimestamp;

    const sessionId = row.SESSION_ID ?? row.ID ?? row.session_id ?? row.id;
    return {
      session_id: sessionId,
      id: sessionId,
      model: row.MODEL ?? row.model,
      auth_type: row.AUTH_TYPE ?? row.auth_type,
      account_email: (row.ACCOUNT_EMAIL ?? row.account_email) || undefined,
      account_name: (row.ACCOUNT_NAME ?? row.account_name) || undefined,
      access_token: row.ACCESS_TOKEN ?? row.access_token,
      refresh_token: (row.REFRESH_TOKEN ?? row.refresh_token) || undefined,
      expires_at: (row.EXPIRES_AT ?? row.expires_at) || undefined,
      metadata,
      status: row.STATUS ?? row.status,
      is_active: (row.IS_ACTIVE ?? row.is_active ?? 1) === 1,
      login_date_time: createdTimestamp,
      created_timestamp: createdTimestamp,
      update_timestamp: updateTimestamp,
      created_at: createdTimestamp,
      updated_at: updateTimestamp,
    };
  }
}

export const authRepo: IAuthRepository = new AuthRepository();
