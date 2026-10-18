/**
 * Enterprise Structured Logger with Sensitive Data Sanitization & Distributed Tracing.
 * Conforms to:
 * - Directive #8: Standard info, warn, error, debug logging levels across runtime ecosystems
 * - Directive #9: Sensitive information sanitization, masking, and incident debugging excellence
 * - STD-COD-002: Centralized Observability & Logging
 */

import { Request, Response, NextFunction } from "express";
import { environment } from "@/core/config/environment.js";
import { getCurrentTraceContext } from "@/core/observability/tracing/traceContext.js";
import { HttpHeader, NetworkConstant } from "@/domain/constants/index.js";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apiKey/i,
  /api_key/i,
  /authorization/i,
  /codeVerifier/i,
  /code_verifier/i,
  /credentials/i,
  /privateKey/i,
  /private_key/i,
  /email/i,
  /account_email/i,
  /user_email/i,
  /phone/i,
  /mobile/i,
  /ssn/i,
  /username/i,
  /firstName/i,
  /lastName/i,
  /first_name/i,
  /last_name/i,
];

const BEARER_REGEX = /Bearer\s+([a-zA-Z0-9_\-\.]+)/gi;
const API_KEY_QUERY_REGEX = /(?:key|api_key|token)=([a-zA-Z0-9_\-]{8,})/gi;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

/**
 * Sanitizes URLs to mask any PII or sensitive query parameters before logging.
 */
export function maskSensitiveUrl(rawUrl: string): string {
  if (!rawUrl || !rawUrl.includes("?")) return rawUrl;
  try {
    const [path, queryString] = rawUrl.split("?");
    const params = new URLSearchParams(queryString);
    for (const key of Array.from(params.keys())) {
      const lower = key.toLowerCase();
      if (
        SENSITIVE_KEY_PATTERNS.some((p) => p.test(lower)) ||
        lower.includes("email") ||
        lower.includes("token") ||
        lower.includes("key") ||
        lower.includes("secret")
      ) {
        params.set(key, "[REDACTED]");
      }
    }
    return `${path}?${params.toString()}`;
  } catch {
    return rawUrl.replace(EMAIL_REGEX, "[REDACTED_EMAIL]");
  }
}

export function maskSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value
      .replace(BEARER_REGEX, "Bearer [REDACTED]")
      .replace(API_KEY_QUERY_REGEX, "key=[REDACTED]")
      .replace(EMAIL_REGEX, "[REDACTED_EMAIL]");
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveData(item, depth + 1));
  }

  if (typeof value === "object") {
    const maskedObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) =>
        pattern.test(k),
      );
      if (isSensitiveKey) {
        maskedObj[k] = "[REDACTED]";
      } else {
        maskedObj[k] = maskSensitiveData(v, depth + 1);
      }
    }
    return maskedObj;
  }

  return value;
}

export class Logger {
  private formatMessage(
    level: LogLevel,
    component: string,
    message: string,
    details?: unknown,
  ): string {
    const timestamp = new Date().toISOString();
    const traceCtx = getCurrentTraceContext();
    const traceMeta = traceCtx
      ? ` [traceId:${traceCtx.traceId} spanId:${traceCtx.spanId} corrId:${traceCtx.correlationId}]`
      : "";

    let detailsStr = "";
    if (details !== undefined && details !== null) {
      const sanitized = maskSensitiveData(details);
      detailsStr = ` | ${typeof sanitized === "object" ? JSON.stringify(sanitized) : sanitized}`;
    }

    const sanitizedMsg =
      typeof message === "string"
        ? message
            .replace(BEARER_REGEX, "Bearer [REDACTED]")
            .replace(API_KEY_QUERY_REGEX, "key=[REDACTED]")
        : message;

    return `${timestamp} [${level}] [${component}]${traceMeta} ${sanitizedMsg}${detailsStr}`;
  }

  private resolveArgs(
    arg1: string,
    arg2?: unknown,
    arg3?: unknown,
  ): { component: string; message: string; details?: unknown } {
    if (typeof arg2 === "string") {
      return { component: arg1, message: arg2, details: arg3 };
    }
    return { component: "APP", message: arg1, details: arg2 };
  }

  public debug(
    componentOrMessage: string,
    messageOrDetails?: unknown,
    details?: unknown,
  ): void {
    if (
      environment.getPropertyAsBoolean("DEBUG") ||
      environment.acceptsProfiles("development")
    ) {
      const {
        component,
        message,
        details: det,
      } = this.resolveArgs(componentOrMessage, messageOrDetails, details);
      console.debug(this.formatMessage("DEBUG", component, message, det));
    }
  }

  public info(
    componentOrMessage: string,
    messageOrDetails?: unknown,
    details?: unknown,
  ): void {
    const {
      component,
      message,
      details: det,
    } = this.resolveArgs(componentOrMessage, messageOrDetails, details);
    console.log(this.formatMessage("INFO", component, message, det));
  }

  public warn(
    componentOrMessage: string,
    messageOrDetails?: unknown,
    details?: unknown,
  ): void {
    const {
      component,
      message,
      details: det,
    } = this.resolveArgs(componentOrMessage, messageOrDetails, details);
    console.warn(this.formatMessage("WARN", component, message, det));
  }

  public error(
    componentOrMessage: string,
    messageOrDetails?: unknown,
    details?: unknown,
  ): void {
    const {
      component,
      message,
      details: det,
    } = this.resolveArgs(componentOrMessage, messageOrDetails, details);
    console.error(this.formatMessage("ERROR", component, message, det));
  }

  // Domain-specific helpers with data masking
  public http(message: string, details?: unknown): void {
    this.info("HTTP", message, details);
  }

  public cli(message: string, details?: unknown, tag = "MODEL_CLI"): void {
    this.info(tag, message, details);
  }

  public api(message: string, details?: unknown, tag = "MODEL_API"): void {
    this.info(tag, message, details);
  }

  public datasource(message: string, details?: unknown): void {
    this.info("DATASOURCE", message, details);
  }

  public db(message: string, details?: unknown): void {
    this.datasource(message, details);
  }

  public audit(message: string, details?: unknown): void {
    this.info("AUDIT", message, details);
  }

  public job(message: string, details?: unknown): void {
    this.info("JOB_AGENT", message, details);
  }

  /**
   * Express middleware that logs every incoming request and completed response to Docker logs.
   */
  public requestLoggerMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const startTime = performance.now();
      const clientIp =
        (req.headers[HttpHeader.X_FORWARDED_FOR] as string)?.split(",")[0] ||
        req.socket.remoteAddress ||
        NetworkConstant.LOOPBACK_IP;

      const safeQuery = maskSensitiveData(req.query);
      const safeUrl = maskSensitiveUrl(req.originalUrl || req.url);
      this.http(`--> INCOMING ${req.method} ${safeUrl}`, {
        ip: clientIp,
        query: Object.keys(req.query || {}).length > 0 ? safeQuery : undefined,
      });

      res.on("finish", () => {
        const durationMs =
          Math.round((performance.now() - startTime) * 100) / 100;
        const status = res.statusCode;
        const level: LogLevel =
          status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";
        const tier = (res.locals as any)?.tier;
        const model = (res.locals as any)?.model;

        console.log(
          this.formatMessage(
            level,
            "HTTP",
            `<-- COMPLETED ${req.method} ${safeUrl} ${status} (${durationMs}ms)${tier ? ` [tier: ${tier}]` : ""}`,
            {
              ip: clientIp,
              statusCode: status,
              latency_ms: durationMs,
              ...(model ? { model } : {}),
              ...(tier ? { tier } : {}),
            },
          ),
        );
      });

      next();
    };
  }
}

export const logger = new Logger();
