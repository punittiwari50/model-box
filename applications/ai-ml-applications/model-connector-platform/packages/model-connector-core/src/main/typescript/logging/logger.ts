import { ProcessUtils } from "@/utils/process/processUtils.js";
import { CryptoUtils } from "@/utils/crypto/cryptoUtils.js";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly correlationId: string;
  readonly serviceName?: string;
}

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly serviceName: string;
  readonly environment: string;
  readonly message: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly correlationId?: string;
  readonly durationMs?: number;
  readonly httpMethod?: string;
  readonly httpPath?: string;
  readonly statusCode?: number;
  readonly clientIp?: string;
  readonly meta?: Record<string, unknown>;
  readonly error?: string;
}

export interface ILogger {
  trace(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, err?: unknown, meta?: Record<string, unknown>): void;
  withCorrelationId(correlationId: string): ILogger;
  withTracing(context: TraceContext): ILogger;
  child(meta: Record<string, unknown>): ILogger;
}

/**
 * Enterprise Distributed Tracing & Correlation Logger.
 * Conforms to:
 * - W3C TraceContext (traceparent) and OpenTelemetry specs
 * - Distributed microservice correlation and structured JSON output
 * - Zero direct process.env usage (encapsulated via ProcessUtils)
 */
export class CoreLogger implements ILogger {
  private static readonly LEVEL_VALUES: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
  };

  private static readonly SENSITIVE_KEY_PATTERNS: readonly RegExp[] = Object.freeze([
    /password/i,
    /secret/i,
    /token/i,
    /credential/i,
    /authorization/i,
    /api[_-]?key/i,
    /cookie/i,
    /private[_-]?key/i,
    /access[_-]?key/i,
    /client[_-]?secret/i,
    /auth[_-]?code/i,
  ]);

  private static readonly TOKEN_PATTERNS: readonly [RegExp, string][] = Object.freeze([
    [/ya29\.[a-zA-Z0-9_\-\.]{10,}/g, "ya29...[REDACTED]"],
    [/sk-[a-zA-Z0-9_\-]{15,}/g, "sk-...[REDACTED]"],
    [/gh[pousr]_[a-zA-Z0-9]{15,}/g, "gh_...[REDACTED]"],
    [/eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g, "eyJ...[REDACTED]"],
    [/(?:client_secret|clientSecret|secret|token)=([a-zA-Z0-9_\-]{8,})/gi, "[REDACTED]"],
    [/Bearer\s+[a-zA-Z0-9_\-\.]{15,}/gi, "Bearer [REDACTED]"],
  ]);

  public static sanitizeString(raw: string): string {
    if (!raw) return raw;
    let sanitized = raw;
    for (const [regex, replacement] of CoreLogger.TOKEN_PATTERNS) {
      sanitized = sanitized.replace(regex, replacement);
    }
    return sanitized;
  }

  public static sanitizeMeta(obj: unknown, depth = 0): unknown {
    if (depth > 5 || obj === null || obj === undefined) return obj;
    if (typeof obj === "string") return CoreLogger.sanitizeString(obj);
    if (typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => CoreLogger.sanitizeMeta(item, depth + 1));
    }

    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (CoreLogger.isSensitiveKey(key)) {
        sanitizedObj[key] = CoreLogger.maskSensitiveValue(value);
      } else {
        sanitizedObj[key] = CoreLogger.sanitizeMeta(value, depth + 1);
      }
    }
    return sanitizedObj;
  }

  private static isSensitiveKey(key: string): boolean {
    return CoreLogger.SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
  }

  private static maskSensitiveValue(value: unknown): unknown {
    if (typeof value === "string") {
      if (value.length > 8) {
        return `${value.slice(0, 4)}...[REDACTED]`;
      }
      return "[REDACTED]";
    }
    return "[REDACTED]";
  }

  private readonly serviceName: string;
  private readonly environment: string;

  constructor(
    private readonly minLevel: LogLevel = "info",
    private readonly traceContext?: Partial<TraceContext>,
    private readonly persistentMeta?: Record<string, unknown>
  ) {
    this.serviceName = ProcessUtils.getEnv("SERVICE_NAME", "model-connector-platform");
    this.environment = ProcessUtils.getEnv("NODE_ENV", "development");
  }

  public trace(message: string, meta?: Record<string, unknown>): void {
    this.log("trace", message, undefined, meta);
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, undefined, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, undefined, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, undefined, meta);
  }

  public error(message: string, err?: unknown, meta?: Record<string, unknown>): void {
    const errorStr =
      err instanceof Error ? (err.stack ?? err.message) : err ? String(err) : undefined;
    this.log("error", message, errorStr, meta);
  }

  public withCorrelationId(correlationId: string): ILogger {
    return new CoreLogger(
      this.minLevel,
      { ...this.traceContext, correlationId },
      this.persistentMeta
    );
  }

  public withTracing(context: TraceContext): ILogger {
    return new CoreLogger(this.minLevel, context, this.persistentMeta);
  }

  public child(meta: Record<string, unknown>): ILogger {
    return new CoreLogger(this.minLevel, this.traceContext, {
      ...this.persistentMeta,
      ...meta,
    });
  }

  private log(
    level: LogLevel,
    message: string,
    error?: string,
    meta?: Record<string, unknown>
  ): void {
    if (CoreLogger.LEVEL_VALUES[level] < CoreLogger.LEVEL_VALUES[this.minLevel]) {
      return;
    }

    const mergedMeta = { ...this.persistentMeta, ...meta };
    const sanitizedMessage = CoreLogger.sanitizeString(message);
    const sanitizedError = error ? CoreLogger.sanitizeString(error) : undefined;
    const sanitizedMeta = (CoreLogger.sanitizeMeta(mergedMeta) as Record<string, unknown>) || {};

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      serviceName: this.serviceName,
      environment: this.environment,
      message: sanitizedMessage,
      ...(this.traceContext?.traceId ? { traceId: this.traceContext.traceId } : {}),
      ...(this.traceContext?.spanId ? { spanId: this.traceContext.spanId } : {}),
      ...(this.traceContext?.parentSpanId ? { parentSpanId: this.traceContext.parentSpanId } : {}),
      ...(this.traceContext?.correlationId
        ? { correlationId: this.traceContext.correlationId }
        : {}),
      ...(sanitizedError ? { error: sanitizedError } : {}),
      ...(Object.keys(sanitizedMeta).length > 0 ? { meta: sanitizedMeta } : {}),
    };

    const formatted = JSON.stringify(entry);
    if (level === "error") {
      console.error(formatted);
    } else if (level === "warn") {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Generates or extracts W3C-compliant TraceContext for distributed microservices.
   */
  public static createTraceContext(
    headers?: Record<string, string | string[] | undefined>
  ): TraceContext {
    const correlationId =
      (headers?.["x-correlation-id"] as string) ??
      (headers?.["x-request-id"] as string) ??
      CryptoUtils.generateUuid();

    const traceparent = (headers?.["traceparent"] as string) ?? "";
    let traceId = (headers?.["x-trace-id"] as string) ?? "";
    let parentSpanId: string | undefined = undefined;

    // W3C traceparent format: 00-{traceId}-{parentSpanId}-{traceFlags}
    if (traceparent.startsWith("00-") && traceparent.split("-").length >= 4) {
      const parts = traceparent.split("-");
      traceId = parts[1] || "";
      parentSpanId = parts[2] || undefined;
    }

    if (!traceId || traceId.length !== 32) {
      traceId = CryptoUtils.randomBytes(16).toString("hex");
    }

    const spanId = CryptoUtils.randomBytes(8).toString("hex");

    return {
      traceId,
      spanId,
      parentSpanId,
      correlationId,
      serviceName: ProcessUtils.getEnv("SERVICE_NAME", "model-connector-platform"),
    };
  }
}

export const logger: ILogger = new CoreLogger(
  (ProcessUtils.getEnv("LOG_LEVEL", "info") as LogLevel) ?? "info"
);
