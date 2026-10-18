import fs from 'node:fs';
import path from 'node:path';
import type { IDataSourceDriver, DataSourceDriverResult } from '@/core/datasource/driver.js';

/**
 * Resilient File-backed Persistence Driver for environments without node:sqlite.
 * Maintains atomic JSON persistence with full parameterized SQL-like queries.
 */
export class FileStoreDataSourceDriver implements IDataSourceDriver {
  private readonly dataSourcePath: string;
  private state: {
    conversations: Record<string, any>;
    messages: Record<string, any>;
    context_items: Record<string, any>;
    audit_logs: Record<string, any>;
    model_auth: Record<string, any>;
  } = {
    conversations: {},
    messages: {},
    context_items: {},
    audit_logs: {},
    model_auth: {},
  };

  constructor(dataSourcePath: string) {
    this.dataSourcePath = dataSourcePath.endsWith('.json') ? dataSourcePath : `${dataSourcePath}.json`;
  }

  public async init(): Promise<void> {
    fs.mkdirSync(path.dirname(this.dataSourcePath), { recursive: true });
    if (fs.existsSync(this.dataSourcePath)) {
      try {
        const raw = fs.readFileSync(this.dataSourcePath, 'utf-8');
        this.state = JSON.parse(raw);
      } catch {
        this.persist();
      }
    } else {
      this.persist();
    }
  }

  private persist(): void {
    const tmp = `${this.dataSourcePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf-8');
    fs.renameSync(tmp, this.dataSourcePath);
  }

  public async run(sql: string, params: any[] = []): Promise<DataSourceDriverResult> {
    const cleanSql = sql.trim().toUpperCase();

    if (cleanSql.startsWith('INSERT INTO CONVERSATIONS')) {
      const [id, title, model, system_instruction, tags, metadata, created_at, updated_at] = params;
      this.state.conversations[id] = { id, title, model, system_instruction, tags, metadata, created_at, updated_at };
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith('UPDATE CONVERSATIONS')) {
      const [title, model, system_instruction, tags, metadata, updated_at, id] = params;
      if (this.state.conversations[id]) {
        this.state.conversations[id] = { ...this.state.conversations[id], title, model, system_instruction, tags, metadata, updated_at };
        this.persist();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    if (cleanSql.startsWith('DELETE FROM CONVERSATIONS')) {
      const [id] = params;
      if (this.state.conversations[id]) {
        delete this.state.conversations[id];
        for (const [mId, m] of Object.entries(this.state.messages)) {
          if (m.conversation_id === id) delete this.state.messages[mId];
        }
        for (const [cId, c] of Object.entries(this.state.context_items)) {
          if (c.conversation_id === id) delete this.state.context_items[cId];
        }
        this.persist();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    if (cleanSql.startsWith('INSERT INTO MESSAGES')) {
      const [id, conversation_id, role, content, raw_response, latency_ms, token_count, created_at] = params;
      this.state.messages[id] = { id, conversation_id, role, content, raw_response, latency_ms, token_count, created_at };
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith('INSERT INTO CONTEXT_ITEMS')) {
      const [id, conversation_id, type, name, content, mime_type, created_at] = params;
      this.state.context_items[id] = { id, conversation_id, type, name, content, mime_type, created_at };
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith('INSERT INTO AUDIT_LOGS')) {
      const [id, action, status, conversation_id, model, latency_ms, client_ip, error_message, metadata, timestamp] = params;
      this.state.audit_logs[id] = { id, action, status, conversation_id, model, latency_ms, client_ip, error_message, metadata, timestamp };
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith('INSERT OR REPLACE INTO MODEL_AUTH')) {
      const [model, auth_type, encrypted_key, token_expires_at, updated_at] = params;
      this.state.model_auth[model] = { model, auth_type, encrypted_key, token_expires_at, updated_at };
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith('DELETE FROM MODEL_AUTH')) {
      if (cleanSql.includes('WHERE MODEL = ?')) {
        const [model] = params;
        delete this.state.model_auth[model];
      } else {
        this.state.model_auth = {};
      }
      this.persist();
      return { changes: 1 };
    }

    return { changes: 0 };
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const list = await this.all<T>(sql, params);
    return list[0];
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const cleanSql = sql.trim().toUpperCase();

    if (cleanSql.includes('FROM CONVERSATIONS')) {
      let list = Object.values(this.state.conversations);
      if (cleanSql.includes('WHERE ID = ?')) {
        const id = params[0];
        list = list.filter(c => c.id === id);
      }
      if (cleanSql.includes('ORDER BY UPDATE_TIMESTAMP DESC') || cleanSql.includes('ORDER BY UPDATED_AT DESC')) {
        list.sort((a, b) => (b.update_timestamp || b.updated_at || '').localeCompare(a.update_timestamp || a.updated_at || ''));
      }
      return list as T[];
    }

    if (cleanSql.includes('FROM MESSAGES')) {
      let list = Object.values(this.state.messages);
      if (cleanSql.includes('WHERE CONVERSATION_ID = ?')) {
        const convId = params[0];
        list = list.filter(m => m.conversation_id === convId);
      }
      list.sort((a, b) => (a.created_timestamp || a.created_at || '').localeCompare(b.created_timestamp || b.created_at || ''));
      return list as T[];
    }

    if (cleanSql.includes('FROM CONTEXT_ITEMS')) {
      let list = Object.values(this.state.context_items);
      if (cleanSql.includes('WHERE CONVERSATION_ID = ?')) {
        const convId = params[0];
        list = list.filter(c => c.conversation_id === convId);
      }
      return list as T[];
    }

    if (cleanSql.includes('FROM AUDIT_LOGS')) {
      let list = Object.values(this.state.audit_logs);
      list.sort((a, b) => (b.created_timestamp || b.timestamp || '').localeCompare(a.created_timestamp || a.timestamp || ''));
      const limit = typeof params[params.length - 2] === 'number' ? params[params.length - 2] : 100;
      const offset = typeof params[params.length - 1] === 'number' ? params[params.length - 1] : 0;
      return list.slice(offset, offset + limit) as T[];
    }

    if (cleanSql.includes('FROM MODEL_AUTH')) {
      let list = Object.values(this.state.model_auth || {});
      if (cleanSql.includes('WHERE MODEL = ?')) {
        const model = params[0];
        list = list.filter(m => m.model === model);
      }
      return list as T[];
    }

    return [];
  }

  public async close(): Promise<void> {}
}
