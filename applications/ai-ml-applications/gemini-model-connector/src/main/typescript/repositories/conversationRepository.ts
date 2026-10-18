import { randomUUID } from 'node:crypto';
import type { Conversation, Message, ContextItem, ConversationEntity } from '@/domain/index.js';
import { dataSourceManager } from '@/core/datasource/dataSourceManager.js';
import { logger } from '@/core/observability/logging/logger.js';
import { DatabaseTable, DatabaseColumn } from '@/domain/constants/index.js';
import { type Specification, OptimisticLockException } from '@/core/datasource/specification.js';
import { config } from '@/core/config/index.js';

export interface IConversationRepository {
  createConversation(conv: Omit<Conversation, 'id' | 'created_at' | 'updated_at' | 'version'> & { id?: string; version?: number; session_id?: string }): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  findBySessionId(sessionId: string): Promise<Conversation | null>;
  listConversations(limit?: number, offset?: number): Promise<Conversation[]>;
  updateSessionId(id: string, sessionId: string): Promise<void>;
  updateMetadata(id: string, metadataUpdates: Record<string, unknown>): Promise<void>;
  updateModel(id: string, model: string): Promise<void>;
  updateWithOptimisticLock(id: string, expectedVersion: number, updates: Partial<Omit<Conversation, 'id' | 'version'>>): Promise<Conversation>;
  findAll(spec?: Specification<ConversationEntity>): Promise<ConversationEntity[]>;
  findOne(spec: Specification<ConversationEntity>): Promise<ConversationEntity | null>;
  deleteConversation(id: string): Promise<boolean>;
  addMessage(msg: Omit<Message, 'id' | 'created_at'> & { id?: string }): Promise<Message>;
  getMessages(conversationId: string): Promise<Message[]>;
  addContext(item: Omit<ContextItem, 'id' | 'created_at'> & { id?: string }): Promise<ContextItem>;
  getContexts(conversationId: string): Promise<ContextItem[]>;
}

export class ConversationRepository implements IConversationRepository {
  async createConversation(conv: Omit<Conversation, 'id' | 'created_at' | 'updated_at' | 'version'> & { id?: string; version?: number; session_id?: string }): Promise<Conversation> {
    const dataSource = await dataSourceManager.getDriver();
    const now = new Date().toISOString();
    const id = conv.id || randomUUID();
    const sessionId = conv.session_id || id;

    const newConv: Conversation = {
      id,
      session_id: sessionId,
      title: conv.title,
      model: conv.model || config.geminiDefaultModel,
      system_instruction: conv.system_instruction,
      tags: conv.tags || [],
      metadata: conv.metadata || {},
      version: conv.version ?? 1,
      created_at: now,
      updated_at: now,
      messages: [],
      contexts: [],
    };

    await dataSource.run(
      `INSERT INTO ${DatabaseTable.CONVERSATIONS} (
        ${DatabaseColumn.ID},
        ${DatabaseColumn.SESSION_ID},
        ${DatabaseColumn.TITLE},
        ${DatabaseColumn.MODEL},
        ${DatabaseColumn.SYSTEM_INSTRUCTION},
        ${DatabaseColumn.TAGS},
        ${DatabaseColumn.METADATA},
        ${DatabaseColumn.VERSION},
        ${DatabaseColumn.CREATED_TIMESTAMP},
        ${DatabaseColumn.UPDATE_TIMESTAMP}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        newConv.id,
        newConv.session_id,
        newConv.title,
        newConv.model,
        newConv.system_instruction || null,
        JSON.stringify(newConv.tags),
        JSON.stringify(newConv.metadata),
        newConv.version,
        newConv.created_at,
        newConv.updated_at,
      ]
    );

    logger.datasource(`Created conversation '${newConv.title}' (ID: ${newConv.id}, Session: ${newConv.session_id}, Version: ${newConv.version})`);
    return newConv;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const dataSource = await dataSourceManager.getDriver();
    const row = await dataSource.get<any>(
      `SELECT * FROM ${DatabaseTable.CONVERSATIONS} WHERE ${DatabaseColumn.ID} = ?;`,
      [id]
    );
    if (!row) return null;

    const messages = await this.getMessages(id);
    const contexts = await this.getContexts(id);
    const createdTimestamp = row.CREATED_TIMESTAMP ?? row.CREATED_AT ?? row.created_timestamp ?? row.created_at;
    const updateTimestamp = row.UPDATE_TIMESTAMP ?? row.UPDATED_AT ?? row.update_timestamp ?? row.updated_at;

    return {
      id: row.ID ?? row.id,
      session_id: row.SESSION_ID ?? row.session_id ?? (row.ID ?? row.id),
      title: row.TITLE ?? row.title,
      model: row.MODEL ?? row.model,
      system_instruction: row.SYSTEM_INSTRUCTION ?? row.system_instruction,
      tags: typeof (row.TAGS ?? row.tags) === 'string' ? JSON.parse(row.TAGS ?? row.tags) : row.TAGS ?? row.tags,
      metadata: typeof (row.METADATA ?? row.metadata) === 'string' ? JSON.parse(row.METADATA ?? row.metadata) : row.METADATA ?? row.metadata,
      version: Number(row.VERSION ?? row.version ?? 1),
      created_timestamp: createdTimestamp,
      update_timestamp: updateTimestamp,
      created_at: createdTimestamp,
      updated_at: updateTimestamp,
      messages,
      contexts,
    };
  }

  async findBySessionId(sessionId: string): Promise<Conversation | null> {
    const dataSource = await dataSourceManager.getDriver();
    const row = await dataSource.get<any>(
      `SELECT ${DatabaseColumn.ID} FROM ${DatabaseTable.CONVERSATIONS} WHERE ${DatabaseColumn.SESSION_ID} = ?;`,
      [sessionId]
    );
    if (!row) return null;
    return this.getConversation(row.ID ?? row.id);
  }

  async updateSessionId(id: string, sessionId: string): Promise<void> {
    const dataSource = await dataSourceManager.getDriver();
    const now = new Date().toISOString();
    await dataSource.run(
      `UPDATE ${DatabaseTable.CONVERSATIONS} SET ${DatabaseColumn.SESSION_ID} = ?, ${DatabaseColumn.UPDATE_TIMESTAMP} = ? WHERE ${DatabaseColumn.ID} = ?;`,
      [sessionId, now, id]
    );
    logger.datasource(`Updated conversation ${id} session ID to ${sessionId}`);
  }

  async updateMetadata(id: string, metadataUpdates: Record<string, unknown>): Promise<void> {
    const dataSource = await dataSourceManager.getDriver();
    const conv = await this.getConversation(id);
    if (!conv) return;
    const merged = { ...(conv.metadata || {}), ...metadataUpdates };
    const now = new Date().toISOString();
    await dataSource.run(
      `UPDATE ${DatabaseTable.CONVERSATIONS} SET ${DatabaseColumn.METADATA} = ?, ${DatabaseColumn.UPDATE_TIMESTAMP} = ? WHERE ${DatabaseColumn.ID} = ?;`,
      [JSON.stringify(merged), now, id]
    );
    logger.datasource(`Updated conversation ${id} metadata`);
  }

  async updateModel(id: string, model: string): Promise<void> {
    const dataSource = await dataSourceManager.getDriver();
    const now = new Date().toISOString();
    await dataSource.run(
      `UPDATE ${DatabaseTable.CONVERSATIONS} SET ${DatabaseColumn.MODEL} = ?, ${DatabaseColumn.UPDATE_TIMESTAMP} = ? WHERE ${DatabaseColumn.ID} = ?;`,
      [model, now, id]
    );
    logger.datasource(`Updated conversation ${id} model to ${model}`);
  }

  async listConversations(limit = 50, offset = 0): Promise<Conversation[]> {
    const dataSource = await dataSourceManager.getDriver();
    const rows = await dataSource.all<any>(
      `SELECT * FROM ${DatabaseTable.CONVERSATIONS} ORDER BY ${DatabaseColumn.UPDATE_TIMESTAMP} DESC LIMIT ? OFFSET ?;`,
      [limit, offset]
    );

    return rows.map((r) => {
      const createdTimestamp = r.CREATED_TIMESTAMP ?? r.CREATED_AT ?? r.created_timestamp ?? r.created_at;
      const updateTimestamp = r.UPDATE_TIMESTAMP ?? r.UPDATED_AT ?? r.update_timestamp ?? r.updated_at;
      return {
        id: r.ID ?? r.id,
        session_id: r.SESSION_ID ?? r.session_id ?? (r.ID ?? r.id),
        title: r.TITLE ?? r.title,
        model: r.MODEL ?? r.model,
        system_instruction: r.SYSTEM_INSTRUCTION ?? r.system_instruction,
        tags: typeof (r.TAGS ?? r.tags) === 'string' ? JSON.parse(r.TAGS ?? r.tags) : r.TAGS ?? r.tags,
        metadata: typeof (r.METADATA ?? r.metadata) === 'string' ? JSON.parse(r.METADATA ?? r.metadata) : r.METADATA ?? r.metadata,
        version: Number(r.VERSION ?? r.version ?? 1),
        created_timestamp: createdTimestamp,
        update_timestamp: updateTimestamp,
        created_at: createdTimestamp,
        updated_at: updateTimestamp,
        messages: [],
        contexts: [],
      };
    });
  }

  async updateWithOptimisticLock(
    id: string,
    expectedVersion: number,
    updates: Partial<Omit<Conversation, 'id' | 'version'>>
  ): Promise<Conversation> {
    const dataSource = await dataSourceManager.getDriver();
    const now = new Date().toISOString();

    const titleParam = updates.title !== undefined ? updates.title : null;
    const modelParam = updates.model !== undefined ? updates.model : null;
    const sysInstructionParam = updates.system_instruction !== undefined ? updates.system_instruction : null;
    const tagsParam = updates.tags !== undefined ? JSON.stringify(updates.tags) : null;
    const metadataParam = updates.metadata !== undefined ? JSON.stringify(updates.metadata) : null;

    const res = await dataSource.run(
      `UPDATE ${DatabaseTable.CONVERSATIONS}
       SET ${DatabaseColumn.TITLE} = COALESCE(?, ${DatabaseColumn.TITLE}),
           ${DatabaseColumn.MODEL} = COALESCE(?, ${DatabaseColumn.MODEL}),
           ${DatabaseColumn.SYSTEM_INSTRUCTION} = COALESCE(?, ${DatabaseColumn.SYSTEM_INSTRUCTION}),
           ${DatabaseColumn.TAGS} = COALESCE(?, ${DatabaseColumn.TAGS}),
           ${DatabaseColumn.METADATA} = COALESCE(?, ${DatabaseColumn.METADATA}),
           ${DatabaseColumn.VERSION} = ${DatabaseColumn.VERSION} + 1,
           ${DatabaseColumn.UPDATE_TIMESTAMP} = ?
       WHERE ${DatabaseColumn.ID} = ? AND ${DatabaseColumn.VERSION} = ?;`,
      [titleParam, modelParam, sysInstructionParam, tagsParam, metadataParam, now, id, expectedVersion]
    );

    if (res.changes === 0) {
      throw new OptimisticLockException('Conversation', id, expectedVersion);
    }

    const updated = await this.getConversation(id);
    if (!updated) {
      throw new Error(`[Database] Failed to retrieve conversation '${id}' after update.`);
    }
    return updated;
  }

  async findAll(spec?: Specification<ConversationEntity>): Promise<ConversationEntity[]> {
    const dataSource = await dataSourceManager.getDriver();
    if (!spec) {
      return this.listConversations();
    }

    const pred = spec.toPredicate();
    const whereSql = pred.sql ? `WHERE ${pred.sql}` : '';
    const rows = await dataSource.all<any>(
      `SELECT * FROM ${DatabaseTable.CONVERSATIONS} ${whereSql} ORDER BY ${DatabaseColumn.UPDATE_TIMESTAMP} DESC;`,
      pred.params as any[]
    );

    return rows.map((r) => {
      const createdTimestamp = r.CREATED_TIMESTAMP ?? r.CREATED_AT ?? r.created_timestamp ?? r.created_at;
      const updateTimestamp = r.UPDATE_TIMESTAMP ?? r.UPDATED_AT ?? r.update_timestamp ?? r.updated_at;
      return {
        id: r.ID ?? r.id,
        session_id: r.SESSION_ID ?? r.session_id ?? (r.ID ?? r.id),
        title: r.TITLE ?? r.title,
        model: r.MODEL ?? r.model,
        system_instruction: r.SYSTEM_INSTRUCTION ?? r.system_instruction,
        tags: typeof (r.TAGS ?? r.tags) === 'string' ? JSON.parse(r.TAGS ?? r.tags) : r.TAGS ?? r.tags,
        metadata: typeof (r.METADATA ?? r.metadata) === 'string' ? JSON.parse(r.METADATA ?? r.metadata) : r.METADATA ?? r.metadata,
        version: Number(r.VERSION ?? r.version ?? 1),
        created_timestamp: createdTimestamp,
        update_timestamp: updateTimestamp,
        created_at: createdTimestamp,
        updated_at: updateTimestamp,
      };
    });
  }

  async findOne(spec: Specification<ConversationEntity>): Promise<ConversationEntity | null> {
    const results = await this.findAll(spec);
    return results[0] || null;
  }

  async deleteConversation(id: string): Promise<boolean> {
    const dataSource = await dataSourceManager.getDriver();
    const res = await dataSource.run(
      `DELETE FROM ${DatabaseTable.CONVERSATIONS} WHERE ${DatabaseColumn.ID} = ?;`,
      [id]
    );
    return res.changes > 0;
  }

  async addMessage(msg: Omit<Message, 'id' | 'created_at'> & { id?: string }): Promise<Message> {
    const dataSource = await dataSourceManager.getDriver();
    const now = new Date().toISOString();
    const id = msg.id || randomUUID();

    const newMsg: Message = {
      id,
      conversation_id: msg.conversation_id,
      role: msg.role,
      content: msg.content,
      model: msg.model,
      prompt_tokens: msg.prompt_tokens,
      completion_tokens: msg.completion_tokens,
      total_tokens: msg.total_tokens,
      latency_ms: msg.latency_ms,
      cli_exit_code: msg.cli_exit_code,
      metadata: msg.metadata || {},
      created_timestamp: now,
      update_timestamp: now,
      created_at: now,
    };

    await dataSource.run(
      `INSERT INTO ${DatabaseTable.MESSAGES} (
        ${DatabaseColumn.ID},
        ${DatabaseColumn.CONVERSATION_ID},
        ${DatabaseColumn.ROLE},
        ${DatabaseColumn.CONTENT},
        ${DatabaseColumn.MODEL},
        ${DatabaseColumn.PROMPT_TOKENS},
        ${DatabaseColumn.COMPLETION_TOKENS},
        ${DatabaseColumn.TOTAL_TOKENS},
        ${DatabaseColumn.LATENCY_MS},
        ${DatabaseColumn.CLI_EXIT_CODE},
        ${DatabaseColumn.METADATA},
        ${DatabaseColumn.CREATED_TIMESTAMP},
        ${DatabaseColumn.UPDATE_TIMESTAMP}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        newMsg.id,
        newMsg.conversation_id,
        newMsg.role,
        newMsg.content,
        newMsg.model || null,
        newMsg.prompt_tokens || null,
        newMsg.completion_tokens || null,
        newMsg.total_tokens || null,
        newMsg.latency_ms || null,
        newMsg.cli_exit_code ?? null,
        JSON.stringify(newMsg.metadata),
        newMsg.created_timestamp,
        newMsg.update_timestamp,
      ]
    );

    logger.datasource(`Recorded message in conv '${newMsg.conversation_id}' (role: ${newMsg.role}, length: ${newMsg.content.length})`);
    return newMsg;
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const dataSource = await dataSourceManager.getDriver();
    const rows = await dataSource.all<any>(
      `SELECT * FROM ${DatabaseTable.MESSAGES} WHERE ${DatabaseColumn.CONVERSATION_ID} = ? ORDER BY ${DatabaseColumn.CREATED_TIMESTAMP} ASC;`,
      [conversationId]
    );

    return rows.map((r) => {
      const createdTimestamp = r.CREATED_TIMESTAMP ?? r.CREATED_AT ?? r.created_timestamp ?? r.created_at;
      const updateTimestamp = r.UPDATE_TIMESTAMP ?? r.UPDATED_AT ?? r.update_timestamp ?? r.updated_at ?? createdTimestamp;
      return {
        id: r.ID ?? r.id,
        conversation_id: r.CONVERSATION_ID ?? r.conversation_id,
        role: r.ROLE ?? r.role,
        content: r.CONTENT ?? r.content,
        model: r.MODEL ?? r.model,
        prompt_tokens: r.PROMPT_TOKENS ?? r.prompt_tokens,
        completion_tokens: r.COMPLETION_TOKENS ?? r.completion_tokens,
        total_tokens: r.TOTAL_TOKENS ?? r.total_tokens,
        latency_ms: r.LATENCY_MS ?? r.latency_ms,
        cli_exit_code: r.CLI_EXIT_CODE ?? r.cli_exit_code,
        metadata: typeof (r.METADATA ?? r.metadata) === 'string' ? JSON.parse(r.METADATA ?? r.metadata) : r.METADATA ?? r.metadata,
        created_timestamp: createdTimestamp,
        update_timestamp: updateTimestamp,
        created_at: createdTimestamp,
      };
    });
  }

  async addContext(item: Omit<ContextItem, 'id' | 'created_at'> & { id?: string }): Promise<ContextItem> {
    const dataSource = await dataSourceManager.getDriver();
    const now = new Date().toISOString();
    const id = item.id || randomUUID();

    const newItem: ContextItem = {
      id,
      conversation_id: item.conversation_id,
      context_type: item.context_type,
      title: item.title,
      content: item.content,
      metadata: item.metadata || {},
      created_timestamp: now,
      update_timestamp: now,
      created_at: now,
    };

    await dataSource.run(
      `INSERT INTO ${DatabaseTable.CONTEXT_ITEMS} (
        ${DatabaseColumn.ID},
        ${DatabaseColumn.CONVERSATION_ID},
        ${DatabaseColumn.CONTEXT_TYPE},
        ${DatabaseColumn.TITLE},
        ${DatabaseColumn.CONTENT},
        ${DatabaseColumn.METADATA},
        ${DatabaseColumn.CREATED_TIMESTAMP},
        ${DatabaseColumn.UPDATE_TIMESTAMP}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        newItem.id,
        newItem.conversation_id,
        newItem.context_type,
        newItem.title,
        newItem.content,
        JSON.stringify(newItem.metadata),
        newItem.created_timestamp,
        newItem.update_timestamp,
      ]
    );

    return newItem;
  }

  async getContexts(conversationId: string): Promise<ContextItem[]> {
    const dataSource = await dataSourceManager.getDriver();
    const rows = await dataSource.all<any>(
      `SELECT * FROM ${DatabaseTable.CONTEXT_ITEMS} WHERE ${DatabaseColumn.CONVERSATION_ID} = ? ORDER BY ${DatabaseColumn.CREATED_TIMESTAMP} ASC;`,
      [conversationId]
    );

    return rows.map((r) => {
      const createdTimestamp = r.CREATED_TIMESTAMP ?? r.CREATED_AT ?? r.created_timestamp ?? r.created_at;
      const updateTimestamp = r.UPDATE_TIMESTAMP ?? r.UPDATED_AT ?? r.update_timestamp ?? r.updated_at ?? createdTimestamp;
      return {
        id: r.ID ?? r.id,
        conversation_id: r.CONVERSATION_ID ?? r.conversation_id,
        context_type: r.CONTEXT_TYPE ?? r.context_type,
        title: r.TITLE ?? r.title,
        content: r.CONTENT ?? r.content,
        metadata: typeof (r.METADATA ?? r.metadata) === 'string' ? JSON.parse(r.METADATA ?? r.metadata) : r.METADATA ?? r.metadata,
        created_timestamp: createdTimestamp,
        update_timestamp: updateTimestamp,
        created_at: createdTimestamp,
      };
    });
  }
}

export const conversationRepo: IConversationRepository = new ConversationRepository();
