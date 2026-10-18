import type { Environment } from "@/core/config/environment.js";

/**
 * Strongly-typed configuration properties for security and validation.
 * Encapsulates anti-PII rules, authentication toggles, rate limiting, and artifact sanitization.
 */
export class SecurityProperties {
  public readonly forbiddenQueryKeys: readonly string[];
  public readonly maxFileSizeBytes: number;
  public readonly tokenAuthEnabled: boolean;
  public readonly rateLimitEnabled: boolean;

  constructor(env: Environment) {
    this.forbiddenQueryKeys = Object.freeze([
      "api_key",
      "apiKey",
      "token",
      "access_token",
      "secret",
      "password",
      "client_secret",
    ]);
    this.maxFileSizeBytes = env.getPropertyAsNumber(
      "security.maxFileSizeBytes",
      5 * 1024 * 1024,
    );
    this.tokenAuthEnabled = env.getPropertyAsBoolean(
      "security.tokenAuthEnabled",
      true,
    );
    this.rateLimitEnabled = env.getPropertyAsBoolean(
      "security.rateLimitEnabled",
      true,
    );
  }
}
