import { CoreLogger } from "@/logging/logger.js";

export interface RestRequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly correlationId?: string;
  readonly bearerToken?: string;
  readonly apiKeyHeader?: { readonly name: string; readonly value: string };
}

export interface RestResponse<T = unknown> {
  readonly status: number;
  readonly ok: boolean;
  readonly data: T;
  readonly rawText: string;
  readonly latencyMs: number;
  readonly correlationId: string;
}

export interface IRestClient {
  request<T = unknown>(url: string, options?: RestRequestOptions): Promise<RestResponse<T>>;
  get<T = unknown>(url: string, options?: Omit<RestRequestOptions, "method" | "body">): Promise<RestResponse<T>>;
  post<T = unknown>(url: string, body?: unknown, options?: Omit<RestRequestOptions, "method" | "body">): Promise<RestResponse<T>>;
}

/**
 * Core Enterprise REST Client Library.
 * Provides distributed W3C traceparent/correlation header propagation,
 * credential header composition, and resilient JSON parsing across modules.
 * Conforms to STD-COD-005 (DIP) & STD-COD-007 (Functions <= 20 lines).
 */
export class HttpRestClient implements IRestClient {
  constructor(private readonly defaultTimeoutMs = 10000) {}

  public async get<T = unknown>(
    url: string,
    options?: Omit<RestRequestOptions, "method" | "body">,
  ): Promise<RestResponse<T>> {
    return this.request<T>(url, { ...options, method: "GET" });
  }

  public async post<T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<RestRequestOptions, "method" | "body">,
  ): Promise<RestResponse<T>> {
    return this.request<T>(url, { ...options, method: "POST", body });
  }

  public async request<T = unknown>(
    url: string,
    options: RestRequestOptions = {},
  ): Promise<RestResponse<T>> {
    const startTime = Date.now();
    const trace = CoreLogger.createTraceContext(
      options.correlationId ? { "x-correlation-id": options.correlationId } : undefined,
    );
    const traceparent = `00-${trace.traceId}-${trace.spanId}-01`;
    const headers = this.buildHeaders(options, trace.correlationId, traceparent);
    const bodyPayload = this.serializeBody(options.body, headers);
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: bodyPayload,
      signal: AbortSignal.timeout(options.timeoutMs ?? this.defaultTimeoutMs),
    });
    return this.parseResponse<T>(response, startTime, trace.correlationId);
  }

  private buildHeaders(
    options: RestRequestOptions,
    correlationId: string,
    traceparent: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-correlation-id": correlationId,
      traceparent,
      ...(options.headers ?? {}),
    };
    if (options.bearerToken) {
      headers.Authorization = `Bearer ${options.bearerToken}`;
    }
    if (options.apiKeyHeader) {
      headers[options.apiKeyHeader.name] = options.apiKeyHeader.value;
    }
    return headers;
  }

  private serializeBody(body: unknown, headers: Record<string, string>): BodyInit | undefined {
    if (body === undefined || body === null) return undefined;
    if (body instanceof URLSearchParams) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/x-www-form-urlencoded";
      return body;
    }
    if (typeof body === "string") return body;
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    return JSON.stringify(body);
  }

  private async parseResponse<T>(
    response: Response,
    startTime: number,
    correlationId: string,
  ): Promise<RestResponse<T>> {
    const rawText = await response.text();
    let parsed: unknown = rawText;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      // Retain raw text if non-JSON
    }
    return Object.freeze({
      status: response.status,
      ok: response.ok,
      data: parsed as T,
      rawText,
      latencyMs: Date.now() - startTime,
      correlationId,
    });
  }
}

export const coreRestClient: IRestClient = new HttpRestClient();
