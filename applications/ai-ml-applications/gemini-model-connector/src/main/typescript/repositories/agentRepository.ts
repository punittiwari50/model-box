import { randomUUID } from "node:crypto";
import type { AgentExecution, AgentStep } from "@/domain/dto/agent.dto.js";
import { dataSourceManager } from "@/core/datasource/dataSourceManager.js";
import { logger } from "@/core/observability/logging/logger.js";
import {
  DatabaseTable,
  AgentStatusConstant,
} from "@/domain/constants/index.js";

export interface IAgentRepository {
  saveExecution(
    execution: Omit<
      AgentExecution,
      "id" | "created_timestamp" | "update_timestamp"
    > & { id?: string },
  ): Promise<AgentExecution>;
  updateExecution(
    id: string,
    updates: Partial<AgentExecution>,
  ): Promise<AgentExecution>;
  getExecution(id: string): Promise<AgentExecution | null>;
  listExecutions(limit?: number, offset?: number): Promise<AgentExecution[]>;
  saveStep(
    step: Omit<AgentStep, "id" | "created_timestamp" | "update_timestamp"> & {
      id?: string;
    },
  ): Promise<AgentStep>;
  getSteps(agentId: string): Promise<AgentStep[]>;
}

export class AgentRepository implements IAgentRepository {
  public async saveExecution(
    data: Omit<
      AgentExecution,
      "id" | "created_timestamp" | "update_timestamp"
    > & { id?: string },
  ): Promise<AgentExecution> {
    const dataSource = await dataSourceManager.getDriver();
    const id = data.id || randomUUID();
    const now = new Date().toISOString();

    const entity: AgentExecution = {
      ...data,
      id,
      created_timestamp: now,
      update_timestamp: now,
    };

    try {
      await dataSource.run(
        `INSERT INTO ${DatabaseTable.AGENT_EXECUTIONS} (
          AGENT_ID, AGENT_NAME, PROJECT, TASK, MODEL, APPROVAL_MODE, SANDBOX, STATUS,
          SKILLS, RESULT, ERROR_MESSAGE, PROMPT_TOKENS, COMPLETION_TOKENS,
          TOTAL_TOKENS, LATENCY_MS, SUBSCRIPTION_TIER, METADATA,
          CREATED_TIMESTAMP, UPDATE_TIMESTAMP
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entity.id,
          entity.agent_name,
          entity.project || "default",
          entity.task,
          entity.model,
          entity.approval_mode,
          entity.sandbox ? 1 : 0,
          entity.status,
          JSON.stringify(entity.skills || []),
          entity.result || null,
          entity.error_message || null,
          entity.prompt_tokens ?? null,
          entity.completion_tokens ?? null,
          entity.total_tokens ?? null,
          entity.latency_ms ?? null,
          entity.subscription_tier,
          JSON.stringify(entity.metadata || {}),
          entity.created_timestamp,
          entity.update_timestamp,
        ],
      );
    } catch {
      await dataSource.run(
        `INSERT INTO ${DatabaseTable.AGENT_EXECUTIONS} (
          ID, AGENT_NAME, PROJECT, TASK, MODEL, APPROVAL_MODE, SANDBOX, STATUS,
          SKILLS, RESULT, ERROR_MESSAGE, PROMPT_TOKENS, COMPLETION_TOKENS,
          TOTAL_TOKENS, LATENCY_MS, SUBSCRIPTION_TIER, METADATA,
          CREATED_TIMESTAMP, UPDATE_TIMESTAMP
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entity.id,
          entity.agent_name,
          entity.project || "default",
          entity.task,
          entity.model,
          entity.approval_mode,
          entity.sandbox ? 1 : 0,
          entity.status,
          JSON.stringify(entity.skills || []),
          entity.result || null,
          entity.error_message || null,
          entity.prompt_tokens ?? null,
          entity.completion_tokens ?? null,
          entity.total_tokens ?? null,
          entity.latency_ms ?? null,
          entity.subscription_tier,
          JSON.stringify(entity.metadata || {}),
          entity.created_timestamp,
          entity.update_timestamp,
        ],
      );
    }

    logger.debug(
      "AGENT_REPO",
      `Persisted agent execution '${id}' (status: ${entity.status})`,
    );
    return entity;
  }

  public async updateExecution(
    id: string,
    updates: Partial<AgentExecution>,
  ): Promise<AgentExecution> {
    const existing = await this.getExecution(id);
    if (!existing) {
      throw new Error(`Agent execution '${id}' not found`);
    }

    const dataSource = await dataSourceManager.getDriver();
    const now = new Date().toISOString();
    const updated: AgentExecution = {
      ...existing,
      ...updates,
      id: existing.id,
      update_timestamp: now,
    };

    try {
      await dataSource.run(
        `UPDATE ${DatabaseTable.AGENT_EXECUTIONS} SET
          STATUS = ?, RESULT = ?, ERROR_MESSAGE = ?, PROMPT_TOKENS = ?,
          COMPLETION_TOKENS = ?, TOTAL_TOKENS = ?, LATENCY_MS = ?,
          METADATA = ?, UPDATE_TIMESTAMP = ?
        WHERE AGENT_ID = ?`,
        [
          updated.status,
          updated.result || null,
          updated.error_message || null,
          updated.prompt_tokens ?? null,
          updated.completion_tokens ?? null,
          updated.total_tokens ?? null,
          updated.latency_ms ?? null,
          JSON.stringify(updated.metadata || {}),
          now,
          id,
        ],
      );
    } catch {
      await dataSource.run(
        `UPDATE ${DatabaseTable.AGENT_EXECUTIONS} SET
          STATUS = ?, RESULT = ?, ERROR_MESSAGE = ?, PROMPT_TOKENS = ?,
          COMPLETION_TOKENS = ?, TOTAL_TOKENS = ?, LATENCY_MS = ?,
          METADATA = ?, UPDATE_TIMESTAMP = ?
        WHERE ID = ?`,
        [
          updated.status,
          updated.result || null,
          updated.error_message || null,
          updated.prompt_tokens ?? null,
          updated.completion_tokens ?? null,
          updated.total_tokens ?? null,
          updated.latency_ms ?? null,
          JSON.stringify(updated.metadata || {}),
          now,
          id,
        ],
      );
    }

    return updated;
  }

  public async getExecution(id: string): Promise<AgentExecution | null> {
    const dataSource = await dataSourceManager.getDriver();
    let row: any = null;
    try {
      row = await dataSource.get(
        `SELECT * FROM ${DatabaseTable.AGENT_EXECUTIONS} WHERE AGENT_ID = ?`,
        [id],
      );
    } catch {
      row = await dataSource.get(
        `SELECT * FROM ${DatabaseTable.AGENT_EXECUTIONS} WHERE ID = ?`,
        [id],
      );
    }
    if (!row) return null;
    return this.mapExecutionRow(row);
  }

  public async listExecutions(
    limit = 50,
    offset = 0,
  ): Promise<AgentExecution[]> {
    const dataSource = await dataSourceManager.getDriver();
    const rows = await dataSource.all(
      `SELECT * FROM ${DatabaseTable.AGENT_EXECUTIONS}
       ORDER BY UPDATE_TIMESTAMP DESC LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return rows.map((r) => this.mapExecutionRow(r));
  }

  public async saveStep(
    step: Omit<AgentStep, "id" | "created_timestamp" | "update_timestamp"> & {
      id?: string;
    },
  ): Promise<AgentStep> {
    const dataSource = await dataSourceManager.getDriver();
    const id = step.id || randomUUID();
    const now = new Date().toISOString();

    const entity: AgentStep = {
      ...step,
      id,
      created_timestamp: now,
      update_timestamp: now,
    };

    try {
      await dataSource.run(
        `INSERT INTO ${DatabaseTable.AGENT_STEPS} (
          STEP_ID, AGENT_ID, STEP_NUMBER, STEP_TYPE, CONTENT, TOOL_NAME, STATUS,
          METADATA, CREATED_TIMESTAMP, UPDATE_TIMESTAMP
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entity.id,
          entity.agent_id,
          entity.step_number,
          entity.step_type,
          entity.content,
          entity.tool_name || null,
          entity.status,
          JSON.stringify(entity.metadata || {}),
          entity.created_timestamp,
          entity.update_timestamp,
        ],
      );
    } catch {
      await dataSource.run(
        `INSERT INTO ${DatabaseTable.AGENT_STEPS} (
          ID, AGENT_ID, STEP_NUMBER, STEP_TYPE, CONTENT, TOOL_NAME, STATUS,
          METADATA, CREATED_TIMESTAMP, UPDATE_TIMESTAMP
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entity.id,
          entity.agent_id,
          entity.step_number,
          entity.step_type,
          entity.content,
          entity.tool_name || null,
          entity.status,
          JSON.stringify(entity.metadata || {}),
          entity.created_timestamp,
          entity.update_timestamp,
        ],
      );
    }

    return entity;
  }

  public async getSteps(agentId: string): Promise<AgentStep[]> {
    const dataSource = await dataSourceManager.getDriver();
    const rows = await dataSource.all(
      `SELECT * FROM ${DatabaseTable.AGENT_STEPS}
       WHERE AGENT_ID = ? ORDER BY STEP_NUMBER ASC`,
      [agentId],
    );
    return rows.map((r) => this.mapStepRow(r));
  }

  private mapExecutionRow(row: Record<string, any>): AgentExecution {
    return {
      id: row.AGENT_ID ?? row.ID,
      agent_name: row.AGENT_NAME,
      project:
        row.PROJECT || this.safeParseObject(row.METADATA)?.project || "default",
      task: row.TASK,
      model: row.MODEL,
      approval_mode: row.APPROVAL_MODE,
      sandbox: Boolean(row.SANDBOX),
      status: row.STATUS || AgentStatusConstant.RUNNING,
      skills: this.safeParseArray(row.SKILLS),
      result: row.RESULT || undefined,
      error_message: row.ERROR_MESSAGE || undefined,
      prompt_tokens: row.PROMPT_TOKENS ?? undefined,
      completion_tokens: row.COMPLETION_TOKENS ?? undefined,
      total_tokens: row.TOTAL_TOKENS ?? undefined,
      latency_ms: row.LATENCY_MS ?? undefined,
      subscription_tier: row.SUBSCRIPTION_TIER || "freeware",
      metadata: this.safeParseObject(row.METADATA),
      created_timestamp: row.CREATED_TIMESTAMP,
      update_timestamp: row.UPDATE_TIMESTAMP,
    };
  }

  private mapStepRow(row: Record<string, any>): AgentStep {
    return {
      id: row.STEP_ID ?? row.ID,
      agent_id: row.AGENT_ID,
      step_number: row.STEP_NUMBER,
      step_type: row.STEP_TYPE,
      content: row.CONTENT,
      tool_name: row.TOOL_NAME || undefined,
      status: row.STATUS,
      metadata: this.safeParseObject(row.METADATA),
      created_timestamp: row.CREATED_TIMESTAMP,
      update_timestamp: row.UPDATE_TIMESTAMP,
    };
  }

  private safeParseArray(val: unknown): string[] {
    if (typeof val !== "string") return [];
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private safeParseObject(val: unknown): Record<string, any> {
    if (typeof val !== "string") return {};
    try {
      return JSON.parse(val);
    } catch {
      return {};
    }
  }
}

export const agentRepository = new AgentRepository();
