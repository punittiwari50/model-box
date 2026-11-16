import type { Environment } from "@/config/environment.js";

export interface ISecurityConfig {
  readonly enabled: boolean;
  readonly defaultApiKeyHeader: string;
  readonly corsOrigins: readonly string[];
  readonly enableRateLimit: boolean;
  readonly rateLimitRps: number;
}

export class SecurityConfig implements ISecurityConfig {
  public readonly enabled: boolean;
  public readonly defaultApiKeyHeader: string;
  public readonly corsOrigins: readonly string[];
  public readonly enableRateLimit: boolean;
  public readonly rateLimitRps: number;

  constructor(env: Environment) {
    this.enabled = env.getPropertyAsBoolean("security.enabled", true);
    this.defaultApiKeyHeader = env.getProperty("security.apiKeyHeader", "x-goog-api-key");
    const rawOrigins = env.getProperty("security.corsOrigins", "*");
    this.corsOrigins = Object.freeze(rawOrigins.split(",").map((o) => o.trim()).filter(Boolean));
    this.enableRateLimit = env.getPropertyAsBoolean("security.enableRateLimit", true);
    this.rateLimitRps = env.getPropertyAsNumber("security.rateLimitRps", 100);
  }
}
