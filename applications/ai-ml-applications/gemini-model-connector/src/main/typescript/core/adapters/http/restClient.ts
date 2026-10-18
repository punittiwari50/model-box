import { CircuitBreaker } from "@/core/resilience/circuitBreaker.js";
import { RetryPolicy } from "@/core/resilience/retryPolicy.js";
import { RateLimiter } from "@/core/resilience/rateLimiter.js";
import { Bulkhead } from "@/core/resilience/bulkhead.js";
import { HttpHeader, MimeType, AuthScheme } from "@/domain/constants/index.js";

export interface RestClientOptions {
  readonly baseUrl?: string;
  readonly defaultTimeoutMs?: number;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly circuitBreaker?: CircuitBreaker;
  readonly retryPolicy?: RetryPolicy;
  readonly rateLimiter?: RateLimiter;
  readonly bulkhead?: Bulkhead;
}

export interface RestRequestOptions<T = any> {
  readonly headers?: Record<string, string>;
  readonly token?: string;
  readonly timeoutMs?: number;
  readonly responseMapper?: (data: any) => T;
  readonly onRequest?: (url: string, init: RequestInit) => void;
  readonly onResponse?: (response: Response) => void;
  readonly onError?: (error: Error) => void;
}

/**
 * Enterprise Resilient REST Client.
 * Conforms to Requirement #21 (Generic RestClient with Resilience4j patterns, callbacks, and typed domain mapping).
 */
export class RestClient {
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryPolicy: RetryPolicy;
  private readonly rateLimiter: RateLimiter;
  private readonly bulkhead: Bulkhead;

  constructor(config: RestClientOptions = {}) {
    this.baseUrl = config.baseUrl || "";
    this.defaultTimeoutMs = config.defaultTimeoutMs || 30000;
    this.defaultHeaders = {
      [HttpHeader.CONTENT_TYPE]: MimeType.JSON,
      [HttpHeader.ACCEPT]: MimeType.JSON,
      ...(config.defaultHeaders || {}),
    };
    this.circuitBreaker =
      config.circuitBreaker || new CircuitBreaker("rest-client");
    this.retryPolicy =
      config.retryPolicy ||
      new RetryPolicy("rest-client", { maxAttempts: 3, waitDurationMs: 1000 });
    this.rateLimiter =
      config.rateLimiter ||
      new RateLimiter("rest-client", {
        limitForPeriod: 100,
        limitRefreshPeriodMs: 1000,
      });
    this.bulkhead =
      config.bulkhead ||
      new Bulkhead("rest-client", { maxConcurrentCalls: 30 });
  }

  public async get<T>(
    path: string,
    options: RestRequestOptions<T> = {},
  ): Promise<T> {
    return this.executeRequest<T>("GET", path, undefined, options);
  }

  public async post<T>(
    path: string,
    body?: unknown,
    options: RestRequestOptions<T> = {},
  ): Promise<T> {
    return this.executeRequest<T>("POST", path, body, options);
  }

  public async put<T>(
    path: string,
    body?: unknown,
    options: RestRequestOptions<T> = {},
  ): Promise<T> {
    return this.executeRequest<T>("PUT", path, body, options);
  }

  public async delete<T>(
    path: string,
    options: RestRequestOptions<T> = {},
  ): Promise<T> {
    return this.executeRequest<T>("DELETE", path, undefined, options);
  }

  private async executeRequest<T>(
    method: string,
    path: string,
    body: unknown | undefined,
    options: RestRequestOptions<T>,
  ): Promise<T> {
    const fullUrl =
      path.startsWith("http://") || path.startsWith("https://")
        ? path
        : `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...(options.headers || {}),
    };

    if (options.token) {
      headers[HttpHeader.AUTHORIZATION] =
        `${AuthScheme.BEARER} ${options.token}`;
    }

    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;

    return this.bulkhead.execute(async () => {
      return this.rateLimiter.execute(async () => {
        return this.circuitBreaker.execute(async () => {
          return this.retryPolicy.execute(async () => {
            const controller = new AbortController();
            const timeoutTimer = setTimeout(
              () => controller.abort(),
              timeoutMs,
            );
            timeoutTimer.unref?.();

            const init: RequestInit = {
              method,
              headers,
              body:
                body !== undefined
                  ? typeof body === "string"
                    ? body
                    : JSON.stringify(body)
                  : undefined,
              signal: controller.signal,
            };

            options.onRequest?.(fullUrl, init);

            try {
              const res = await fetch(fullUrl, init);
              clearTimeout(timeoutTimer);
              options.onResponse?.(res);

              if (!res.ok) {
                const errorText = await res.text().catch(() => "");
                throw new Error(
                  `HTTP ${method} ${fullUrl} failed with status ${res.status}: ${errorText}`,
                );
              }

              const contentType =
                res.headers.get(HttpHeader.CONTENT_TYPE) || "";
              let data: any;
              if (contentType.includes(MimeType.JSON)) {
                data = await res.json();
              } else {
                data = await res.text();
              }

              return options.responseMapper
                ? options.responseMapper(data)
                : (data as T);
            } catch (err: any) {
              clearTimeout(timeoutTimer);
              options.onError?.(err);
              throw err;
            }
          });
        });
      });
    });
  }
}

export const defaultRestClient = new RestClient();
