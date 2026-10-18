import type { Environment } from '@/core/config/environment.js';

/**
 * Strongly-typed configuration properties for REST clients.
 * Encapsulates HTTP connection pooling, client timeouts, retry rules, and default headers.
 */
export class RestClientProperties {
  public readonly connectTimeoutMs: number;
  public readonly readTimeoutMs: number;
  public readonly maxIdleConnections: number;
  public readonly maxRetries: number;
  public readonly defaultHeaders: Readonly<Record<string, string>>;

  constructor(env: Environment) {
    this.connectTimeoutMs = env.getPropertyAsNumber('restclient.connectTimeoutMs', 5000);
    this.readTimeoutMs = env.getPropertyAsNumber('restclient.readTimeoutMs', 30000);
    this.maxIdleConnections = env.getPropertyAsNumber('restclient.maxIdleConnections', 50);
    this.maxRetries = env.getPropertyAsNumber('restclient.maxRetries', 3);
    this.defaultHeaders = Object.freeze({
      'user-agent': 'ModelBox-RestClient/1.0.0 (Enterprise Resilient Connector)',
      accept: 'application/json',
    });
  }
}
