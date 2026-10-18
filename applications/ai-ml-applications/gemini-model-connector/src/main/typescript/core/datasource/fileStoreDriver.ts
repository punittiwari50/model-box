import fs from "node:fs";
import path from "node:path";
import type {
  IDataSourceDriver,
  DataSourceDriverResult,
} from "@/core/datasource/driver.js";

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
    this.dataSourcePath = dataSourcePath.endsWith(".json")
      ? dataSourcePath
      : `${dataSourcePath}.json`;
  }

  public async init(): Promise<void> {
    fs.mkdirSync(path.dirname(this.dataSourcePath), { recursive: true });
    if (fs.existsSync(this.dataSourcePath)) {
      try {
        const raw = fs.readFileSync(this.dataSourcePath, "utf-8");
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
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf-8");
    fs.renameSync(tmp, this.dataSourcePath);
  }

  public async run(
    sql: string,
    params: any[] = [],
  ): Promise<DataSourceDriverResult> {
    const cleanSql = sql.trim().toUpperCase();

    if (cleanSql.startsWith("INSERT INTO CONVERSATIONS")) {
      const [
        id,
        title,
        model,
        system_instruction,
        tags,
        metadata,
        created_at,
        updated_at,
      ] = params;
      this.state.conversations[id] = {
        id,
        conversation_id: id,
        session_id: id,
        title,
        model,
        system_instruction,
        tags,
        metadata,
        created_at,
        updated_at,
        created_timestamp: created_at,
        update_timestamp: updated_at,
      };
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith("UPDATE CONVERSATIONS")) {
      const [title, model, system_instruction, tags, metadata, updated_at, id] =
        params;
      if (this.state.conversations[id]) {
        this.state.conversations[id] = {
          ...this.state.conversations[id],
          title,
          model,
          system_instruction,
          tags,
          metadata,
          updated_at,
          update_timestamp: updated_at,
        };
        this.persist();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    if (cleanSql.startsWith("DELETE FROM CONVERSATIONS")) {
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

    if (cleanSql.startsWith("INSERT INTO MESSAGES")) {
      const [
        id,
        conversation_id,
        role,
        content,
        raw_response,
        latency_ms,
        token_count,
        created_at,
      ] = params;
      this.state.messages[id] = {
        id,
        message_id: id,
        conversation_id,
        role,
        content,
        raw_response,
        latency_ms,
        token_count,
        created_at,
        created_timestamp: created_at,
        update_timestamp: created_at,
      };
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith("INSERT INTO CONTEXT_ITEMS")) {
      const [id, conversation_id, type, name, content, mime_type, created_at] =
        params;
      this.state.context_items[id] = {
        id,
        context_id: id,
        conversation_id,
        type,
        name,
        content,
        mime_type,
        created_at,
        created_timestamp: created_at,
        update_timestamp: created_at,
      };
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith("INSERT INTO AUDIT_LOGS")) {
      const [
        id,
        action,
        status,
        conversation_id,
        model,
        latency_ms,
        client_ip,
        error_message,
        metadata,
        timestamp,
      ] = params;
      this.state.audit_logs[id] = {
        id,
        audit_id: id,
        action,
        status,
        conversation_id,
        model,
        latency_ms,
        client_ip,
        error_message,
        metadata,
        timestamp,
        created_timestamp: timestamp,
        update_timestamp: timestamp,
      };
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith("INSERT OR REPLACE INTO MODEL_AUTH")) {
      const id = params[0] || "default";
      const model = params[1];
      const auth_type = params[2];
      const account_email = params[3];
      const account_name = params[4];
      const access_token = params[5];
      const refresh_token = params[6];
      const expires_at = params[7];
      const metadata = params[8];
      const status = params[9];
      const is_active = params[10] ?? 1;
      const created_timestamp = params[11] || new Date().toISOString();
      const update_timestamp = params[12] || new Date().toISOString();

      this.state.model_auth[id] = {
        id,
        session_id: id,
        model,
        auth_type,
        account_email,
        account_name,
        access_token,
        refresh_token,
        expires_at,
        metadata,
        status,
        is_active,
        created_timestamp,
        update_timestamp,
        created_at: created_timestamp,
        updated_at: update_timestamp,
      };
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith("UPDATE MODEL_AUTH")) {
      const id = params[params.length - 1];
      if (this.state.model_auth[id]) {
        this.state.model_auth[id].is_active = 1;
        this.state.model_auth[id].update_timestamp = new Date().toISOString();
      }
      this.persist();
      return { changes: 1 };
    }

    if (cleanSql.startsWith("DELETE FROM MODEL_AUTH")) {
      if (cleanSql.includes("ID = ?") || cleanSql.includes("SESSION_ID = ?")) {
        const id = params[0];
        delete this.state.model_auth[id];
      } else if (
        cleanSql.includes("MODEL = ?") &&
        cleanSql.includes("ACCOUNT_EMAIL = ?")
      ) {
        const [model, email] = params;
        for (const [k, v] of Object.entries(this.state.model_auth)) {
          if (v.model === model && v.account_email === email) {
            delete this.state.model_auth[k];
          }
        }
      } else if (cleanSql.includes("MODEL = ?")) {
        const [model] = params;
        for (const [k, v] of Object.entries(this.state.model_auth)) {
          if (v.model === model) {
            delete this.state.model_auth[k];
          }
        }
      } else {
        this.state.model_auth = {};
      }
      this.persist();
      return { changes: 1 };
    }

    return { changes: 0 };
  }

  public async get<T = any>(
    sql: string,
    params: any[] = [],
  ): Promise<T | undefined> {
    const list = await this.all<T>(sql, params);
    return list[0];
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const cleanSql = sql.trim().toUpperCase();

    if (cleanSql.includes("FROM CONVERSATIONS")) {
      let list = Object.values(this.state.conversations);
      if (
        cleanSql.includes("WHERE ID = ?") ||
        cleanSql.includes("WHERE CONVERSATION_ID = ?")
      ) {
        const id = params[0];
        list = list.filter((c) => c.id === id || c.conversation_id === id);
      }
      if (
        cleanSql.includes("ORDER BY UPDATE_TIMESTAMP DESC") ||
        cleanSql.includes("ORDER BY UPDATED_AT DESC")
      ) {
        list.sort((a, b) =>
          (b.update_timestamp || b.updated_at || "").localeCompare(
            a.update_timestamp || a.updated_at || "",
          ),
        );
      }
      return list as T[];
    }

    if (cleanSql.includes("FROM MESSAGES")) {
      let list = Object.values(this.state.messages);
      if (cleanSql.includes("WHERE CONVERSATION_ID = ?")) {
        const convId = params[0];
        list = list.filter((m) => m.conversation_id === convId);
      }
      list.sort((a, b) =>
        (a.created_timestamp || a.created_at || "").localeCompare(
          b.created_timestamp || b.created_at || "",
        ),
      );
      return list as T[];
    }

    if (cleanSql.includes("FROM CONTEXT_ITEMS")) {
      let list = Object.values(this.state.context_items);
      if (cleanSql.includes("WHERE CONVERSATION_ID = ?")) {
        const convId = params[0];
        list = list.filter((c) => c.conversation_id === convId);
      }
      return list as T[];
    }

    if (cleanSql.includes("FROM AUDIT_LOGS")) {
      let list = Object.values(this.state.audit_logs);
      list.sort((a, b) =>
        (b.created_timestamp || b.timestamp || "").localeCompare(
          a.created_timestamp || a.timestamp || "",
        ),
      );
      const limit =
        typeof params[params.length - 2] === "number"
          ? params[params.length - 2]
          : 100;
      const offset =
        typeof params[params.length - 1] === "number"
          ? params[params.length - 1]
          : 0;
      return list.slice(offset, offset + limit) as T[];
    }

    if (cleanSql.includes("FROM MODEL_AUTH")) {
      let list = Object.values(this.state.model_auth || {}) as any[];
      if (
        cleanSql.includes("WHERE ID = ?") ||
        cleanSql.includes("WHERE SESSION_ID = ?")
      ) {
        const id = params[0];
        list = list.filter((m) => m.id === id || m.session_id === id);
      } else if (cleanSql.includes("WHERE MODEL = ?")) {
        const model = params[0];
        list = list.filter((m) => m.model === model);
      }
      list.sort((a, b) => {
        if ((b.is_active || 0) !== (a.is_active || 0)) {
          return (b.is_active || 0) - (a.is_active || 0);
        }
        return (b.update_timestamp || "").localeCompare(
          a.update_timestamp || "",
        );
      });
      return list as T[];
    }

    return [];
  }

  public async close(): Promise<void> {}
}
