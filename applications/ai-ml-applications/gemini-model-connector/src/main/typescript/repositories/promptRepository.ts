import { randomUUID } from "node:crypto";
import { dataSourceManager } from "@/core/datasource/dataSourceManager.js";
import { DatabaseTable, DatabaseColumn } from "@/domain/constants/index.js";
import { logger } from "@/core/observability/logging/logger.js";

export interface PromptEntity {
  readonly prompt_id?: string;
  readonly id: string;
  readonly prompt_key: string;
  readonly prompt_type: string;
  readonly content: string;
  readonly description?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly created_timestamp?: string;
  readonly update_timestamp?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface IPromptRepository {
  getPromptByKey(key: string): Promise<PromptEntity | null>;
  savePrompt(
    prompt: Omit<
      PromptEntity,
      | "id"
      | "created_at"
      | "updated_at"
      | "created_timestamp"
      | "update_timestamp"
      | "version"
    > & { id?: string; version?: number },
  ): Promise<PromptEntity>;
}

export class PromptRepository implements IPromptRepository {
  public async getPromptByKey(key: string): Promise<PromptEntity | null> {
    const dataSource = await dataSourceManager.getDriver();
    const rows = await dataSource.all<any>(
      `SELECT * FROM ${DatabaseTable.JOB_SEARCH_PROMPTS} WHERE ${DatabaseColumn.PROMPT_KEY} = ? LIMIT 1;`,
      [key],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    const r = rows[0];
    const createdTimestamp =
      r.CREATED_TIMESTAMP ??
      r.CREATED_AT ??
      r.created_timestamp ??
      r.created_at;
    const updateTimestamp =
      r.UPDATE_TIMESTAMP ?? r.UPDATED_AT ?? r.update_timestamp ?? r.updated_at;

    const promptId = r.PROMPT_ID ?? r.ID ?? r.prompt_id ?? r.id;
    return {
      prompt_id: promptId,
      id: promptId,
      prompt_key: r.PROMPT_KEY ?? r.prompt_key,
      prompt_type: r.PROMPT_TYPE ?? r.prompt_type,
      content: r.CONTENT ?? r.content,
      description: r.DESCRIPTION ?? r.description,
      metadata:
        typeof (r.METADATA ?? r.metadata) === "string"
          ? JSON.parse(r.METADATA ?? r.metadata)
          : (r.METADATA ?? r.metadata ?? {}),
      version: Number(r.VERSION ?? r.version ?? 1),
      created_timestamp: createdTimestamp,
      update_timestamp: updateTimestamp,
      created_at: createdTimestamp,
      updated_at: updateTimestamp,
    };
  }

  public async savePrompt(
    prompt: Omit<
      PromptEntity,
      | "id"
      | "created_at"
      | "updated_at"
      | "created_timestamp"
      | "update_timestamp"
      | "version"
    > & { id?: string; version?: number },
  ): Promise<PromptEntity> {
    const dataSource = await dataSourceManager.getDriver();
    const now = new Date().toISOString();
    const id = prompt.id || randomUUID();
    const version = prompt.version ?? 1;

    try {
      await dataSource.run(
        `INSERT INTO ${DatabaseTable.JOB_SEARCH_PROMPTS} (
          ${DatabaseColumn.PROMPT_ID},
          ${DatabaseColumn.PROMPT_KEY},
          ${DatabaseColumn.PROMPT_TYPE},
          ${DatabaseColumn.CONTENT},
          ${DatabaseColumn.DESCRIPTION},
          ${DatabaseColumn.METADATA},
          ${DatabaseColumn.VERSION},
          ${DatabaseColumn.CREATED_TIMESTAMP},
          ${DatabaseColumn.UPDATE_TIMESTAMP}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(${DatabaseColumn.PROMPT_KEY}) DO UPDATE SET
          ${DatabaseColumn.CONTENT} = excluded.${DatabaseColumn.CONTENT},
          ${DatabaseColumn.DESCRIPTION} = excluded.${DatabaseColumn.DESCRIPTION},
          ${DatabaseColumn.METADATA} = excluded.${DatabaseColumn.METADATA},
          ${DatabaseColumn.VERSION} = ${DatabaseTable.JOB_SEARCH_PROMPTS}.${DatabaseColumn.VERSION} + 1,
          ${DatabaseColumn.UPDATE_TIMESTAMP} = excluded.${DatabaseColumn.UPDATE_TIMESTAMP};`,
        [
          id,
          prompt.prompt_key,
          prompt.prompt_type,
          prompt.content,
          prompt.description || "",
          JSON.stringify(prompt.metadata || {}),
          version,
          now,
          now,
        ],
      );
    } catch {
      await dataSource.run(
        `INSERT INTO ${DatabaseTable.JOB_SEARCH_PROMPTS} (
          ${DatabaseColumn.ID},
          ${DatabaseColumn.PROMPT_KEY},
          ${DatabaseColumn.PROMPT_TYPE},
          ${DatabaseColumn.CONTENT},
          ${DatabaseColumn.DESCRIPTION},
          ${DatabaseColumn.METADATA},
          ${DatabaseColumn.VERSION},
          ${DatabaseColumn.CREATED_TIMESTAMP},
          ${DatabaseColumn.UPDATE_TIMESTAMP}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(${DatabaseColumn.PROMPT_KEY}) DO UPDATE SET
          ${DatabaseColumn.CONTENT} = excluded.${DatabaseColumn.CONTENT},
          ${DatabaseColumn.DESCRIPTION} = excluded.${DatabaseColumn.DESCRIPTION},
          ${DatabaseColumn.METADATA} = excluded.${DatabaseColumn.METADATA},
          ${DatabaseColumn.VERSION} = ${DatabaseTable.JOB_SEARCH_PROMPTS}.${DatabaseColumn.VERSION} + 1,
          ${DatabaseColumn.UPDATE_TIMESTAMP} = excluded.${DatabaseColumn.UPDATE_TIMESTAMP};`,
        [
          id,
          prompt.prompt_key,
          prompt.prompt_type,
          prompt.content,
          prompt.description || "",
          JSON.stringify(prompt.metadata || {}),
          version,
          now,
          now,
        ],
      );
    }

    const saved = await this.getPromptByKey(prompt.prompt_key);
    if (!saved) {
      throw new Error(
        `Failed to persist or retrieve prompt template for key: ${prompt.prompt_key}`,
      );
    }
    logger.info(
      "PROMPT_REPO",
      `Persisted prompt template for key: ${prompt.prompt_key} (v${saved.version})`,
    );
    return saved;
  }
}

export const promptRepo: IPromptRepository = new PromptRepository();
