import { coreDatabaseManager } from "@/database/CoreDatabaseEngine.js";
import { DatabaseTable, CliOAuthConstants } from "@/constants/index.js";
import { fileUtils } from "@/utils/file/fileUtils.js";
import { pathUtils } from "@/utils/file/pathUtils.js";
import { processUtils } from "@/utils/process/processUtils.js";
import { logger } from "@/logging/logger.js";

export type CliOAuthSessionStatus = "PENDING" | "COMPLETED" | "EXPIRED" | "FAILED";

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
  readonly cliRedirectUri?: string;
  readonly appRedirectUri?: string;
  readonly authCode?: string;
  readonly commitId?: string;
  readonly userEmail?: string;
  readonly status: CliOAuthSessionStatus;
  readonly errorMessage?: string;
  readonly errorCode?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CliOAuthSessionDocument {
  readonly version?: string;
  readonly generatedAt?: string;
  readonly updatedAt?: string;
  readonly latestSessionId?: string;
  readonly sessions: readonly CliOAuthSession[];
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
        CLI_REDIRECT_URI TEXT,
        APP_REDIRECT_URI TEXT,
        AUTH_CODE TEXT,
        STATUS TEXT NOT NULL DEFAULT 'PENDING',
        ERROR_MESSAGE TEXT,
        ERROR_CODE TEXT,
        CREATED_AT TEXT NOT NULL,
        UPDATED_AT TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS IDX_CLI_OAUTH_SESSIONS_STATUS ON ${DatabaseTable.CLI_OAUTH_SESSIONS}(STATUS);
      CREATE INDEX IF NOT EXISTS IDX_CLI_OAUTH_SESSIONS_STATE ON ${DatabaseTable.CLI_OAUTH_SESSIONS}(STATE);
    `);
    this.ensureSchemaColumns();
  }

  private ensureSchemaColumns(): void {
    const db = coreDatabaseManager.getDatabase();
    const columns = [
      "ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN CLI_REDIRECT_URI TEXT;",
      "ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN APP_REDIRECT_URI TEXT;",
      "ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN ERROR_MESSAGE TEXT;",
      "ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN ERROR_CODE TEXT;",
      "ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN COMMIT_ID TEXT;",
      "ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN USER_EMAIL TEXT;",
    ];
    for (const sql of columns) {
      try {
        db.exec(sql);
      } catch {
        // Column already exists
      }
    }
  }

  public upsertSession(session: CliOAuthSession): void {
    this.ensureTable();
    const db = coreDatabaseManager.getDatabase();
    const existing = db
      .prepare(`SELECT SESSION_ID FROM ${DatabaseTable.CLI_OAUTH_SESSIONS} WHERE SESSION_ID = ?`)
      .get(session.sessionId) as { SESSION_ID: string } | undefined;

    if (existing) {
      this.executeSessionUpdate(session);
    } else {
      this.executeSessionInsert(session);
    }
  }

  private executeSessionUpdate(session: CliOAuthSession): void {
    const db = coreDatabaseManager.getDatabase();
    db.prepare(`
      UPDATE ${DatabaseTable.CLI_OAUTH_SESSIONS}
      SET AUTH_CODE = COALESCE(?, AUTH_CODE),
          STATUS = ?,
          ERROR_MESSAGE = COALESCE(?, ERROR_MESSAGE),
          ERROR_CODE = COALESCE(?, ERROR_CODE),
          CLI_REDIRECT_URI = COALESCE(?, CLI_REDIRECT_URI),
          APP_REDIRECT_URI = COALESCE(?, APP_REDIRECT_URI),
          COMMIT_ID = COALESCE(?, COMMIT_ID),
          USER_EMAIL = COALESCE(?, USER_EMAIL),
          UPDATED_AT = ?
      WHERE SESSION_ID = ?
    `).run(
      session.authCode ?? null,
      session.status,
      session.errorMessage ?? null,
      session.errorCode ?? null,
      session.cliRedirectUri ?? null,
      session.appRedirectUri ?? null,
      session.commitId ?? null,
      session.userEmail ?? null,
      session.updatedAt,
      session.sessionId,
    );
  }

  private executeSessionInsert(session: CliOAuthSession): void {
    const db = coreDatabaseManager.getDatabase();
    db.prepare(`
      INSERT INTO ${DatabaseTable.CLI_OAUTH_SESSIONS} (
        SESSION_ID, PROVIDER, MODEL_ID, AUTH_MODE, OAUTH_URL,
        CLIENT_ID, STATE, CODE_CHALLENGE, REDIRECT_URI,
        CLI_REDIRECT_URI, APP_REDIRECT_URI, AUTH_CODE, STATUS,
        ERROR_MESSAGE, ERROR_CODE, COMMIT_ID, USER_EMAIL, CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      session.cliRedirectUri ?? null,
      session.appRedirectUri ?? null,
      session.authCode ?? null,
      session.status,
      session.errorMessage ?? null,
      session.errorCode ?? null,
      session.commitId ?? null,
      session.userEmail ?? null,
      session.createdAt,
      session.updatedAt,
    );
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

  public getLatestSession(modelId?: string): CliOAuthSession | null {
    this.ensureTable();
    const db = coreDatabaseManager.getDatabase();
    const query = modelId
      ? `SELECT * FROM ${DatabaseTable.CLI_OAUTH_SESSIONS} WHERE MODEL_ID = ? ORDER BY CREATED_AT DESC LIMIT 1`
      : `SELECT * FROM ${DatabaseTable.CLI_OAUTH_SESSIONS} ORDER BY CREATED_AT DESC LIMIT 1`;

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

  public markSessionFailed(sessionId: string, errorMessage: string, errorCode?: string): boolean {
    this.ensureTable();
    const db = coreDatabaseManager.getDatabase();
    const now = new Date().toISOString();
    const result = db
      .prepare(`
        UPDATE ${DatabaseTable.CLI_OAUTH_SESSIONS}
        SET STATUS = 'FAILED', ERROR_MESSAGE = ?, ERROR_CODE = ?, UPDATED_AT = ?
        WHERE SESSION_ID = ?
      `)
      .run(errorMessage, errorCode ?? "CLI_ERROR", now, sessionId);

    return Number(result.changes) > 0;
  }

  public recordAuthResult(params: {
    sessionId: string;
    status: CliOAuthSessionStatus;
    commitId?: string;
    userEmail?: string;
    errorMessage?: string;
  }): boolean {
    this.ensureTable();
    const db = coreDatabaseManager.getDatabase();
    const now = new Date().toISOString();
    const result = db
      .prepare(`
        UPDATE ${DatabaseTable.CLI_OAUTH_SESSIONS}
        SET STATUS = ?,
            COMMIT_ID = COALESCE(?, COMMIT_ID),
            USER_EMAIL = COALESCE(?, USER_EMAIL),
            ERROR_MESSAGE = COALESCE(?, ERROR_MESSAGE),
            UPDATED_AT = ?
        WHERE SESSION_ID = ?
      `)
      .run(params.status, params.commitId ?? null, params.userEmail ?? null, params.errorMessage ?? null, now, params.sessionId);

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

  public resolveJsonPath(customPath?: string): string {
    if (customPath && customPath.trim()) {
      return pathUtils.resolve(customPath.trim());
    }
    const envDataDir = processUtils.getEnv("DATA_DIR", CliOAuthConstants.DEFAULT_DATA_DIR);
    const candidates = [
      pathUtils.join(envDataDir, CliOAuthConstants.JSON_SESSIONS_FILE),
      pathUtils.resolve(process.cwd(), "config", "data", CliOAuthConstants.JSON_SESSIONS_FILE),
      pathUtils.join(CliOAuthConstants.DEFAULT_DATA_DIR, CliOAuthConstants.JSON_SESSIONS_FILE),
    ];
    return candidates.find((c) => fileUtils.exists(c)) ?? candidates[0];
  }

  public resolveCsvPath(customPath?: string): string {
    if (customPath && customPath.trim()) {
      return pathUtils.resolve(customPath.trim());
    }
    const envDataDir = processUtils.getEnv("DATA_DIR", CliOAuthConstants.DEFAULT_DATA_DIR);
    const candidates = [
      pathUtils.join(envDataDir, CliOAuthConstants.CSV_SESSIONS_FILE),
      pathUtils.resolve(process.cwd(), "config", "data", CliOAuthConstants.CSV_SESSIONS_FILE),
      pathUtils.join(CliOAuthConstants.DEFAULT_DATA_DIR, CliOAuthConstants.CSV_SESSIONS_FILE),
    ];
    return candidates.find((c) => fileUtils.exists(c)) ?? candidates[0];
  }

  public syncFromJson(customJsonPath?: string): number {
    const jsonPath = this.resolveJsonPath(customJsonPath);
    if (!fileUtils.exists(jsonPath)) return 0;

    try {
      const content = fileUtils.readFileSync(jsonPath);
      const parsed = JSON.parse(content);
      const sessionList: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.sessions)
          ? parsed.sessions
          : [];

      return this.persistSessionList(sessionList);
    } catch (err: unknown) {
      logger.warn(`[CliOAuthSessionRepository] Failed to sync sessions from JSON: ${String(err)}`);
      return 0;
    }
  }

  private persistSessionList(sessionList: unknown[]): number {
    let inserted = 0;
    for (const raw of sessionList) {
      const session = this.validateAndMapJsonSession(raw);
      if (!session) continue;
      const existing = this.getSessionById(session.sessionId);
      if (!existing) {
        this.upsertSession(session);
        inserted++;
      } else if (session.authCode && session.authCode !== existing.authCode) {
        this.updateAuthCode(session.sessionId, session.authCode);
      } else if (session.errorMessage && session.errorMessage !== existing.errorMessage) {
        this.upsertSession(session);
      }
    }
    if (inserted > 0) {
      logger.info(`[CliOAuthSessionRepository] Synced ${inserted} session(s) from JSON to database.`);
    }
    return inserted;
  }

  private validateAndMapJsonSession(raw: unknown): CliOAuthSession | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (!r.sessionId) return null;

    return {
      sessionId: String(r.sessionId),
      provider: String(r.provider || CliOAuthConstants.DEFAULT_PROVIDER),
      modelId: String(r.modelId || CliOAuthConstants.DEFAULT_MODEL_ID),
      authMode: String(r.authMode || CliOAuthConstants.AUTH_MODE_OAUTH),
      oauthUrl: this.sanitizeStoredOAuthUrl(r.oauthUrl),
      clientId: r.clientId ? String(r.clientId) : undefined,
      state: r.state ? String(r.state) : undefined,
      codeChallenge: r.codeChallenge ? String(r.codeChallenge) : undefined,
      redirectUri: r.redirectUri ? String(r.redirectUri) : undefined,
      cliRedirectUri: r.cliRedirectUri ? String(r.cliRedirectUri) : undefined,
      appRedirectUri: r.appRedirectUri ? String(r.appRedirectUri) : undefined,
      authCode: r.authCode ? String(r.authCode) : undefined,
      status: (r.status as any) || "PENDING",
      errorMessage: r.errorMessage ? String(r.errorMessage) : undefined,
      errorCode: r.errorCode ? String(r.errorCode) : undefined,
      createdAt: String(r.createdAt || new Date().toISOString()),
      updatedAt: String(r.updatedAt || new Date().toISOString()),
    };
  }

  public syncFromCsv(customCsvPath?: string): number {
    const csvPath = this.resolveCsvPath(customCsvPath);
    if (!fileUtils.exists(csvPath)) return 0;

    try {
      const content = fileUtils.readFileSync(csvPath);
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) return 0;

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
          } else if (session.oauthUrl && (!existing.oauthUrl || !existing.oauthUrl.startsWith("http"))) {
            this.upsertSession({ ...existing, oauthUrl: session.oauthUrl });
          }
        }
      }
      return insertedCount;
    } catch (err: unknown) {
      logger.warn(`[CliOAuthSessionRepository] Failed to sync sessions from CSV: ${String(err)}`);
      return 0;
    }
  }

  public syncAll(): number {
    const jsonCount = this.syncFromJson();
    const csvCount = this.syncFromCsv();
    return jsonCount + csvCount;
  }

  private parseCsvLine(line: string): CliOAuthSession | null {
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
    return this.buildSessionFromParts(cleaned);
  }

  private buildSessionFromParts(p: string[]): CliOAuthSession {
    const isFullSchema = p.length >= 11;
    const rawUrl = isFullSchema ? p[4] : "";
    const validUrl = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : "";
    const status = (isFullSchema ? p[10] : p[4]) as CliOAuthSessionStatus;
    const userEmail = !isFullSchema && p[3]?.includes("@") ? p[3] : undefined;
    return {
      sessionId: p[0],
      provider: p[1] || CliOAuthConstants.DEFAULT_PROVIDER,
      modelId: p[2] || CliOAuthConstants.DEFAULT_MODEL_ID,
      authMode: isFullSchema ? p[3] : CliOAuthConstants.AUTH_MODE_OAUTH,
      oauthUrl: validUrl,
      clientId: isFullSchema ? p[5] || undefined : undefined,
      state: isFullSchema ? p[6] || undefined : undefined,
      codeChallenge: isFullSchema ? p[7] || undefined : undefined,
      redirectUri: isFullSchema ? p[8] || undefined : undefined,
      cliRedirectUri: isFullSchema ? p[8] || undefined : undefined,
      appRedirectUri: "http://localhost:8085/oauth2callback",
      authCode: isFullSchema ? p[9] || undefined : undefined,
      status: status || "PENDING",
      userEmail,
      createdAt: isFullSchema ? p[11] || new Date().toISOString() : new Date().toISOString(),
      updatedAt: isFullSchema ? p[12] || new Date().toISOString() : p[5] || new Date().toISOString(),
    };
  }

  private sanitizeStoredOAuthUrl(rawUrl: unknown): string {
    let cleaned = String(rawUrl || "").trim();
    const ctrlIdx = cleaned.search(/[\u0000-\u001F\u007F]/);
    if (ctrlIdx >= 0) cleaned = cleaned.slice(0, ctrlIdx).trim();
    const secondHttpsIdx = cleaned.indexOf("https://", 8);
    if (secondHttpsIdx > 0) cleaned = cleaned.slice(0, secondHttpsIdx).trim();
    const secondHttpIdx = cleaned.indexOf("http://", 7);
    if (secondHttpIdx > 0) cleaned = cleaned.slice(0, secondHttpIdx).trim();
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) return "";
    try {
      const parsed = new URL(cleaned);
      const deduped = new URLSearchParams();
      parsed.searchParams.forEach((v, k) => {
        if (!deduped.has(k)) deduped.set(k, v);
      });
      parsed.search = deduped.toString();
      return parsed.toString();
    } catch {
      return cleaned;
    }
  }

  private mapRowToSession(row: Record<string, unknown>): CliOAuthSession {
    return {
      sessionId: String(row.SESSION_ID ?? ""),
      provider: String(row.PROVIDER ?? ""),
      modelId: String(row.MODEL_ID ?? ""),
      authMode: String(row.AUTH_MODE ?? ""),
      oauthUrl: this.sanitizeStoredOAuthUrl(row.OAUTH_URL),
      clientId: row.CLIENT_ID ? String(row.CLIENT_ID) : undefined,
      state: row.STATE ? String(row.STATE) : undefined,
      codeChallenge: row.CODE_CHALLENGE ? String(row.CODE_CHALLENGE) : undefined,
      redirectUri: row.REDIRECT_URI ? String(row.REDIRECT_URI) : undefined,
      cliRedirectUri: row.CLI_REDIRECT_URI ? String(row.CLI_REDIRECT_URI) : undefined,
      appRedirectUri: row.APP_REDIRECT_URI ? String(row.APP_REDIRECT_URI) : undefined,
      authCode: row.AUTH_CODE ? String(row.AUTH_CODE) : undefined,
      status: (row.STATUS as any) || "PENDING",
      errorMessage: row.ERROR_MESSAGE ? String(row.ERROR_MESSAGE) : undefined,
      errorCode: row.ERROR_CODE ? String(row.ERROR_CODE) : undefined,
      commitId: row.COMMIT_ID ? String(row.COMMIT_ID) : undefined,
      userEmail: row.USER_EMAIL ? String(row.USER_EMAIL) : undefined,
      createdAt: String(row.CREATED_AT ?? ""),
      updatedAt: String(row.UPDATED_AT ?? ""),
    };
  }
}

export const cliOAuthSessionRepository = CliOAuthSessionRepository.getInstance();
