import type { Request, Response } from "express";
import {
  getCurrentTraceContext,
  getTraceId,
  getSpanId,
  getCorrelationId,
} from "@/core/observability/tracing/traceContext.js";
import { HttpHeader, NetworkConstant } from "@/domain/constants/index.js";

export interface TraceableResponse {
  readonly trace_id?: string;
  readonly span_id?: string;
  readonly correlation_id?: string;
}

export interface IHttpResponseFormatter {
  getClientIp(req: Request): string;
  getRouteParam(param: string | string[] | undefined): string;
  getQueryParam(param: unknown): string;
  sendJson<T extends Record<string, any>>(
    res: Response,
    statusCode: number,
    data: T,
  ): void;
  sendError(
    res: Response,
    statusCode: number,
    message: string,
    extra?: Record<string, any>,
  ): void;
}

/**
 * OOP HTTP Response Formatter Service.
 * Enriches outgoing JSON responses with distributed tracing headers and payload IDs (STD-COD-005).
 */
export class HttpResponseFormatter implements IHttpResponseFormatter {
  public getClientIp(req: Request): string {
    const forwarded = req.headers[HttpHeader.X_FORWARDED_FOR];
    if (typeof forwarded === "string") {
      return forwarded.split(",")[0].trim();
    }
    return req.socket.remoteAddress || NetworkConstant.LOOPBACK_IP;
  }

  public getRouteParam(param: string | string[] | undefined): string {
    if (Array.isArray(param)) {
      return param[0] || "";
    }
    return param || "";
  }

  public getQueryParam(param: unknown): string {
    if (Array.isArray(param)) {
      return String(param[0] || "");
    }
    return typeof param === "string" ? param : "";
  }

  public sendJson<T extends Record<string, any>>(
    res: Response,
    statusCode: number,
    data: T,
  ): void {
    const currentContext = getCurrentTraceContext();
    const traceId = currentContext?.traceId || getTraceId();
    const spanId = currentContext?.spanId || getSpanId();
    const correlationId = currentContext?.correlationId || getCorrelationId();

    res.setHeader(HttpHeader.TRACE_ID, traceId);
    res.setHeader(HttpHeader.SPAN_ID, spanId);
    res.setHeader(HttpHeader.CORRELATION_ID, correlationId);

    const payload = {
      ...data,
      trace_id: traceId,
      span_id: spanId,
      correlation_id: correlationId,
    };

    res.status(statusCode).json(payload);
  }

  public sendError(
    res: Response,
    statusCode: number,
    message: string,
    extra: Record<string, any> = {},
  ): void {
    const currentContext = getCurrentTraceContext();
    const traceId = currentContext?.traceId || getTraceId();
    const spanId = currentContext?.spanId || getSpanId();
    const correlationId = currentContext?.correlationId || getCorrelationId();

    res.setHeader(HttpHeader.TRACE_ID, traceId);
    res.setHeader(HttpHeader.SPAN_ID, spanId);
    res.setHeader(HttpHeader.CORRELATION_ID, correlationId);

    // Sanitize error message (Requirement #8: zero sensitive/SQL leak)
    let sanitized = message;
    if (
      statusCode >= 500 &&
      /SELECT|INSERT|UPDATE|DELETE|SQLITE_|SYNTAX ERROR|TABLE|COLUMN/i.test(
        sanitized,
      )
    ) {
      sanitized =
        "An internal system error occurred while processing the request.";
    }
    sanitized = sanitized.replace(
      /([a-zA-Z]:|\/app|\/usr|\/home|\/node_modules)[\w\-\.\/\\\:]+/g,
      "[masked-path]",
    );
    sanitized = sanitized.replace(
      /(AIza|Bearer\s+|key=|token=)[\w\-\._]+/gi,
      "[masked-credential]",
    );

    res.status(statusCode).json({
      error: sanitized,
      trace_id: traceId,
      span_id: spanId,
      correlation_id: correlationId,
      ...extra,
    });
  }
}

export const httpResponseFormatter = new HttpResponseFormatter();

// Backward compatibility helper functions delegating to the OOP service
export function getClientIp(req: Request): string {
  return httpResponseFormatter.getClientIp(req);
}

export function getRouteParam(param: string | string[] | undefined): string {
  return httpResponseFormatter.getRouteParam(param);
}

export function getQueryParam(param: unknown): string {
  return httpResponseFormatter.getQueryParam(param);
}

export function sendJsonResponse<T extends Record<string, any>>(
  res: Response,
  statusCode: number,
  data: T,
): void {
  httpResponseFormatter.sendJson(res, statusCode, data);
}

export function sendJsonError(
  res: Response,
  statusCode: number,
  message: string,
  extra: Record<string, any> = {},
): void {
  httpResponseFormatter.sendError(res, statusCode, message, extra);
}
