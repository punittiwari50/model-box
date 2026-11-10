import { randomUUID } from "@model-box/model-connector-core";
import { platformDatabase } from "@/database/platformDatabase";
import { PaginationQueryGuard } from "@/database/PaginationQueryGuard";

export interface StoredSession {
  sessionId: string;
  sessionTitle: string;
  activeModelId: string;
  strategyMode: string;
  turnCount: number;
  createdTimestamp: string;
  updatedTimestamp: string;
}

export interface StoredMessage {
  messageId: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string;
  strategy: string;
  tokenCount: number;
  latencyMs: number;
  timestamp: string;
}

export class SessionRepository {
  private static readonly CLEANUP_CANDIDATE_SQL = `
    SELECT SESSION_ID as id FROM SESSIONS
    WHERE SESSION_ID LIKE 'test-%'
       OR SESSION_ID LIKE 'pw-%'
       OR SESSION_ID LIKE 'sess_%'
       OR SESSION_TITLE LIKE '%test%'
       OR SESSION_TITLE LIKE '%dummy%'
       OR SESSION_TITLE LIKE '%Say the word%'
       OR SESSION_TITLE LIKE '%Respond with exactly%'
       OR SESSION_TITLE LIKE '%What is 2+2%'
       OR SESSION_TITLE LIKE '%Hello%'
       OR SESSION_TITLE LIKE 'Chat %'
  `;

  private static readonly ORPHAN_CLEANUP_SQL = `
    DELETE FROM MESSAGES
    WHERE SESSION_ID NOT IN (SELECT SESSION_ID FROM SESSIONS)
       OR SESSION_ID LIKE 'test-%'
       OR SESSION_ID LIKE 'pw-%'
       OR SESSION_ID LIKE 'sess_%'
       OR MESSAGE_CONTENT LIKE '%Say the word%'
       OR MESSAGE_CONTENT LIKE '%Respond with exactly%'
       OR MESSAGE_CONTENT LIKE '%What is 2+2%'
       OR MESSAGE_CONTENT LIKE '%Hello%'
  `;

  public async listSessions(limit?: number, offset?: number): Promise<StoredSession[]> {
    const { limit: safeLimit, offset: safeOffset } = PaginationQueryGuard.resolveCriteria(
      limit,
      offset,
    );

    // 1. Try PostgreSQL execution
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{
        sessionId: string;
        sessionTitle: string;
        activeModelId: string;
        strategyMode: string;
        turnCount: number;
        createdTimestamp: string;
        updatedTimestamp: string;
      }>(
        `SELECT SESSION_ID as "sessionId",
                SESSION_TITLE as "sessionTitle",
                ACTIVE_MODEL_ID as "activeModelId",
                STRATEGY_MODE as "strategyMode",
                TURN_COUNT as "turnCount",
                CREATED_TIMESTAMP as "createdTimestamp",
                UPDATED_TIMESTAMP as "updatedTimestamp"
         FROM SESSIONS
         ORDER BY UPDATED_TIMESTAMP DESC
         LIMIT $1 OFFSET $2`,
        [safeLimit, safeOffset],
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          sessionId: String(r.sessionId),
          sessionTitle: String(r.sessionTitle),
          activeModelId: String(r.activeModelId),
          strategyMode: String(r.strategyMode),
          turnCount: Number(r.turnCount),
          createdTimestamp: String(r.createdTimestamp),
          updatedTimestamp: String(r.updatedTimestamp),
        }));
      }
    } catch {
      // Postgres safe isolation
    }

    // 2. Fallback to SQLite
    return this.listSessionsSync(safeLimit, safeOffset);
  }

  public listSessionsSync(safeLimit: number, safeOffset: number): StoredSession[] {
    const db = platformDatabase.getDatabase();
    const rows = db
      .prepare(
        `SELECT SESSION_ID as sessionId,
                SESSION_TITLE as sessionTitle,
                ACTIVE_MODEL_ID as activeModelId,
                STRATEGY_MODE as strategyMode,
                TURN_COUNT as turnCount,
                CREATED_TIMESTAMP as createdTimestamp,
                UPDATED_TIMESTAMP as updatedTimestamp
         FROM SESSIONS
         ORDER BY UPDATED_TIMESTAMP DESC
         LIMIT ? OFFSET ?`,
      )
      .all(safeLimit, safeOffset) as any[];

    return rows.map((r) => ({
      sessionId: String(r.sessionId),
      sessionTitle: String(r.sessionTitle),
      activeModelId: String(r.activeModelId),
      strategyMode: String(r.strategyMode),
      turnCount: Number(r.turnCount),
      createdTimestamp: String(r.createdTimestamp),
      updatedTimestamp: String(r.updatedTimestamp),
    }));
  }

  public async getSession(sessionId: string): Promise<StoredSession | undefined> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{
        sessionId: string;
        sessionTitle: string;
        activeModelId: string;
        strategyMode: string;
        turnCount: number;
        createdTimestamp: string;
        updatedTimestamp: string;
      }>(
        `SELECT SESSION_ID as "sessionId",
                SESSION_TITLE as "sessionTitle",
                ACTIVE_MODEL_ID as "activeModelId",
                STRATEGY_MODE as "strategyMode",
                TURN_COUNT as "turnCount",
                CREATED_TIMESTAMP as "createdTimestamp",
                UPDATED_TIMESTAMP as "updatedTimestamp"
         FROM SESSIONS
         WHERE SESSION_ID = $1`,
        [sessionId],
      );
      if (rows && rows.length > 0) {
        const row = rows[0];
        return {
          sessionId: String(row.sessionId),
          sessionTitle: String(row.sessionTitle),
          activeModelId: String(row.activeModelId),
          strategyMode: String(row.strategyMode),
          turnCount: Number(row.turnCount),
          createdTimestamp: String(row.createdTimestamp),
          updatedTimestamp: String(row.updatedTimestamp),
        };
      }
    } catch {
      // Postgres safe isolation
    }

    return this.getSessionSync(sessionId);
  }

  public getSessionSync(sessionId: string): StoredSession | undefined {
    const db = platformDatabase.getDatabase();
    const row = db
      .prepare(
        `SELECT SESSION_ID as sessionId,
                SESSION_TITLE as sessionTitle,
                ACTIVE_MODEL_ID as activeModelId,
                STRATEGY_MODE as strategyMode,
                TURN_COUNT as turnCount,
                CREATED_TIMESTAMP as createdTimestamp,
                UPDATED_TIMESTAMP as updatedTimestamp
         FROM SESSIONS
         WHERE SESSION_ID = ?`,
      )
      .get(sessionId) as any;

    if (!row) return undefined;
    return {
      sessionId: String(row.sessionId),
      sessionTitle: String(row.sessionTitle),
      activeModelId: String(row.activeModelId),
      strategyMode: String(row.strategyMode),
      turnCount: Number(row.turnCount),
      createdTimestamp: String(row.createdTimestamp),
      updatedTimestamp: String(row.updatedTimestamp),
    };
  }

  public getOrCreateSession(
    sessionId?: string,
    modelId = "gemini-3.8-flash",
    strategy = "api",
  ): StoredSession {
    const stored = this.getOrCreateSessionSync(sessionId, modelId, strategy);
    void this.persistSessionToPostgres(stored);
    return stored;
  }

  public getOrCreateSessionSync(
    sessionId?: string,
    modelId = "gemini-3.8-flash",
    strategy = "api",
  ): StoredSession {
    const id = sessionId || randomUUID();
    const existing = this.getSessionSync(id);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const title = `Chat ${now.slice(11, 16)}`;
    const db = platformDatabase.getDatabase();
    db.prepare(
      `INSERT INTO SESSIONS (SESSION_ID, SESSION_TITLE, ACTIVE_MODEL_ID, STRATEGY_MODE, TURN_COUNT, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).run(id, title, modelId, strategy, now, now);

    return {
      sessionId: id,
      sessionTitle: title,
      activeModelId: modelId,
      strategyMode: strategy,
      turnCount: 0,
      createdTimestamp: now,
      updatedTimestamp: now,
    };
  }

  private async persistSessionToPostgres(session: StoredSession): Promise<void> {
    try {
      const pg = platformDatabase.getPostgresManager();
      await pg.execute(
        `INSERT INTO SESSIONS (SESSION_ID, SESSION_TITLE, ACTIVE_MODEL_ID, STRATEGY_MODE, TURN_COUNT, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (SESSION_ID) DO UPDATE
         SET ACTIVE_MODEL_ID = EXCLUDED.ACTIVE_MODEL_ID,
             STRATEGY_MODE = EXCLUDED.STRATEGY_MODE,
             TURN_COUNT = EXCLUDED.TURN_COUNT,
             UPDATED_TIMESTAMP = EXCLUDED.UPDATED_TIMESTAMP`,
        [
          session.sessionId,
          session.sessionTitle,
          session.activeModelId,
          session.strategyMode,
          session.turnCount,
          session.createdTimestamp,
          session.updatedTimestamp,
        ],
      );
    } catch {
      // Postgres safe isolation
    }
  }

  public updateSessionOnMessage(
    sessionId: string,
    modelId: string,
    strategy: string,
    promptSummary?: string,
  ): void {
    const db = platformDatabase.getDatabase();
    const now = new Date().toISOString();
    const session = this.getSessionSync(sessionId);

    if (!session) {
      const title = promptSummary
        ? promptSummary.slice(0, 32).trim()
        : `Chat ${now.slice(11, 16)}`;
      db.prepare(
        `INSERT INTO SESSIONS (SESSION_ID, SESSION_TITLE, ACTIVE_MODEL_ID, STRATEGY_MODE, TURN_COUNT, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      ).run(sessionId, title, modelId, strategy, now, now);
      void this.persistSessionToPostgres({
        sessionId,
        sessionTitle: title,
        activeModelId: modelId,
        strategyMode: strategy,
        turnCount: 1,
        createdTimestamp: now,
        updatedTimestamp: now,
      });
      return;
    }

    const newTurn = session.turnCount + 1;
    const title =
      session.turnCount === 0 && promptSummary
        ? promptSummary.slice(0, 32).trim()
        : session.sessionTitle;

    db.prepare(
      `UPDATE SESSIONS
       SET ACTIVE_MODEL_ID = ?,
           STRATEGY_MODE = ?,
           TURN_COUNT = ?,
           SESSION_TITLE = ?,
           UPDATED_TIMESTAMP = ?
       WHERE SESSION_ID = ?`,
    ).run(modelId, strategy, newTurn, title, now, sessionId);

    void this.persistSessionToPostgres({
      sessionId,
      sessionTitle: title,
      activeModelId: modelId,
      strategyMode: strategy,
      turnCount: newTurn,
      createdTimestamp: session.createdTimestamp,
      updatedTimestamp: now,
    });
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const pg = platformDatabase.getPostgresManager();
      await pg.execute(`DELETE FROM MESSAGES WHERE SESSION_ID = $1`, [sessionId]);
      await pg.execute(`DELETE FROM SESSIONS WHERE SESSION_ID = $1`, [sessionId]);
    } catch {
      // Postgres safe isolation
    }

    const db = platformDatabase.getDatabase();
    const res = db.prepare(`DELETE FROM SESSIONS WHERE SESSION_ID = ?`).run(sessionId);
    db.prepare(`DELETE FROM MESSAGES WHERE SESSION_ID = ?`).run(sessionId);
    return res.changes > 0;
  }

  public async cleanupTestSessions(): Promise<number> {
    try {
      const pg = platformDatabase.getPostgresManager();
      await pg.execute(
        `DELETE FROM SESSIONS
         WHERE SESSION_ID LIKE 'test-%'
            OR SESSION_ID LIKE 'pw-%'
            OR SESSION_ID LIKE 'sess_%'
            OR SESSION_TITLE LIKE '%test%'
            OR SESSION_TITLE LIKE '%dummy%'
            OR SESSION_TITLE LIKE '%Say the word%'
            OR SESSION_TITLE LIKE '%Respond with exactly%'
            OR SESSION_TITLE LIKE '%What is 2+2%'
            OR SESSION_TITLE LIKE '%Hello%'
            OR SESSION_TITLE LIKE 'Chat %'`,
      );
      await pg.execute(
        `DELETE FROM MESSAGES
         WHERE SESSION_ID NOT IN (SELECT SESSION_ID FROM SESSIONS)`,
      );
    } catch {
      // Postgres safe isolation
    }

    const db = platformDatabase.getDatabase();
    const rows = db.prepare(SessionRepository.CLEANUP_CANDIDATE_SQL).all() as { id: string }[];
    const deletedCount = rows.reduce((acc, r) => {
      const res = db.prepare(`DELETE FROM SESSIONS WHERE SESSION_ID = ?`).run(r.id);
      db.prepare(`DELETE FROM MESSAGES WHERE SESSION_ID = ?`).run(r.id);
      return acc + (res.changes > 0 ? 1 : 0);
    }, 0);
    this.purgeOrphanedMessages();
    return deletedCount;
  }

  private purgeOrphanedMessages(): void {
    const db = platformDatabase.getDatabase();
    db.prepare(SessionRepository.ORPHAN_CLEANUP_SQL).run();
    db.prepare(
      `DELETE FROM MODEL_ACCOUNTS
       WHERE ACCOUNT_ID LIKE 'test-%'
          OR ACCOUNT_ID LIKE 'pw-%'
          OR USER_EMAIL LIKE 'test-%'
          OR USER_EMAIL LIKE 'dbtest@%'`,
    ).run();
  }

  public saveMessage(message: {
    messageId?: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    model: string;
    strategy: string;
    tokenCount?: number;
    latencyMs?: number;
  }): StoredMessage {
    const id = message.messageId || randomUUID();
    const now = new Date().toISOString();

    // 1. Persist to Postgres
    void this.persistMessageToPostgres(id, message, now);

    // 2. Persist to SQLite Fallback
    const db = platformDatabase.getDatabase();
    db.prepare(
      `INSERT INTO MESSAGES (
         MESSAGE_ID, SESSION_ID, MESSAGE_ROLE, MESSAGE_CONTENT,
         MODEL_ID, STRATEGY_MODE, TOKEN_COUNT, LATENCY_MS, CREATED_TIMESTAMP
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      message.sessionId,
      message.role,
      message.content,
      message.model,
      message.strategy,
      message.tokenCount || 0,
      message.latencyMs || 0,
      now,
    );

    return {
      messageId: id,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      model: message.model,
      strategy: message.strategy,
      tokenCount: message.tokenCount || 0,
      latencyMs: message.latencyMs || 0,
      timestamp: now,
    };
  }

  private async persistMessageToPostgres(
    id: string,
    message: {
      sessionId: string;
      role: "user" | "assistant" | "system";
      content: string;
      model: string;
      strategy: string;
      tokenCount?: number;
      latencyMs?: number;
    },
    now: string,
  ): Promise<void> {
    try {
      const pg = platformDatabase.getPostgresManager();
      await pg.execute(
        `INSERT INTO MESSAGES (
           MESSAGE_ID, SESSION_ID, MESSAGE_ROLE, MESSAGE_CONTENT,
           MODEL_ID, STRATEGY_MODE, TOKEN_COUNT, LATENCY_MS,
           CREATED_TIMESTAMP, UPDATED_TIMESTAMP
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (MESSAGE_ID) DO NOTHING`,
        [
          id,
          message.sessionId,
          message.role,
          message.content,
          message.model,
          message.strategy,
          message.tokenCount || 0,
          message.latencyMs || 0,
          now,
          now,
        ],
      );
    } catch {
      // Postgres safe isolation
    }
  }

  public async getSessionMessages(
    sessionId: string,
    limit?: number,
    offset?: number,
  ): Promise<StoredMessage[]> {
    const { limit: safeLimit, offset: safeOffset } = PaginationQueryGuard.resolveCriteria(
      limit,
      offset,
    );

    // 1. Try PostgreSQL execution
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{
        messageId: string;
        sessionId: string;
        role: "user" | "assistant" | "system";
        content: string;
        model: string;
        strategy: string;
        tokenCount: number;
        latencyMs: number;
        timestamp: string;
      }>(
        `SELECT MESSAGE_ID as "messageId",
                SESSION_ID as "sessionId",
                MESSAGE_ROLE as "role",
                MESSAGE_CONTENT as "content",
                MODEL_ID as "model",
                STRATEGY_MODE as "strategy",
                TOKEN_COUNT as "tokenCount",
                LATENCY_MS as "latencyMs",
                CREATED_TIMESTAMP as "timestamp"
         FROM MESSAGES
         WHERE SESSION_ID = $1
         ORDER BY CREATED_TIMESTAMP ASC
         LIMIT $2 OFFSET $3`,
        [sessionId, safeLimit, safeOffset],
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          messageId: String(r.messageId),
          sessionId: String(r.sessionId),
          role: r.role,
          content: String(r.content),
          model: String(r.model),
          strategy: String(r.strategy),
          tokenCount: Number(r.tokenCount || 0),
          latencyMs: Number(r.latencyMs || 0),
          timestamp: String(r.timestamp),
        }));
      }
    } catch {
      // Postgres safe isolation
    }

    // 2. Fallback to SQLite
    const db = platformDatabase.getDatabase();
    const rows = db
      .prepare(
        `SELECT MESSAGE_ID as messageId,
                SESSION_ID as sessionId,
                MESSAGE_ROLE as role,
                MESSAGE_CONTENT as content,
                MODEL_ID as model,
                STRATEGY_MODE as strategy,
                TOKEN_COUNT as tokenCount,
                LATENCY_MS as latencyMs,
                CREATED_TIMESTAMP as timestamp
         FROM MESSAGES
         WHERE SESSION_ID = ?
         ORDER BY CREATED_TIMESTAMP ASC
         LIMIT ? OFFSET ?`,
      )
      .all(sessionId, safeLimit, safeOffset) as any[];

    return rows.map((r) => ({
      messageId: String(r.messageId),
      sessionId: String(r.sessionId),
      role: r.role as "user" | "assistant" | "system",
      content: String(r.content),
      model: String(r.model),
      strategy: String(r.strategy),
      tokenCount: Number(r.tokenCount || 0),
      latencyMs: Number(r.latencyMs || 0),
      timestamp: String(r.timestamp),
    }));
  }
}

export const sessionRepository = new SessionRepository();
