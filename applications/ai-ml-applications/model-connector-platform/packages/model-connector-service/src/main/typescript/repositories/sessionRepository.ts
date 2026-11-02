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

  public listSessions(limit?: number, offset?: number): StoredSession[] {
    const { limit: safeLimit, offset: safeOffset } = PaginationQueryGuard.resolveCriteria(
      limit,
      offset,
    );
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

  public getSession(sessionId: string): StoredSession | undefined {
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
    const id = sessionId || randomUUID();
    const existing = this.getSession(id);
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

  public updateSessionOnMessage(
    sessionId: string,
    modelId: string,
    strategy: string,
    promptSummary?: string,
  ): void {
    const db = platformDatabase.getDatabase();
    const now = new Date().toISOString();
    const session = this.getSession(sessionId);

    if (!session) {
      const title = promptSummary
        ? promptSummary.slice(0, 32).trim()
        : `Chat ${now.slice(11, 16)}`;
      db.prepare(
        `INSERT INTO SESSIONS (SESSION_ID, SESSION_TITLE, ACTIVE_MODEL_ID, STRATEGY_MODE, TURN_COUNT, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      ).run(sessionId, title, modelId, strategy, now, now);
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
  }

  public deleteSession(sessionId: string): boolean {
    const db = platformDatabase.getDatabase();
    const res = db.prepare(`DELETE FROM SESSIONS WHERE SESSION_ID = ?`).run(sessionId);
    db.prepare(`DELETE FROM MESSAGES WHERE SESSION_ID = ?`).run(sessionId);
    return res.changes > 0;
  }

  public cleanupTestSessions(): number {
    const db = platformDatabase.getDatabase();
    const rows = db.prepare(SessionRepository.CLEANUP_CANDIDATE_SQL).all() as { id: string }[];
    const deletedCount = rows.reduce((acc, r) => acc + (this.deleteSession(r.id) ? 1 : 0), 0);
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
    const db = platformDatabase.getDatabase();
    const id = message.messageId || randomUUID();
    const now = new Date().toISOString();

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

  public getSessionMessages(
    sessionId: string,
    limit?: number,
    offset?: number,
  ): StoredMessage[] {
    const { limit: safeLimit, offset: safeOffset } = PaginationQueryGuard.resolveCriteria(
      limit,
      offset,
    );
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
