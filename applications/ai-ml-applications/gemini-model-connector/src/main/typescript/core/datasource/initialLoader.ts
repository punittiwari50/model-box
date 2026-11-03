import fs from "node:fs";
import path from "node:path";
import type { IDataSourceDriver } from "@/core/datasource/driver.js";
import { config, environment } from "@/core/config/index.js";
import { logger } from "@/core/observability/logging/logger.js";
import { projectRoot } from "@/core/utils/io/pathUtils.js";

export interface LoaderOptions {
  readonly ddlPath?: string;
  readonly dmlPath?: string;
}

/**
 * Dedicated DataSource Initial Loader (DataSource Initializer).
 * Loads and executes DDL (schema) and DML (seed) SQL scripts from config/scripts/sql.
 *
 * Conforms to:
 * - Directive #2: Rename db to datasource in database implementations
 * - Directive #3: Common datasource implementation in core/
 */
export class DataSourceInitialLoader {
  private readonly ddlPath: string;
  private readonly dmlPath: string;

  constructor(options: LoaderOptions = {}) {
    const defaultDdl = path.join(
      projectRoot,
      "config",
      "scripts",
      "sql",
      "schema-ddl.sql",
    );
    const fallbackDdl = path.join(
      projectRoot,
      "scripts",
      "sql",
      "schema-ddl.sql",
    );
    this.ddlPath =
      options.ddlPath || (fs.existsSync(defaultDdl) ? defaultDdl : fallbackDdl);

    const defaultDml = path.join(
      projectRoot,
      "config",
      "scripts",
      "sql",
      "seed-dml.sql",
    );
    const fallbackDml = path.join(
      projectRoot,
      "scripts",
      "sql",
      "seed-dml.sql",
    );
    this.dmlPath =
      options.dmlPath || (fs.existsSync(defaultDml) ? defaultDml : fallbackDml);
  }

  public shouldInitialize(dataSourcePath: string): boolean {
    const isInMemory =
      dataSourcePath === ":memory:" || dataSourcePath.includes(":memory:");
    const isExplicitlyEnabled =
      environment.getPropertyAsBoolean("DB_INIT_ENABLED") ||
      Boolean(config.dbInitEnabled);
    return isInMemory || isExplicitlyEnabled;
  }

  public async loadAndExecute(
    driver: IDataSourceDriver,
    dataSourcePath: string,
  ): Promise<void> {
    if (!this.shouldInitialize(dataSourcePath)) {
      logger.datasource(
        "DataSourceInitialLoader: Schema initialization skipped (disabled by default for persistent datasource).",
      );
      await this.ensureMigrations(driver);
      return;
    }

    logger.datasource(
      `DataSourceInitialLoader: Initializing schema for datasource '${dataSourcePath}'...`,
    );
    await this.executeScript(driver, this.ddlPath, "DDL");
    await this.executeScript(driver, this.dmlPath, "DML");
    await this.ensureMigrations(driver);
    logger.datasource(
      "DataSourceInitialLoader: Schema & Seed data successfully initialized.",
    );
  }

  public async ensureMigrations(driver: IDataSourceDriver): Promise<void> {
    try {
      const promptTable = await driver.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='JOB_SEARCH_PROMPTS';",
      );
      if (!promptTable || promptTable.length === 0) {
        await this.executeScript(driver, this.ddlPath, "DDL");
        await this.executeScript(driver, this.dmlPath, "DML");
        logger.datasource(
          "DataSourceInitialLoader: Initialized schema & seeds from unified schema-ddl.sql.",
        );
      }

      // Execute structured migration SQL files from migrations directory
      const migrationsDir = path.join(path.dirname(this.ddlPath), "migrations");
      if (fs.existsSync(migrationsDir)) {
        const files = fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith(".sql"))
          .sort();
        for (const file of files) {
          const migrationPath = path.join(migrationsDir, file);
          await this.executeScript(driver, migrationPath, `MIGRATION ${file}`);
        }
      }
    } catch (err: any) {
      logger.warn(
        "DATASOURCE_MIGRATION",
        `Migration execution failed: ${err.message}`,
      );
    }
  }

  public async executeScript(
    driver: IDataSourceDriver,
    filePath: string,
    label: string,
  ): Promise<void> {
    if (!fs.existsSync(filePath)) {
      logger.warn(
        "DATASOURCE_LOADER",
        `${label} script not found at path: ${filePath}`,
      );
      return;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const cleaned = content.replace(/--.*$/gm, "").trim();
    const statements = cleaned
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const sql of statements) {
      try {
        await driver.run(`${sql};`);
      } catch (err: any) {
        if (!err.message?.includes("already exists")) {
          logger.warn(
            "DATASOURCE_LOADER",
            `Error executing statement from ${label}: ${err.message}`,
          );
        }
      }
    }
    logger.datasource(
      `DataSourceInitialLoader: Executed ${statements.length} ${label} statements from ${path.basename(filePath)}`,
    );
  }
}

export const dataSourceInitialLoader = new DataSourceInitialLoader();

// Backward compatibility aliases
export const databaseInitialLoader = dataSourceInitialLoader;
export class DatabaseInitialLoader extends DataSourceInitialLoader {}
