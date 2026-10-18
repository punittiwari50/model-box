import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { projectRoot } from '@/core/utils/io/pathUtils.js';

/**
 * Standard Application Environment Interface.
 *
 * Provides a single centralized abstraction over runtime environment variables,
 * profile management, and property conversion. Eliminates direct 'process.env'
 * reads scattered across business domain logic and infrastructure services.
 *
 * Conforms to:
 * - STD-COD-002: Enterprise Centralized Configuration & Governance
 * - STD-COD-004: Acyclic Dependencies & Leaf Modules
 * - STD-COD-007: Clean Code & Fail-Fast Error Resiliency
 * - STD-COD-007.5: Immutability by Default
 */
export interface Environment {
  /**
   * Returns active profiles for the application (e.g., ['production'], ['development']).
   */
  getActiveProfiles(): readonly string[];

  /**
   * Returns default fallback profiles when none are explicitly activated.
   */
  getDefaultProfiles(): readonly string[];

  /**
   * Checks whether at least one of the specified profiles is currently active.
   */
  acceptsProfiles(...profiles: string[]): boolean;

  /**
   * Determines if a property key exists in the environment or active property sources.
   */
  containsProperty(key: string): boolean;

  /**
   * Resolves a string property by key using relaxed binding (e.g. 'server.port' -> 'SERVER_PORT').
   * Returns undefined if the key is not defined.
   */
  getProperty(key: string): string | undefined;

  /**
   * Resolves a string property by key with a fallback default value.
   */
  getProperty(key: string, defaultValue: string): string;

  /**
   * Resolves a numeric property by key with relaxed binding.
   */
  getPropertyAsNumber(key: string, defaultValue?: number): number;

  /**
   * Resolves a boolean property by key ('true'/'false'/'1'/'0'/'yes'/'no').
   */
  getPropertyAsBoolean(key: string, defaultValue?: boolean): boolean;

  /**
   * Resolves a mandatory property. Throws a fail-fast error if undefined or blank.
   */
  getRequiredProperty(key: string): string;

  /**
   * Returns an immutable dictionary of all available properties for child process inheritance.
   */
  getAllProperties(): Readonly<Record<string, string | undefined>>;

  /**
   * Returns the operating system platform identifier (e.g. 'win32', 'darwin', 'linux').
   */
  getPlatform(): string;

  /**
   * Returns true if executing on a Windows runtime.
   */
  isWindows(): boolean;
}

/**
 * Standard Environment implementation encapsulating process.env and dotenv.
 * Acts as the exclusive authority for operating system and container environment resolution.
 */
const PROPERTY_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'model.gemini.cli': Object.freeze(['GEMINI_CLI_COMMAND', 'MODEL_GEMINI_CLI', 'gemini.cli', 'models.gemini.cli']),
  'GEMINI_CLI_COMMAND': Object.freeze(['model.gemini.cli', 'MODEL_GEMINI_CLI', 'gemini.cli', 'models.gemini.cli']),
  'model.claude.cli': Object.freeze(['CLAUDE_CLI_COMMAND', 'MODEL_CLAUDE_CLI', 'claude.cli', 'models.claude.cli']),
  'CLAUDE_CLI_COMMAND': Object.freeze(['model.claude.cli', 'MODEL_CLAUDE_CLI', 'claude.cli', 'models.claude.cli']),
  'model.codex.cli': Object.freeze(['CODEX_CLI_COMMAND', 'MODEL_CODEX_CLI', 'codex.cli', 'models.codex.cli']),
  'CODEX_CLI_COMMAND': Object.freeze(['model.codex.cli', 'MODEL_CODEX_CLI', 'codex.cli', 'models.codex.cli']),
  'model.cursor.cli': Object.freeze(['CURSOR_CLI_COMMAND', 'MODEL_CURSOR_CLI', 'cursor.cli', 'models.cursor.cli']),
  'CURSOR_CLI_COMMAND': Object.freeze(['model.cursor.cli', 'MODEL_CURSOR_CLI', 'cursor.cli', 'models.cursor.cli']),
  'model.copilot.cli': Object.freeze(['COPILOT_CLI_COMMAND', 'MODEL_COPILOT_CLI', 'copilot.cli', 'models.copilot.cli']),
  'COPILOT_CLI_COMMAND': Object.freeze(['model.copilot.cli', 'MODEL_COPILOT_CLI', 'copilot.cli', 'models.copilot.cli']),
  'datasource.name': Object.freeze(['DATABASE_NAME', 'db.name', 'storage.databaseName', 'DATASOURCE_NAME']),
  'DATABASE_NAME': Object.freeze(['datasource.name', 'db.name', 'storage.databaseName', 'DATASOURCE_NAME']),
  'datasource.pool.min': Object.freeze(['DB_POOL_MIN', 'db.pool.min', 'DATASOURCE_POOL_MIN']),
  'DB_POOL_MIN': Object.freeze(['datasource.pool.min', 'db.pool.min', 'DATASOURCE_POOL_MIN']),
  'datasource.pool.max': Object.freeze(['DB_POOL_MAX', 'db.pool.max', 'DATASOURCE_POOL_MAX']),
  'DB_POOL_MAX': Object.freeze(['datasource.pool.max', 'db.pool.max', 'DATASOURCE_POOL_MAX']),
  'datasource.pool.acquireTimeoutMs': Object.freeze(['DB_POOL_ACQUIRE_TIMEOUT_MS', 'db.pool.acquireTimeoutMs', 'DATASOURCE_POOL_ACQUIRE_TIMEOUT_MS']),
  'DB_POOL_ACQUIRE_TIMEOUT_MS': Object.freeze(['datasource.pool.acquireTimeoutMs', 'db.pool.acquireTimeoutMs', 'DATASOURCE_POOL_ACQUIRE_TIMEOUT_MS']),
  'datasource.init.enabled': Object.freeze(['DB_INIT_ENABLED', 'db.init.enabled', 'DATASOURCE_INIT_ENABLED']),
  'DB_INIT_ENABLED': Object.freeze(['datasource.init.enabled', 'db.init.enabled', 'DATASOURCE_INIT_ENABLED']),
  'models.gemini.apiKey': Object.freeze(['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'model.gemini.apiKey', 'model.apiKey', 'MODEL_API_KEY']),
  'model.gemini.apiKey': Object.freeze(['models.gemini.apiKey', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'model.apiKey', 'MODEL_API_KEY']),
  'model.apiKey': Object.freeze(['models.gemini.apiKey', 'model.gemini.apiKey', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'MODEL_API_KEY']),
  'GEMINI_API_KEY': Object.freeze(['models.gemini.apiKey', 'model.gemini.apiKey', 'model.apiKey', 'GOOGLE_API_KEY', 'MODEL_API_KEY']),
  'GOOGLE_API_KEY': Object.freeze(['models.gemini.apiKey', 'model.gemini.apiKey', 'model.apiKey', 'GEMINI_API_KEY', 'MODEL_API_KEY']),
  'model.default_model': Object.freeze(['GEMINI_DEFAULT_MODEL', 'model.default', 'models.gemini.model']),
  'model.default': Object.freeze(['GEMINI_DEFAULT_MODEL', 'model.default_model', 'models.gemini.model']),
  'GEMINI_DEFAULT_MODEL': Object.freeze(['model.default_model', 'model.default', 'models.gemini.model']),
});

/**
 * Standard Environment implementation encapsulating process.env, dotenv, YAML, and CLI args.
 * Conforms to strict 4-tier precedence:
 *   Tier A: Base application.yml inside application loaded first
 *   Tier B: Environment variables (export GEMINI_CLI_COMMAND, process.env, .env)
 *   Tier C: Explicit application.yml or arguments passed during startup (--config=..., --key=value)
 *   Tier D: Profile-based application-{profile}.yml
 */
export class StandardEnvironment implements Environment {
  private readonly propertySource: Readonly<Record<string, string | undefined>>;
  private readonly activeProfiles: readonly string[];
  private readonly defaultProfiles: readonly string[] = Object.freeze(['development']);
  private readonly platform: string;

  constructor(
    customSource?: Record<string, string | undefined>,
    platform = process.platform,
    cliArgs: readonly string[] = process.argv
  ) {
    this.platform = platform;

    // --- TIER A: Base application.yml inside application loaded first ---
    const baseYamlPath = path.resolve(projectRoot, 'config/env/application.yml');
    const fallbackYamlPath = path.resolve(projectRoot, 'config/application.yml');
    const tierA = this.loadYamlProperties(fs.existsSync(baseYamlPath) ? baseYamlPath : fallbackYamlPath);

    // --- TIER B: Load all environment variables (export GEMINI_CLI_COMMAND, .env, process.env) ---
    dotenv.config();
    const localEnv = path.resolve(projectRoot, '.env');
    if (fs.existsSync(localEnv)) {
      dotenv.config({ path: localEnv });
    }
    const envVars = customSource || process.env;
    const tierB = { ...envVars };

    // --- TIER C: Explicit arguments / application.yml passed while launching application ---
    const tierC = this.parseCliArguments(cliArgs);

    // Determine active profile from layered hierarchy
    const activeEnv = (
      tierC['server.env'] ||
      tierC['APP_PROFILE'] ||
      tierB['APP_PROFILE'] ||
      tierB['NODE_ENV'] ||
      tierB['APP_ENV'] ||
      tierA['server.env'] ||
      'development'
    ).toLowerCase().trim();
    this.activeProfiles = Object.freeze([activeEnv]);

    // Load profile .env if present
    const envProfilePath = path.resolve(projectRoot, `config/env/.env.${activeEnv}`);
    if (fs.existsSync(envProfilePath)) {
      dotenv.config({ path: envProfilePath });
    }

    // --- TIER D: Profile-based application-{profile}.yml ---
    const profileYamlPath = path.resolve(projectRoot, `config/env/application-${activeEnv}.yml`);
    const tierD = this.loadYamlProperties(profileYamlPath);

    // Merge in exact order of override: Tier A < Tier B < Tier C < Tier D
    this.propertySource = Object.freeze({
      ...this.expandAliases(tierA),
      ...this.expandAliases(tierB),
      ...this.expandAliases(tierC),
      ...this.expandAliases(tierD),
    });
  }

  /**
   * Expands known aliases and relaxed naming conventions (dot <-> underscore)
   * so that higher tier keys completely override lower tier keys across all aliases.
   */
  private expandAliases(props: Record<string, string | undefined>): Record<string, string | undefined> {
    const expanded: Record<string, string | undefined> = { ...props };
    for (const [key, val] of Object.entries(props)) {
      if (val === undefined) continue;

      const aliases = PROPERTY_ALIASES[key];
      if (aliases) {
        for (const alias of aliases) {
          expanded[alias] = val;
        }
      }

      if (key.includes('_')) {
        const dotNotation = key.toLowerCase().replace(/_/g, '.');
        expanded[dotNotation] = val;
        const dotAliases = PROPERTY_ALIASES[dotNotation];
        if (dotAliases) {
          for (const alias of dotAliases) {
            expanded[alias] = val;
          }
        }
      }

      if (key.includes('.')) {
        const underscoreNotation = key.toUpperCase().replace(/\./g, '_');
        expanded[underscoreNotation] = val;
        const underscoreAliases = PROPERTY_ALIASES[underscoreNotation];
        if (underscoreAliases) {
          for (const alias of underscoreAliases) {
            expanded[alias] = val;
          }
        }
      }
    }
    return expanded;
  }

  public getActiveProfiles(): readonly string[] {
    return this.activeProfiles;
  }

  public getDefaultProfiles(): readonly string[] {
    return this.defaultProfiles;
  }

  public acceptsProfiles(...profiles: string[]): boolean {
    const current = this.activeProfiles.length > 0 ? this.activeProfiles : this.defaultProfiles;
    return profiles.some((p) => current.includes(p.toLowerCase().trim()));
  }

  public containsProperty(key: string): boolean {
    return this.resolveRawValue(key) !== undefined;
  }

  public getProperty(key: string, defaultValue?: string): any {
    const val = this.resolveRawValue(key);
    if (val !== undefined && val.trim().length > 0) {
      return val.trim();
    }
    return defaultValue;
  }

  public getPropertyAsNumber(key: string, defaultValue = 0): number {
    const val = this.resolveRawValue(key);
    if (val === undefined || val.trim().length === 0) {
      return defaultValue;
    }
    const parsed = Number(val.trim());
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  public getPropertyAsBoolean(key: string, defaultValue = false): boolean {
    const val = this.resolveRawValue(key);
    if (val === undefined || val.trim().length === 0) {
      return defaultValue;
    }
    const normalized = val.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }

  public getRequiredProperty(key: string): string {
    const val = this.resolveRawValue(key);
    if (val === undefined || val.trim().length === 0) {
      throw new Error(`[Environment] Required configuration property '${key}' is missing or blank.`);
    }
    return val.trim();
  }

  public getAllProperties(): Readonly<Record<string, string | undefined>> {
    return this.propertySource;
  }

  public getPlatform(): string {
    return this.platform;
  }

  public isWindows(): boolean {
    return this.platform === 'win32';
  }

  /**
   * Parses explicit startup CLI arguments (Tier C):
   * e.g., --config=/path/to/custom.yml or --server.port=9090 or -Dmodel.gemini.cli=gemini-custom
   */
  private parseCliArguments(args: readonly string[]): Record<string, string> {
    const explicitProps: Record<string, string> = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      // Explicit custom config file: --config=<path> or -c <path> or --config.location=<path>
      if (arg.startsWith('--config=')) {
        const filePath = arg.slice(9).trim();
        Object.assign(explicitProps, this.loadYamlProperties(filePath));
      } else if ((arg === '--config' || arg === '-c') && i + 1 < args.length) {
        const filePath = args[++i].trim();
        Object.assign(explicitProps, this.loadYamlProperties(filePath));
      } else if (arg.startsWith('--config.location=')) {
        const filePath = arg.slice(18).trim();
        Object.assign(explicitProps, this.loadYamlProperties(filePath));
      } else if (arg.startsWith('--') && arg.includes('=')) {
        // Individual command-line property: --server.port=8090
        const eqIdx = arg.indexOf('=');
        const key = arg.slice(2, eqIdx).trim();
        const value = arg.slice(eqIdx + 1).trim();
        if (key) explicitProps[key] = value;
      } else if (arg.startsWith('-D') && arg.includes('=')) {
        // JVM-style property: -Dserver.port=8090
        const eqIdx = arg.indexOf('=');
        const key = arg.slice(2, eqIdx).trim();
        const value = arg.slice(eqIdx + 1).trim();
        if (key) explicitProps[key] = value;
      }
    }

    return explicitProps;
  }

  /**
   * Parses nested YAML lines into flattened dotted property entries.
   * Conforms to YAML configuration property binding spec.
   */
  public loadYamlProperties(yamlPath: string): Record<string, string> {
    if (!fs.existsSync(yamlPath)) {
      return {};
    }
    const result: Record<string, string> = {};
    const lines = fs.readFileSync(yamlPath, 'utf-8').split(/\r?\n/);
    const stack: { indent: number; key: string }[] = [];
    const listIndexTracker = new Map<string, number>();

    for (const rawLine of lines) {
      const line = rawLine.replace(/#.*$/, '');
      if (!line.trim()) continue;

      const indent = line.search(/\S/);
      let trimmed = line.trim();

      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      let isListItem = false;
      if (trimmed.startsWith('- ')) {
        isListItem = true;
        trimmed = trimmed.slice(2).trim();
      }

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) {
        if (isListItem && stack.length > 0) {
          const parentKey = stack.map((s) => s.key).join('.');
          const currentIndex = (listIndexTracker.get(parentKey) ?? -1) + 1;
          listIndexTracker.set(parentKey, currentIndex);
          result[`${parentKey}.${currentIndex}`] = trimmed;
        }
        continue;
      }

      const keyPart = trimmed.slice(0, colonIdx).trim();
      const valPart = trimmed.slice(colonIdx + 1).trim();

      if (isListItem && stack.length > 0) {
        const parentKey = stack.map((s) => s.key).join('.');
        const currentIndex = (listIndexTracker.get(parentKey) ?? -1) + 1;
        listIndexTracker.set(parentKey, currentIndex);
        const indexKey = String(currentIndex);

        if (valPart.length === 0) {
          stack.push({ indent, key: indexKey });
          stack.push({ indent: indent + 2, key: keyPart });
        } else {
          let cleanVal = valPart;
          if (
            (cleanVal.startsWith('"') && cleanVal.endsWith('"')) ||
            (cleanVal.startsWith("'") && cleanVal.endsWith("'"))
          ) {
            cleanVal = cleanVal.slice(1, -1);
          }
          cleanVal = this.interpolatePlaceholders(cleanVal);
          result[`${parentKey}.${indexKey}.${keyPart}`] = cleanVal;
          if (currentIndex === 0) {
            result[`${parentKey}.${keyPart}`] = cleanVal;
          }
          stack.push({ indent, key: indexKey });
        }
      } else if (valPart.length === 0) {
        stack.push({ indent, key: keyPart });
      } else {
        const fullKey = [...stack.map((s) => s.key), keyPart].join('.');
        let cleanVal = valPart;
        if (
          (cleanVal.startsWith('"') && cleanVal.endsWith('"')) ||
          (cleanVal.startsWith("'") && cleanVal.endsWith("'"))
        ) {
          cleanVal = cleanVal.slice(1, -1);
        }
        cleanVal = this.interpolatePlaceholders(cleanVal);
        result[fullKey] = cleanVal;
      }
    }
    return result;
  }

  public interpolatePlaceholders(val: string): string {
    return val.replace(/\$\{([^}:]+)(?::-?([^}]*))?\}/g, (_match, varName, defaultVal) => {
      const envVal = process.env[varName];
      return envVal !== undefined && envVal.length > 0 ? envVal : (defaultVal ?? '');
    });
  }

  /**
   * Relaxed property binding resolution with bidirectional alias mapping.
   * Resolves exact key -> aliases -> relaxed casing variations.
   */
  private resolveRawValue(key: string): string | undefined {
    // 1. Direct key match
    if (this.propertySource[key] !== undefined) {
      return this.propertySource[key];
    }

    // 2. Known alias resolution (e.g. 'model.gemini.cli' <-> 'GEMINI_CLI_COMMAND', 'datasource.name' <-> 'DATABASE_NAME')
    const aliases = PROPERTY_ALIASES[key];
    if (aliases) {
      for (const alias of aliases) {
        if (this.propertySource[alias] !== undefined) {
          return this.propertySource[alias];
        }
      }
    }

    // 3. Relaxed formatting: UPPERCASE_UNDERSCORE, lowercase_underscore, lowercase-dash
    const uppercaseUnderscore = key.toUpperCase().replace(/[\.\-]/g, '_');
    if (this.propertySource[uppercaseUnderscore] !== undefined) {
      return this.propertySource[uppercaseUnderscore];
    }

    const lowercaseUnderscore = key.toLowerCase().replace(/[\.\-]/g, '_');
    if (this.propertySource[lowercaseUnderscore] !== undefined) {
      return this.propertySource[lowercaseUnderscore];
    }

    const lowercaseDash = key.toLowerCase().replace(/[\._]/g, '-');
    if (this.propertySource[lowercaseDash] !== undefined) {
      return this.propertySource[lowercaseDash];
    }

    return undefined;
  }
}

/**
 * Global singleton Environment instance.
 * Conforms to Node.js ESM process-wide single evaluation (STD-PAT-CORE-TYPESCRIPT #5).
 */
export const environment: Environment = new StandardEnvironment();
