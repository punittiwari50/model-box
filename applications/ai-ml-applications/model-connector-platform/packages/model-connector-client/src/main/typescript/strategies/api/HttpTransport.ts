import { ApiTransportException } from "@/domain/errors/domainExceptions.js";
import { HttpHeader, MimeType, DefaultTimeoutMs } from "@/domain/constants/index.js";

export interface HttpResponse<T = unknown> {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly data: T;
}

export class HttpTransport {
  public static async request<T = unknown>(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
      timeoutMs?: number;
      correlationId?: string;
    } = {},
  ): Promise<HttpResponse<T>> {
    const { method = "GET", headers = {}, body, timeoutMs = DefaultTimeoutMs.HTTP_TIMEOUT, correlationId } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const mergedHeaders: Record<string, string> = {
      [HttpHeader.CONTENT_TYPE]: MimeType.JSON,
      [HttpHeader.ACCEPT]: MimeType.JSON,
      ...headers,
    };
    if (correlationId) {
      mergedHeaders[HttpHeader.X_CORRELATION_ID] = correlationId;
    }

    try {
      const res = await fetch(url, {
        method,
        headers: mergedHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const responseText = await res.text();
      let responseData: T;
      try {
        responseData = JSON.parse(responseText) as T;
      } catch {
        responseData = responseText as unknown as T;
      }

      if (!res.ok) {
        throw new ApiTransportException(
          `HTTP ${res.status} from ${url}: ${responseText.slice(0, 200)}`,
          res.status,
          responseText,
          correlationId,
        );
      }

      return { status: res.status, ok: res.ok, headers: res.headers, data: responseData };
    } catch (err: any) {
      if (err instanceof ApiTransportException) throw err;
      throw new ApiTransportException(
        `Network request to ${url} failed: ${err.message}`,
        500,
        undefined,
        correlationId,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
