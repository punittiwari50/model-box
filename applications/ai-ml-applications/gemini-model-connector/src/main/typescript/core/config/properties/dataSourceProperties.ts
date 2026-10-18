import type { Environment } from '@/core/config/environment.js';

/**
 * Strongly-typed configuration properties for datasources.
 * Conforms to Directive #1: use datasource instead of db in property name.
 * Encapsulates connection pooling, schema evolution, and persistent storage parameters.
 */
export class DataSourceProperties {
  public readonly poolMin: number;
  public readonly poolMax: number;
  public readonly poolAcquireTimeoutMs: number;
  public readonly initEnabled: boolean;
  public readonly databaseName: string;
  public readonly dataDir: string;
  public readonly url: string;
  public readonly driverClassName: string;

  constructor(env: Environment, defaultDataDir: string) {
    // Sourced via datasource.* with relaxed backward compatibility to db.*
    this.poolMin = env.getPropertyAsNumber(
      'datasource.pool.min',
      env.getPropertyAsNumber('db.pool.min', env.getPropertyAsNumber('DB_POOL_MIN', 1))
    );
    this.poolMax = env.getPropertyAsNumber(
      'datasource.pool.max',
      env.getPropertyAsNumber('db.pool.max', env.getPropertyAsNumber('DB_POOL_MAX', 5))
    );
    this.poolAcquireTimeoutMs = env.getPropertyAsNumber(
      'datasource.pool.acquireTimeoutMs',
      env.getPropertyAsNumber(
        'db.pool.acquireTimeoutMs',
        env.getPropertyAsNumber('DB_POOL_ACQUIRE_TIMEOUT_MS', 5000)
      )
    );
    this.initEnabled = env.getPropertyAsBoolean(
      'datasource.init.enabled',
      env.getPropertyAsBoolean('db.init.enabled', env.getPropertyAsBoolean('DB_INIT_ENABLED', false))
    );
    this.databaseName = env.getProperty(
      'datasource.name',
      env.getProperty('db.name', env.getProperty('DATABASE_NAME', 'model_connector.db'))
    );
    this.dataDir = env.getProperty(
      'datasource.dataDir',
      env.getProperty('data.dir', env.getProperty('DATA_DIR', defaultDataDir))
    );
    this.url = env.getProperty(
      'datasource.url',
      env.getProperty('db.url', `sqlite:${defaultDataDir}/${this.databaseName}`)
    );
    this.driverClassName = env.getProperty(
      'datasource.driver-class-name',
      env.getProperty('datasource.driverClassName', 'org.sqlite.JDBC')
    );
  }

  /**
   * Identifies whether the configured datasource is an in-memory RDBMS instance.
   */
  public isInMemory(): boolean {
    return this.url.includes(':memory:') || this.databaseName === ':memory:';
  }

  /**
   * Identifies whether the datasource is an embedded local file/memory database (e.g., SQLite, local H2).
   */
  public isEmbedded(): boolean {
    return (
      this.isInMemory() ||
      this.driverClassName.toLowerCase().includes('sqlite') ||
      this.url.toLowerCase().startsWith('sqlite:') ||
      this.url.toLowerCase().startsWith('jdbc:sqlite:')
    );
  }

  /**
   * Identifies whether the datasource connects to an external RDBMS server requiring a connection string rather than file storage.
   */
  public isExternalRdbms(): boolean {
    return !this.isEmbedded();
  }

  /**
   * Resolves the canonical connection string for the datasource.
   */
  public getConnectionString(): string {
    return this.url;
  }
}

/**
 * Backward compatibility alias for DataSourceProperties.
 */
export const DatabaseProperties = DataSourceProperties;
export type DatabaseProperties = DataSourceProperties;
