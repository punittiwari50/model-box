import type { Request, Response, NextFunction } from 'express';
import {
  TraceContext,
  traceContextManager,
} from '@/core/observability/tracing/traceContext.js';
import { HttpHeader } from '@/domain/constants/index.js';

/**
 * Express Middleware for Distributed Tracing & Correlation (Micrometer & W3C aligned).
 * Extracts or generates Trace ID, Span ID, and Correlation ID, binding them to AsyncLocalStorage
 * and propagating them onto the HTTP response.
 *
 * Conforms to:
 * - STD-COD-005: Inter-service correlation ID propagation
 * - STD-COD-007: Transparent, Non-intrusive Context Management
 */
export class TraceMiddleware {
  public intercept(req: Request, res: Response, next: NextFunction): void {
    // 1. Resolve Trace ID & Parent Span ID from W3C 'traceparent' or 'x-trace-id'
    const traceparentHeader = req.headers[HttpHeader.TRACEPARENT] as string | undefined;
    const parsedTraceparent = traceContextManager.parseTraceparent(traceparentHeader);

    const traceId =
      parsedTraceparent?.traceId ||
      (req.headers[HttpHeader.TRACE_ID] as string) ||
      traceContextManager.generateTraceId();

    const parentSpanId =
      parsedTraceparent?.parentSpanId ||
      (req.headers[HttpHeader.SPAN_ID] as string) ||
      undefined;

    // 2. Generate a fresh Span ID for this local request execution
    const spanId = traceContextManager.generateSpanId();

    // 3. Resolve or generate Correlation ID
    const correlationId =
      (req.headers[HttpHeader.CORRELATION_ID] as string) ||
      traceContextManager.generateCorrelationId();

    const context: TraceContext = Object.freeze({
      traceId,
      spanId,
      correlationId,
      parentSpanId,
      sampled: true,
    });

    // 4. Attach trace identifiers to response headers for downstream client observability
    res.setHeader(HttpHeader.TRACE_ID, traceId);
    res.setHeader(HttpHeader.SPAN_ID, spanId);
    res.setHeader(HttpHeader.CORRELATION_ID, correlationId);
    res.setHeader(HttpHeader.TRACEPARENT, traceContextManager.formatTraceparent(context));

    // 5. Run downstream pipeline within the AsyncLocalStorage context
    traceContextManager.run(context, () => {
      next();
    });
  }
}

export const traceMiddlewareInstance = new TraceMiddleware();
export function traceMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void =>
    traceMiddlewareInstance.intercept(req, res, next);
}
