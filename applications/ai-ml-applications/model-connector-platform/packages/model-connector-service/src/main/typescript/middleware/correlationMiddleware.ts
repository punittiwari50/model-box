import type { Request, Response, NextFunction } from "express";
import { HttpHeader } from "@/constants/index";
import { CoreLogger, type TraceContext, type ILogger } from "@model-box/model-connector-core";

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      traceContext: TraceContext;
      reqLogger: ILogger;
      startTime: number;
    }
  }
}

/**
 * Enterprise Distributed Tracing & Correlation Middleware.
 * Conforms to W3C TraceContext standards for microservices debugging and telemetry.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceCtx = CoreLogger.createTraceContext(
    req.headers as Record<string, string | string[] | undefined>
  );

  req.correlationId = traceCtx.correlationId;
  req.traceContext = traceCtx;
  req.startTime = Date.now();

  const reqLogger = new CoreLogger().withTracing(traceCtx);
  req.reqLogger = reqLogger;

  // Set W3C TraceContext and OpenTelemetry headers
  res.setHeader(HttpHeader.CORRELATION_ID, traceCtx.correlationId);
  res.setHeader(HttpHeader.TRACE_ID, traceCtx.traceId);
  res.setHeader(HttpHeader.SPAN_ID, traceCtx.spanId);
  res.setHeader("traceparent", `00-${traceCtx.traceId}-${traceCtx.spanId}-01`);

  reqLogger.info(`Incoming request: ${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    clientIp: req.ip || req.socket.remoteAddress,
  });

  res.on("finish", () => {
    const durationMs = Date.now() - req.startTime;
    reqLogger.info(`Request completed: ${req.method} ${req.path} -> ${res.statusCode} (${durationMs}ms)`, {
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}
