import { coreDatabaseManager } from "@/database/CoreDatabaseEngine.js";
import { DatabaseTable } from "@/constants/index.js";
import { fileUtils } from "@/utils/file/fileUtils.js";
import { pathUtils } from "@/utils/file/pathUtils.js";
import { processUtils } from "@/utils/process/processUtils.js";
import { logger } from "@/logging/logger.js";

export interface CliOAuthSession {
  readonly sessionId: string;
  readonly provider: string;
  readonly modelId: string;
  readonly authMode: string;
  readonly oauthUrl: string;
  readonly clientId?: string;
  readonly state?: string;
  readonly codeChallenge?: string;
  readonly redirectUri?: string;
  readonly authCode?: string;
  readonly status: "PENDING" | "COMPLETED" | "EXPIRED" | "FAILED";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class CliOAuthSessionRepository {
  private static instance: CliOAuthSessionRepository | null = null;

  public static getInstance(): CliOAuthSessionRepository {
    if (!this.instance) {
      this.instance = new CliOAuthSessionRepository();
    }
    return this.instance;
  }

  public ensureTable(): void {
    const db = coreDatabaseManager.getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${DatabaseTable.CLI_OAUTH_SESSIONS} (
        SESSION_ID TEXT PRIMARY KEY,
        PROVIDER TEXT NOT NULL,
        MODEL_ID TEXT NOT NULL,
        AUTH_MODE TEXT NOT NULL,
        OAUTH_URL TEXT NOT NULL,
        CLIENT_ID TEXT,
        STATE TEXT,
        CODE_CHALLENGE TEXT,
        REDIRECT_URI TEXT,
        AUTH_CODE TEXT,
        STATUS TEXT NOT NULL DEFAULT 'PENDING',
        CREATED_AT TEXT NOT NULL,
        UPDATED_AT TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS IDX_CLI_OAUTH_SESSIONS_STATUS ON ${DatabaseTable.CLI_OAUTH_SESSIONS}(STATUS);
      CREATE INDEX IF NOT EXISTS IDX_CLI_OAUTH_SESSIONS_STATE ON ${DatabaseTable.CLI_OAUTH_SESSIONS}(STATE);
    `);
  }

  public upsertSession(session: CliOAuthSession): void {
    this.ensureTable();
    const db = coreDatabaseManager.getDatabase();
    const existing = db
      .prepare(`SELECT SESSION_ID FROM ${DatabaseTable.CLI_OAUTH_SESSIONS} WHERE SESSION_ID = ?`)
      .get(session.sessionId) as { SESSION_ID: string } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE ${DatabaseTable.CLI_OAUTH_SESSIONS}
        SET AUTH_CODE = COALESCE(?, AUTH_CODE),
            STATUS = ?,
            UPDATED_AT = ?
        WHERE SESSION_ID = ?
      `).run(session.authCode ?? null, session.status, session.updatedAt, session.sessionId);
    } else {
      db.prepare(`
        INSERT INTO ${DatabaseTable.CLI_OAUTH_SESSIONS} (
          SESSION_ID, PROVIDER, MODEL_ID, AUTH_MODE, OAUTH_URL,
          CLIENT_ID, STATE, CODE_CHALLENGE, REDIRECT_URI,
          AUTH_CODE, STATUS, CREATED_AT, UPDATED_AT
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.sessionId,
        session.provider,
        session.modelId,
        session.authMode,
        session.oauthUrl,
        session.clientId ?? null,
        session.state ?? null,
        session.codeChallenge ?? null,
        session.redirectUri ?? null,
        session.authCode ?? null,
        session.status,
        session.createdAt,
        session.updatedAt,
      );
    }
  }

  public getSessionById(sessionId: string): CliOAuthSession | null {
    this.ensureTable();
    const db = coreDatabaseManager.getDatabase();
    const row = db
      .prepare(`SELECT * FROM ${DatabaseTable.CLI_OAUTH_SESSIONS} WHERE SESSION_ID = ?`)
      .get(sessionId) as Record<string, unknown> | undefined;

    return row ? this.mapRowToSession(row) : null;
  }

  public getLatestPendingSession(modelId?: string): CliOAuthSession | null {
    this.ensureTable();
    const db = coreDatabaseManager.getDatabase();
    const query = modelId
      ? `SELECT * FROM ${DatabaseTable.CLI_OAUTH_SESSIONS} WHERE STATUS = 'PENDING' AND MODEL_ID = ? ORDER BY CREATED_AT DESC LIMIT 1`
      : `SELECT * FROM ${DatabaseTable.CLI_OAUTH_SESSIONS} WHERE STATUS = 'PENDING' ORDER BY CREATED_AT DESC LIMIT 1`;

    const row = (modelId ? db.prepare(query).get(modelId) : db.prepare(query).get()) as
      | Record<string, unknown>
      | undefined;

    return row ? this.mapRowToSession(row) : null;
  }

  public updateAuthCode(sessionId: string, authCode: string): boolean {
    this.ensureTable();
    const db = coreDatabaseManager.getDatabase();
    const now = new Date().toISOString();
    const result = db
      .prepare(`
        UPDATE ${DatabaseTable.CLI_OAUTH_SESSIONS}
        SET AUTH_CODE = ?, STATUS = 'COMPLETED', UPDATED_AT = ?
        WHERE SESSION_ID = ?
      `)
      .run(authCode, now, sessionId);

    return Number(result.changes) > 0;
  }

  public listSessions(limit = 50): CliOAuthSession[] {
    this.ensureTable();
    const db = coreDatabaseManager.getDatabase();
    const rows = db
      .prepare(`SELECT * FROM ${DatabaseTable.CLI_OAUTH_SESSIONS} ORDER BY CREATED_AT DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];

    return rows.map((r) => this.mapRowToSession(r));
  }

  public resolveCsvPath(customPath?: string): string {
    if (customPath && customPath.trim()) {
      return pathUtils.resolve(customPath.trim());
    }
    const envDataDir = processUtils.getEnv("DATA_DIR", "/app/config/data");
    const candidates = [
      pathUtils.join(envDataDir, "oauth_sessions.csv"),
      pathUtils.resolve(process.cwd(), "config", "data", "oauth_sessions.csv"),
      "/app/config/data/oauth_sessions.csv",
    ];
    return candidates.find((c) => fileUtils.exists(c)) ?? candidates[0];
  }

  public syncFromCsv(customCsvPath?: string): number {
    const csvPath = this.resolveCsvPath(customCsvPath);
    if (!fileUtils.exists(csvPath)) {
      return 0;
    }

    try {
      const content = fileUtils.readFileSync(csvPath);
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) return 0; // Header only

      let insertedCount = 0;
      for (let i = 1; i < lines.length; i++) {
        const session = this.parseCsvLine(lines[i]);
        if (session) {
          const existing = this.getSessionById(session.sessionId);
          if (!existing) {
            this.upsertSession(session);
            insertedCount++;
          } else if (session.authCode && session.authCode !== existing.authCode) {
            this.updateAuthCode(session.sessionId, session.authCode);
          }
        }
      }

      if (insertedCount > 0) {
        logger.info(`[CliOAuthSessionRepository] Synced ${insertedCount} new session(s) from CSV to database.`);
      }
      return insertedCount;
    } catch (err: unknown) {
      logger.warn(`[CliOAuthSessionRepository] Failed to sync sessions from CSV: ${String(err)}`);
      return 0;
    }
  }

  private parseCsvLine(line: string): CliOAuthSession | null {
    // Standard CSV quote unescaping
    const parts: string[] = [];
    let insideQuotes = false;
    let entry = "";
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === "," && !insideQuotes) {
        parts.push(entry.trim());
        entry = "";
      } else {
        entry += char;
      }
    }
    parts.push(entry.trim());

    if (parts.length < 5) return null;

    const cleaned = parts.map((p) => p.replace(/^"|"$/g, "").trim());
    const [
      sessionId,
      provider,
      modelId,
      authMode,
      oauthUrl,
      clientId,
      state,
      codeChallenge,
      redirectUri,
      authCode,
      status,
      createdAt,
      updatedAt,
    ] = cleaned;

    return {
      sessionId,
      provider: provider || "google",
      modelId: modelId || "gemini-3.8-flash",
      authMode: authMode || "1. Google OAuth",
      oauthUrl,
      clientId: clientId || undefined,
      state: state || undefined,
      codeChallenge: codeChallenge || undefined,
      redirectUri: redirectUri || undefined,
      authCode: authCode || undefined,
      status: (status as any) || "PENDING",
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: updatedAt || new Date().toISOString(),
    };
  }

  private mapRowToSession(row: Record<string, unknown>): CliOAuthSession {
    return {
      sessionId: String(row.SESSION_ID ?? ""),
      provider: String(row.PROVIDER ?? ""),
      modelId: String(row.MODEL_ID ?? ""),
      authMode: String(row.AUTH_MODE ?? ""),
      oauthUrl: String(row.OAUTH_URL ?? ""),
      clientId: row.CLIENT_ID ? String(row.CLIENT_ID) : undefined,
      state: row.STATE ? String(row.STATE) : undefined,
      codeChallenge: row.CODE_CHALLENGE ? String(row.CODE_CHALLENGE) : undefined,
      redirectUri: row.REDIRECT_URI ? String(row.REDIRECT_URI) : undefined,
      authCode: row.AUTH_CODE ? String(row.AUTH_CODE) : undefined,
      status: (row.STATUS as any) || "PENDING",
      createdAt: String(row.CREATED_AT ?? ""),
      updatedAt: String(row.UPDATED_AT ?? ""),
    };
  }
}

export const cliOAuthSessionRepository = CliOAuthSessionRepository.getInstance();
