import type { Environment } from "@/core/config/environment.js";

/**
 * Strongly-typed configuration properties for transaction management.
 * Encapsulates transactional timeouts, retry policies, rollback exceptions, and boundary isolation.
 */
export class TransactionProperties {
  public readonly defaultTimeoutMs: number;
  public readonly maxRetryAttempts: number;
  public readonly retryBackoffMs: number;
  public readonly rollbackFor: readonly (new (...args: any[]) => Error)[];
  public readonly noRollbackFor: readonly (new (...args: any[]) => Error)[];

  constructor(env: Environment) {
    this.defaultTimeoutMs = env.getPropertyAsNumber(
      "transaction.defaultTimeoutMs",
      10000,
    );
    this.maxRetryAttempts = env.getPropertyAsNumber(
      "transaction.maxRetryAttempts",
      3,
    );
    this.retryBackoffMs = env.getPropertyAsNumber(
      "transaction.retryBackoffMs",
      100,
    );
    this.rollbackFor = Object.freeze([Error]);
    this.noRollbackFor = Object.freeze([]);
  }
}
