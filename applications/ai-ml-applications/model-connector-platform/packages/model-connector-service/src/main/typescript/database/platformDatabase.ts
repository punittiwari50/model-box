import {
  coreDatabaseManager,
  type DatabaseSync,
  environment,
} from "@model-box/model-connector-core";
import {
  postgresConnectionManager,
  type PostgresConnectionManager,
  type PostgresConnectionStatus,
} from "@/database/PostgresConnectionManager";

export interface DataSourceMetadata {
  readonly defaultType: string;
  readonly fallbackType: string;
  readonly configuredType: string;
  readonly isPostgresConnected: boolean;
  readonly postgresDetails: PostgresConnectionStatus;
}

/**
 * Universal Database Manager for model-connector-service.
 * Maintains H2/SQLite embedded mode as default & fallback while managing PostgreSQL connectivity.
 * Conforms to STD-COD-005, STD-COD-007, and STD-COD-010.
 */
export class PlatformDatabase {
  private static instance: PlatformDatabase | null = null;

  public static getInstance(): PlatformDatabase {
    if (!PlatformDatabase.instance) {
      PlatformDatabase.instance = new PlatformDatabase();
    }
    return PlatformDatabase.instance;
  }

  public getDatabase(): DatabaseSync {
    return coreDatabaseManager.getDatabase();
  }

  public getPostgresManager(): PostgresConnectionManager {
    return postgresConnectionManager;
  }

  public async getDataSourceMetadata(): Promise<DataSourceMetadata> {
    const defaultType = environment.getProperty("datasource.default", "h2");
    const fallbackType = environment.getProperty("datasource.fallback", "h2");
    const configuredType = environment.getProperty("datasource.type", defaultType);
    const pgStatus = await postgresConnectionManager.testConnection();

    return {
      defaultType,
      fallbackType,
      configuredType,
      isPostgresConnected: pgStatus.connected,
      postgresDetails: pgStatus,
    };
  }
}

export const platformDatabase = PlatformDatabase.getInstance();
