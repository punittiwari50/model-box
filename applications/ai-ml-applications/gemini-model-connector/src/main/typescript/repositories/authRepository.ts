import { randomUUID } from 'node:crypto';
import { dataSourceManager, DataSourceManager } from '@/core/datasource/dataSourceManager.js';
import type { ModelAuth } from '@/domain/index.js';
import { logger } from '@/core/observability/logging/logger.js';
import { DatabaseTable, DatabaseColumn } from '@/domain/constants/index.js';

export interface IAuthRepository {
  saveModelAuth(auth: Omit<ModelAuth, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<ModelAuth>;
  getModelAuth(model: string): Promise<ModelAuth | null>;
  listAllModelAuth(): Promise<ModelAuth[]>;
  deleteModelAuth(model: string): Promise<boolean>;
  deleteAllModelAuth(): Promise<number>;
}

export class AuthRepository implements IAuthRepository {
  private dataSource: DataSourceManager;

  constructor(dataSource = dataSourceManager) {
    this.dataSource = dataSource;
  }

  async saveModelAuth(auth: Omit<ModelAuth, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<ModelAuth> {
    const driver = await this.dataSource.getDriver();
    const id = auth.id || randomUUID();
    const now = new Date().toISOString();

    const sql = `
      INSERT OR REPLACE INTO ${DatabaseTable.MODEL_AUTH} (
        ${DatabaseColumn.ID},
        ${DatabaseColumn.MODEL},
        ${DatabaseColumn.AUTH_TYPE},
        ${DatabaseColumn.ACCOUNT_EMAIL},
        ${DatabaseColumn.ACCOUNT_NAME},
        ${DatabaseColumn.ACCESS_TOKEN},
        ${DatabaseColumn.REFRESH_TOKEN},
        ${DatabaseColumn.EXPIRES_AT},
        ${DatabaseColumn.METADATA},
        ${DatabaseColumn.STATUS},
        ${DatabaseColumn.CREATED_TIMESTAMP},
        ${DatabaseColumn.UPDATE_TIMESTAMP}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      now,
      now,
    ];

    await driver.run(sql, params);
    logger.datasource(`Persisted model_auth for model '${auth.model}' (status: ${auth.status})`);

    return (await this.getModelAuth(auth.model))!;
  }

  async getModelAuth(model: string): Promise<ModelAuth | null> {
    const driver = await this.dataSource.getDriver();
    const row = await driver.get<any>(
      `SELECT * FROM ${DatabaseTable.MODEL_AUTH} WHERE ${DatabaseColumn.MODEL} = ?`,
      [model]
    );

    if (!row) {
      // Check if fallback 'default' or '*' model exists
      if (model !== 'default' && model !== '*') {
        const fallback = await driver.get<any>(
          `SELECT * FROM ${DatabaseTable.MODEL_AUTH} WHERE ${DatabaseColumn.MODEL} = ? OR ${DatabaseColumn.MODEL} = ?`,
          ['default', '*']
        );
        if (fallback) return this.mapRow(fallback);
      }
      return null;
    }

    return this.mapRow(row);
  }

  async listAllModelAuth(): Promise<ModelAuth[]> {
    const driver = await this.dataSource.getDriver();
    const rows = await driver.all<any>(`SELECT * FROM ${DatabaseTable.MODEL_AUTH}`);
    return rows.map((r) => this.mapRow(r));
  }

  async deleteModelAuth(model: string): Promise<boolean> {
    const driver = await this.dataSource.getDriver();
    const res = await driver.run(
      `DELETE FROM ${DatabaseTable.MODEL_AUTH} WHERE ${DatabaseColumn.MODEL} = ?`,
      [model]
    );
    logger.datasource(`Deleted model_auth for model '${model}' (changes: ${res.changes})`);
    return res.changes > 0;
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
      metadata = typeof rawMetadata === 'string' ? JSON.parse(rawMetadata) : rawMetadata || {};
    } catch {
      metadata = {};
    }

    const createdTimestamp = row.CREATED_TIMESTAMP ?? row.CREATED_AT ?? row.created_timestamp ?? row.created_at;
    const updateTimestamp = row.UPDATE_TIMESTAMP ?? row.UPDATED_AT ?? row.update_timestamp ?? row.updated_at ?? createdTimestamp;

    return {
      id: row.ID ?? row.id,
      model: row.MODEL ?? row.model,
      auth_type: row.AUTH_TYPE ?? row.auth_type,
      account_email: (row.ACCOUNT_EMAIL ?? row.account_email) || undefined,
      account_name: (row.ACCOUNT_NAME ?? row.account_name) || undefined,
      access_token: row.ACCESS_TOKEN ?? row.access_token,
      refresh_token: (row.REFRESH_TOKEN ?? row.refresh_token) || undefined,
      expires_at: (row.EXPIRES_AT ?? row.expires_at) || undefined,
      metadata,
      status: row.STATUS ?? row.status,
      created_timestamp: createdTimestamp,
      update_timestamp: updateTimestamp,
      created_at: createdTimestamp,
      updated_at: updateTimestamp,
    };
  }
}

export const authRepo: IAuthRepository = new AuthRepository();
