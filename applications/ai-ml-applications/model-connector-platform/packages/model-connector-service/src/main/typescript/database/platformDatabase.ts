import {
  coreDatabaseManager,
  type DatabaseSync,
} from "@model-box/model-connector-core";

/**
 * Universal SQLite database connection manager for model-connector-service
 * backed by centralized @model-box/model-connector-core database engine (Req 5).
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
}

export const platformDatabase = PlatformDatabase.getInstance();
