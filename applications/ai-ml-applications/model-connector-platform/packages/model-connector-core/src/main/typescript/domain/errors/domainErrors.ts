/**
 * Enterprise Domain Exceptions & Sanitization Governance.
 * Conforms to Directive #6: Zero SQL leaks, zero code snippet exposure to end-users.
 */

export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string = "DOMAIN_ERROR",
    public readonly correlationId?: string
  ) {
    super(DomainException.sanitizeMessage(message));
    this.name = "DomainException";
  }

  /**
   * Sanitizes error messages by purging SQL fragments, stack paths, and code snippets.
   */
  public static sanitizeMessage(raw: string): string {
    if (!raw) return "An unexpected domain error occurred.";

    let sanitized = raw;

    // Purge SQL keywords & statements
    sanitized = sanitized.replace(
      /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TABLE|FROM|WHERE|JOIN|UNION|HAVING|ORDER BY|GROUP BY)\b[\s\S]*?(;|$)/gi,
      "[SQL execution redacted for security]"
    );

    // Purge file paths and stack frames
    sanitized = sanitized.replace(/[A-Za-z]:\\[^\s\n]+/g, "[internal path redacted]");
    sanitized = sanitized.replace(/\/[a-zA-Z0-9_\-\.\/]+/g, "[internal path redacted]");

    // Purge tokens / api keys patterns
    sanitized = sanitized.replace(/(AIza[0-9A-Za-z_\-]{35}|sk-[a-zA-Z0-9]{32,}|ghu_[a-zA-Z0-9]{36})/g, "******");

    return sanitized;
  }
}

export class ModelNotFoundException extends DomainException {
  constructor(modelId: string, correlationId?: string) {
    super(`Model with identifier '${modelId}' was not found in active catalog.`, "MODEL_NOT_FOUND", correlationId);
    this.name = "ModelNotFoundException";
  }
}

export class StrategyNotSupportedException extends DomainException {
  constructor(strategy: string, modelId: string, correlationId?: string) {
    super(`Strategy '${strategy}' is not supported for model '${modelId}'.`, "STRATEGY_NOT_SUPPORTED", correlationId);
    this.name = "StrategyNotSupportedException";
  }
}

export class SecurityValidationException extends DomainException {
  constructor(detail: string, correlationId?: string) {
    super(`Security policy violation: ${detail}`, "SECURITY_VIOLATION", correlationId);
    this.name = "SecurityValidationException";
  }
}
