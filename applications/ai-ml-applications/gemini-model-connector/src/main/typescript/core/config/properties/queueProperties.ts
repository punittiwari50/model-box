import type { Environment } from '@/core/config/environment.js';

/**
 * Strongly-typed configuration properties for task queuing.
 * Encapsulates in-memory task queues, deduplication windows, and partitioning keys.
 */
export class QueueProperties {
  public readonly maxCapacity: number;
  public readonly ttlMs: number;
  public readonly partitionKeyPattern: string;

  constructor(env: Environment) {
    this.maxCapacity = env.getPropertyAsNumber('queue.maxCapacity', 1000);
    this.ttlMs = env.getPropertyAsNumber('queue.ttlMs', 300000);
    this.partitionKeyPattern = env.getProperty('queue.partitionKeyPattern', 'user:{userId}:{model}:{promptHash}');
  }
}
