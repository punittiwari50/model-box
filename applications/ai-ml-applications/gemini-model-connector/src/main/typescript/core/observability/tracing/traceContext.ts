import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

/**
 * Distributed Trace & Correlation Context.
 * Conforms to:
 * - W3C TraceContext Specification (traceparent: version-traceId-spanId-traceFlags)
 * - OpenTelemetry distributed context principles
 * - STD-COD-005: Microservices & Distributed Systems Readiness
 * - STD-COD-007.5: Immutability by Default
 */
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly correlationId: string;
  readonly parentSpanId?: string;
  readonly sampled?: boolean;
}

/**
 * OOP Trace Context Manager.
 * Encapsulates AsyncLocalStorage state and W3C traceparent formatting.
 */
export class TraceContextManager {
  private readonly storage = new AsyncLocalStorage<TraceContext>();

  public generateTraceId(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  public generateSpanId(): string {
    return crypto.randomBytes(8).toString("hex");
  }

  public generateCorrelationId(): string {
    return crypto.randomUUID();
  }

  public getCurrent(): TraceContext | undefined {
    return this.storage.getStore();
  }

  public getTraceId(): string {
    return (
      this.storage.getStore()?.traceId || "00000000000000000000000000000000"
    );
  }

  public getSpanId(): string {
    return this.storage.getStore()?.spanId || "0000000000000000";
  }

  public getCorrelationId(): string {
    return this.storage.getStore()?.correlationId || "none";
  }

  public run<T>(context: TraceContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  public startChildSpan<T>(
    _name: string,
    fn: (childContext: TraceContext) => T,
  ): T {
    const current = this.getCurrent();
    const traceId = current?.traceId || this.generateTraceId();
    const correlationId =
      current?.correlationId || this.generateCorrelationId();
    const spanId = this.generateSpanId();

    const childContext: TraceContext = Object.freeze({
      traceId,
      spanId,
      correlationId,
      parentSpanId: current?.spanId,
      sampled: current?.sampled ?? true,
    });

    return this.storage.run(childContext, () => fn(childContext));
  }

  public formatTraceparent(context: TraceContext): string {
    const flags = context.sampled !== false ? "01" : "00";
    return `00-${context.traceId}-${context.spanId}-${flags}`;
  }

  public parseTraceparent(
    header?: string,
  ): { traceId: string; parentSpanId: string } | undefined {
    if (!header || typeof header !== "string") {
      return undefined;
    }
    const parts = header.trim().split("-");
    if (parts.length < 4) {
      return undefined;
    }
    const [, traceId, spanId] = parts;
    if (traceId && spanId && traceId.length === 32 && spanId.length === 16) {
      return { traceId, parentSpanId: spanId };
    }
    return undefined;
  }

  public getTraceHeaders(): Record<string, string> {
    const current = this.getCurrent();
    if (!current) {
      return {};
    }
    return {
      "x-trace-id": current.traceId,
      "x-span-id": current.spanId,
      "x-correlation-id": current.correlationId,
      traceparent: this.formatTraceparent(current),
    };
  }
}

export const traceContextManager = new TraceContextManager();

export const generateTraceId = (): string =>
  traceContextManager.generateTraceId();
export const generateSpanId = (): string =>
  traceContextManager.generateSpanId();
export const generateCorrelationId = (): string =>
  traceContextManager.generateCorrelationId();
export const getCurrentTraceContext = (): TraceContext | undefined =>
  traceContextManager.getCurrent();
export const getTraceId = (): string => traceContextManager.getTraceId();
export const getSpanId = (): string => traceContextManager.getSpanId();
export const getCorrelationId = (): string =>
  traceContextManager.getCorrelationId();
export const runWithTraceContext = <T>(context: TraceContext, fn: () => T): T =>
  traceContextManager.run(context, fn);
export const startChildSpan = <T>(
  name: string,
  fn: (childContext: TraceContext) => T,
): T => traceContextManager.startChildSpan(name, fn);
export const formatTraceparent = (context: TraceContext): string =>
  traceContextManager.formatTraceparent(context);
export const parseTraceparent = (header?: string) =>
  traceContextManager.parseTraceparent(header);
export const getTraceHeaders = (): Record<string, string> =>
  traceContextManager.getTraceHeaders();

export const traceContext = Object.freeze({
  getCurrent: getCurrentTraceContext,
  getTraceId,
  getSpanId,
  getCorrelationId,
  getTraceHeaders,
  run: runWithTraceContext,
  startSpan: startChildSpan,
});
