import { environment } from "@/config/environment/StandardEnvironment.js";
import { fileUtils } from "@/utils/file/fileUtils.js";
import { pathUtils } from "@/utils/file/pathUtils.js";
import { processUtils } from "@/utils/process/processUtils.js";
import { createDatabaseSync, type DatabaseSync } from "@/utils/db/sqliteUtils.js";

/**
 * Core Flyway Migration & Database Connection Engine.
 * Executes strictly from Flyway-formatted SQL files (V0__..., V1__..., V2__..., V3__...).
 * Zero inline DDL statements exist in TypeScript code (Requirement 3).
 */
export class CoreFlywayMigrationRunner {
  public static findMigrationsDir(): string {
    const envDir = environment.getProperty("PLATFORM_MIGRATIONS_DIR", "");
    if (envDir && fileUtils.exists(envDir)) {
      return envDir;
    }
    const cwd = processUtils.cwd();
    const candidates = [
      pathUtils.resolve(cwd, "config", "database", "migrations"),
      pathUtils.resolve(cwd, "..", "..", "config", "database", "migrations"),
      pathUtils.resolve("/app", "config", "database", "migrations"),
      pathUtils.resolve(cwd, "config", "database", "ddl"),
    ];
    return candidates.find((c) => fileUtils.exists(c)) ?? candidates[0];
  }

  public static findHistoryDdlPath(): string {
    const migrationsDir = this.findMigrationsDir();
    const v0Path = pathUtils.join(migrationsDir, "V0__flyway_schema_history.sql");
    if (fileUtils.exists(v0Path)) {
      return v0Path;
    }
    const cwd = processUtils.cwd();
    const candidates = [
      pathUtils.resolve(cwd, "config", "database", "ddl", "flyway_schema_history.sql"),
      pathUtils.resolve(cwd, "..", "..", "config", "database", "ddl", "flyway_schema_history.sql"),
      pathUtils.resolve("/app", "config", "database", "ddl", "flyway_schema_history.sql"),
    ];
    return candidates.find((c) => fileUtils.exists(c)) ?? v0Path;
  }

  public static migrate(db: DatabaseSync): void {
    const historyDdlPath = this.findHistoryDdlPath();
    if (fileUtils.exists(historyDdlPath)) {
      db.exec(fileUtils.readFileSync(historyDdlPath));
    }
    const migrationsDir = this.findMigrationsDir();
    if (!fileUtils.exists(migrationsDir)) return;
    const appliedVersions = this.getAppliedVersions(db);
    const sqlFiles = this.discoverFlywayScripts(migrationsDir);
    this.applyPendingMigrations(db, migrationsDir, sqlFiles, appliedVersions);
  }

  private static getAppliedVersions(db: DatabaseSync): Set<string> {
    try {
      const rows = db
        .prepare("SELECT VERSION FROM FLYWAY_SCHEMA_HISTORY WHERE SUCCESS = 1")
        .all() as { VERSION: string }[];
      return new Set(rows.map((r) => r.VERSION));
    } catch {
      return new Set<string>();
    }
  }

  private static discoverFlywayScripts(migrationsDir: string): string[] {
    return fileUtils
      .readdirSync(migrationsDir)
      .filter((file) => /^V[1-9]\d*__.*\.sql$/.test(file))
      .sort((a, b) => {
        const numA = parseInt(a.replace(/^V(\d+).*/, "$1"), 10) || 0;
        const numB = parseInt(b.replace(/^V(\d+).*/, "$1"), 10) || 0;
        return numA - numB;
      });
  }

  private static applyPendingMigrations(
    db: DatabaseSync,
    migrationsDir: string,
    sqlFiles: string[],
    appliedVersions: Set<string>,
  ): void {
    let nextRank = appliedVersions.size + 1;
    for (const file of sqlFiles) {
      const match = file.match(/^V(\d+)__(.*)\.sql$/);
      const version = match ? match[1] : file;
      if (appliedVersions.has(version)) continue;
      const description = match ? match[2].replace(/_/g, " ") : file;
      const sqlContent = fileUtils.readFileSync(pathUtils.join(migrationsDir, file));
      this.executeSingleMigration(db, nextRank, version, description, file, sqlContent);
      nextRank += 1;
    }
  }

  private static executeSingleMigration(
    db: DatabaseSync,
    rank: number,
    version: string,
    description: string,
    file: string,
    sqlContent: string,
  ): void {
    const startTime = Date.now();
    db.exec(sqlContent);
    const executionTime = Date.now() - startTime;
    db.prepare(
      `INSERT INTO FLYWAY_SCHEMA_HISTORY (
        INSTALLED_RANK, VERSION, DESCRIPTION, TYPE, SCRIPT, CHECKSUM, INSTALLED_BY, EXECUTION_TIME, SUCCESS
      ) VALUES (?, ?, ?, 'SQL', ?, ?, 'platform-engine', ?, 1)`,
    ).run(rank, version, description, file, sqlContent.length, executionTime);
  }
}

export class CoreDatabaseConnectionManager {
  private static instance: CoreDatabaseConnectionManager | null = null;
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;

  constructor(customDbPath?: string) {
    const dataDir = environment.getProperty("DATA_DIR", "/app/config/data");
    const configuredPath = customDbPath || environment.getProperty("PLATFORM_DB_PATH", "");
    this.dbPath = configuredPath || pathUtils.resolve(dataDir, "platform.db");
    this.initialize();
  }

  public static getInstance(): CoreDatabaseConnectionManager {
    if (!this.instance) {
      this.instance = new CoreDatabaseConnectionManager();
    }
    return this.instance;
  }

  private initialize(): void {
    fileUtils.ensureDirectory(pathUtils.dirname(this.dbPath));
    this.db = createDatabaseSync(this.dbPath);
    this.db.exec(`
      PRAGMA JOURNAL_MODE = WAL;
      PRAGMA SYNCHRONOUS = NORMAL;
      PRAGMA busy_timeout = 10000;
      PRAGMA FOREIGN_KEYS = ON;
    `);
    CoreFlywayMigrationRunner.migrate(this.db);
  }

  public getDatabase(): DatabaseSync {
    if (!this.db) {
      this.initialize();
    }
    return this.db!;
  }
}

export const coreDatabaseManager = CoreDatabaseConnectionManager.getInstance();
