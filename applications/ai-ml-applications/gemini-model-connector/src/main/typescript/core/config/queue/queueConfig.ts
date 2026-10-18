import type { Environment } from "@/core/config/environment.js";

export interface IQueueConfig {
  readonly enabled: boolean;
  readonly type: "in-memory" | "kafka" | "rabbitmq";
  readonly concurrency: number;
  readonly maxQueueSize: number;
  readonly deadLetterExchange: string;
  readonly retryDelayMs: number;
  readonly maxRetries: number;
}

export class QueueConfig implements IQueueConfig {
  public readonly enabled: boolean;
  public readonly type: "in-memory" | "kafka" | "rabbitmq";
  public readonly concurrency: number;
  public readonly maxQueueSize: number;
  public readonly deadLetterExchange: string;
  public readonly retryDelayMs: number;
  public readonly maxRetries: number;

  constructor(env: Environment) {
    this.enabled = env.getPropertyAsBoolean("queue.enabled", true);
    const rawType = env.getProperty("queue.type", "in-memory");
    this.type = ["in-memory", "kafka", "rabbitmq"].includes(rawType)
      ? (rawType as any)
      : "in-memory";
    this.concurrency = env.getPropertyAsNumber("queue.concurrency", 10);
    this.maxQueueSize = env.getPropertyAsNumber("queue.maxSize", 5000);
    this.deadLetterExchange = env.getProperty(
      "queue.dlx",
      "model_connector_dlx",
    );
    this.retryDelayMs = env.getPropertyAsNumber("queue.retryDelayMs", 1000);
    this.maxRetries = env.getPropertyAsNumber("queue.maxRetries", 3);
  }
}
