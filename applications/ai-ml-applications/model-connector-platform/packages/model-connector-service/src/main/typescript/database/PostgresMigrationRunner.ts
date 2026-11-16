import {
  fileUtils,
  pathUtils,
  processUtils,
} from "@model-box/model-connector-core";
import {
  postgresConnectionManager,
  type PostgresConnectionManager,
} from "@/database/PostgresConnectionManager";

export interface MigrationExecutionResult {
  readonly scriptName: string;
  readonly scriptType: "DDL" | "DML";
  readonly executionTimeMs: number;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Enterprise PostgreSQL Migration & DDL/DML Execution Engine.
 * Conforms to Requirement #2: DDL and DML must be executed in PostgreSQL.
 * Adheres to STD-COD-005, STD-COD-007 (SLAP <= 20 lines), and STD-COD-010.
 */
export class PostgresMigrationRunner {
  public static async migrate(
    manager: PostgresConnectionManager = postgresConnectionManager,
  ): Promise<MigrationExecutionResult[]> {
    const results: MigrationExecutionResult[] = [];
    const baseDir = this.resolveDatabaseDir();

    await this.ensureFlywayHistoryTable(manager);
    await this.executeDdlScripts(manager, baseDir, results);
    await this.executeDmlScripts(manager, baseDir, results);
    await this.executeFlywayVersionedScripts(manager, baseDir, results);

    return results;
  }

  public static resolveDatabaseDir(): string {
    const cwd = processUtils.cwd();
    const candidates = [
      pathUtils.resolve(cwd, "config", "database"),
      pathUtils.resolve(cwd, "..", "..", "config", "database"),
      pathUtils.resolve("/app", "config", "database"),
    ];
    return candidates.find((c) => fileUtils.exists(c)) ?? candidates[0];
  }

  private static async ensureFlywayHistoryTable(manager: PostgresConnectionManager): Promise<void> {
    const ddl = `
      CREATE TABLE IF NOT EXISTS FLYWAY_SCHEMA_HISTORY (
        INSTALLED_RANK INTEGER PRIMARY KEY,
        VERSION VARCHAR(50),
        DESCRIPTION VARCHAR(200) NOT NULL,
        TYPE VARCHAR(20) NOT NULL,
        SCRIPT VARCHAR(1000) NOT NULL,
        CHECKSUM INTEGER,
        INSTALLED_BY VARCHAR(100) NOT NULL,
        INSTALLED_ON TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        EXECUTION_TIME INTEGER NOT NULL,
        SUCCESS BOOLEAN NOT NULL
      );
    `;
    await manager.execute(ddl);
  }

  private static async executeDdlScripts(
    manager: PostgresConnectionManager,
    baseDir: string,
    results: MigrationExecutionResult[],
  ): Promise<void> {
    const ddlDir = pathUtils.join(baseDir, "ddl");
    if (!fileUtils.exists(ddlDir)) return;

    const ddlFiles = ["00_init_multi_model_postgres.sql", "01_core_schema.sql", "02_rbac_schema.sql"];
    for (const file of ddlFiles) {
      const fullPath = pathUtils.join(ddlDir, file);
      if (fileUtils.exists(fullPath)) {
        const res = await this.runSingleSqlFile(manager, fullPath, file, "DDL");
        results.push(res);
      }
    }
  }

  private static async executeDmlScripts(
    manager: PostgresConnectionManager,
    baseDir: string,
    results: MigrationExecutionResult[],
  ): Promise<void> {
    const dmlDir = pathUtils.join(baseDir, "dml");
    if (!fileUtils.exists(dmlDir)) return;

    const dmlFiles = ["01_canonical_seeds.sql"];
    for (const file of dmlFiles) {
      const fullPath = pathUtils.join(dmlDir, file);
      if (fileUtils.exists(fullPath)) {
        const res = await this.runSingleSqlFile(manager, fullPath, file, "DML");
        results.push(res);
      }
    }
  }

  private static async executeFlywayVersionedScripts(
    manager: PostgresConnectionManager,
    baseDir: string,
    results: MigrationExecutionResult[],
  ): Promise<void> {
    const migDir = pathUtils.join(baseDir, "migrations");
    if (!fileUtils.exists(migDir)) return;

    const appliedVersions = await this.getAppliedVersions(manager);
    const files = fileUtils
      .readdirSync(migDir)
      .filter((f) => /^V\d+__.*\.sql$/.test(f))
      .sort((a, b) => this.extractRank(a) - this.extractRank(b));

    for (const file of files) {
      const version = this.extractVersion(file);
      if (appliedVersions.has(version)) continue;
      const fullPath = pathUtils.join(migDir, file);
      const res = await this.runSingleSqlFile(manager, fullPath, file, "DDL", version);
      results.push(res);
    }
  }

  private static async runSingleSqlFile(
    manager: PostgresConnectionManager,
    filePath: string,
    fileName: string,
    type: "DDL" | "DML",
    version?: string,
  ): Promise<MigrationExecutionResult> {
    const startTime = Date.now();
    try {
      const sql = fileUtils.readFileSync(filePath);
      await manager.execute(sql);
      const duration = Date.now() - startTime;
      await this.recordHistory(manager, fileName, type, duration, true, version);
      console.log(`[PostgresMigrationRunner] Executed ${type}: ${fileName} (${duration}ms)`);
      return { scriptName: fileName, scriptType: type, executionTimeMs: duration, success: true };
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[PostgresMigrationRunner] Failed ${type}: ${fileName} - ${errorMsg}`);
      return { scriptName: fileName, scriptType: type, executionTimeMs: duration, success: false, error: errorMsg };
    }
  }

  private static async recordHistory(
    manager: PostgresConnectionManager,
    scriptName: string,
    type: "DDL" | "DML",
    executionTimeMs: number,
    success: boolean,
    version?: string,
  ): Promise<void> {
    try {
      const ver = version || scriptName.replace(/\.sql$/, "");
      const desc = scriptName.replace(/\.sql$/, "").replace(/_/g, " ");
      const maxRes = await manager.query<{ next_rank: number }>(
        "SELECT (COALESCE(MAX(INSTALLED_RANK), 0) + 1)::int as next_rank FROM FLYWAY_SCHEMA_HISTORY"
      );
      const nextRank = maxRes[0]?.next_rank ?? 1;
      const sql = `
        INSERT INTO FLYWAY_SCHEMA_HISTORY (
          INSTALLED_RANK, VERSION, DESCRIPTION, TYPE, SCRIPT, CHECKSUM, INSTALLED_BY, EXECUTION_TIME, SUCCESS
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (INSTALLED_RANK) DO NOTHING;
      `;
      await manager.execute(sql, [nextRank, ver, desc, type, scriptName, scriptName.length, "postgres-runner", executionTimeMs, success]);
    } catch (err) {
      console.warn(`[PostgresMigrationRunner] Failed recording history for ${scriptName}:`, err);
    }
  }

  private static async getAppliedVersions(manager: PostgresConnectionManager): Promise<Set<string>> {
    try {
      const rows = await manager.query<{ version: string }>(
        "SELECT VERSION as version FROM FLYWAY_SCHEMA_HISTORY WHERE SUCCESS = true"
      );
      return new Set(rows.map((r) => r.version));
    } catch {
      return new Set<string>();
    }
  }

  private static extractRank(fileName: string): number {
    const match = fileName.match(/^V(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private static extractVersion(fileName: string): string {
    const match = fileName.match(/^V(\d+)/);
    return match ? match[1] : fileName;
  }
}
