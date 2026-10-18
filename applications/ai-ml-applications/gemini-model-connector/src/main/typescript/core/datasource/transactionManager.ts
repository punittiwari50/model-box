import type { IDataSourceDriver } from '@/core/datasource/driver.js';
import { logger } from '@/core/observability/logging/logger.js';

export interface TransactionOptions {
  readonly rollbackFor?: readonly (new (...args: any[]) => Error)[];
  readonly noRollbackFor?: readonly (new (...args: any[]) => Error)[];
}

export interface ITransactionManager {
  runInTransaction<T>(
    action: (driver: IDataSourceDriver) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T>;
}

export class DataSourceTransactionManager implements ITransactionManager {
  constructor(private readonly getDriverFn: () => Promise<IDataSourceDriver>) {}

  public async runInTransaction<T>(
    action: (driver: IDataSourceDriver) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const driver = await this.getDriverFn();
    await driver.run('BEGIN TRANSACTION;');

    try {
      const result = await action(driver);
      await driver.run('COMMIT;');
      return result;
    } catch (err: any) {
      const shouldNoRollback =
        options.noRollbackFor &&
        options.noRollbackFor.some((cls) => err instanceof cls);

      if (shouldNoRollback) {
        logger.warn(
          'TRANSACTION',
          `Exception ${err.constructor?.name} matches noRollbackFor rule. Committing transaction despite error.`
        );
        try {
          await driver.run('COMMIT;');
        } catch (commitErr: any) {
          logger.error('TRANSACTION', `Commit error during noRollback: ${commitErr.message}`);
        }
        throw err;
      }

      logger.error('TRANSACTION', `Transaction failed: ${err.message}. Executing ROLLBACK.`);
      try {
        await driver.run('ROLLBACK;');
      } catch (rollbackErr: any) {
        logger.warn('TRANSACTION', `Rollback error: ${rollbackErr.message}`);
      }
      throw err;
    }
  }
}

let defaultDriverProvider: (() => Promise<IDataSourceDriver>) | null = null;

export function setDefaultDriverProvider(provider: () => Promise<IDataSourceDriver>): void {
  defaultDriverProvider = provider;
}

export const dataSourceTransactionManager: ITransactionManager = new DataSourceTransactionManager(async () => {
  if (defaultDriverProvider) {
    return defaultDriverProvider();
  }
  const { dataSourceManager } = await import('@/core/datasource/dataSourceManager.js');
  return dataSourceManager.getDriver();
});

// Backward compatibility aliases
export const transactionManager = dataSourceTransactionManager;
export class SqliteTransactionManager extends DataSourceTransactionManager {}
