import type { Environment } from "@/core/config/environment.js";

export interface IRestClientConfig {
  readonly connectTimeoutMs: number;
  readonly readTimeoutMs: number;
  readonly maxRetries: number;
  readonly retryBackoffMs: number;
  readonly maxIdleConnections: number;
  readonly keepAliveTimeoutMs: number;
  readonly enableHttp2: boolean;
}

export class RestClientConfig implements IRestClientConfig {
  public readonly connectTimeoutMs: number;
  public readonly readTimeoutMs: number;
  public readonly maxRetries: number;
  public readonly retryBackoffMs: number;
  public readonly maxIdleConnections: number;
  public readonly keepAliveTimeoutMs: number;
  public readonly enableHttp2: boolean;

  constructor(env: Environment) {
    this.connectTimeoutMs = env.getPropertyAsNumber(
      "rest.client.connectTimeoutMs",
      5000,
    );
    this.readTimeoutMs = env.getPropertyAsNumber(
      "rest.client.readTimeoutMs",
      30000,
    );
    this.maxRetries = env.getPropertyAsNumber("rest.client.maxRetries", 3);
    this.retryBackoffMs = env.getPropertyAsNumber(
      "rest.client.retryBackoffMs",
      500,
    );
    this.maxIdleConnections = env.getPropertyAsNumber(
      "rest.client.maxIdleConnections",
      50,
    );
    this.keepAliveTimeoutMs = env.getPropertyAsNumber(
      "rest.client.keepAliveTimeoutMs",
      60000,
    );
    this.enableHttp2 = env.getPropertyAsBoolean(
      "rest.client.enableHttp2",
      true,
    );
  }
}
