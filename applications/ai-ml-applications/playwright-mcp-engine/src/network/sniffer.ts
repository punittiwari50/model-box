import type { Page, Request as PlaywrightRequest, Response as PlaywrightResponse } from 'playwright';
import { logger } from '@/core/logger.js';
import type { InterceptedRequest, InterceptedResponse } from '@/types/network.js';
import { EndpointCatalog } from '@/network/endpoint-catalog.js';

export class NetworkSniffer {
  private page: Page;
  private catalog: EndpointCatalog;
  private pendingRequests = new Map<string, InterceptedRequest>();
  private isAttached = false;

  constructor(page: Page, catalog: EndpointCatalog) {
    this.page = page;
    this.catalog = catalog;
  }

  attach(): void {
    const attachActions: Record<string, () => void> = {
      true: () => {},
      false: () => {
        this.isAttached = true;
        this.page.on('request', this.handleRequest.bind(this));
        this.page.on('response', this.handleResponse.bind(this));
        this.page.on('requestfailed', this.handleRequestFailed.bind(this));
        logger.debug('NetworkSniffer attached to page');
      },
    };

    attachActions[String(this.isAttached)]();
  }

  detach(): void {
    const detachActions: Record<string, () => void> = {
      false: () => {},
      true: () => {
        this.page.off('request', this.handleRequest.bind(this));
        this.page.off('response', this.handleResponse.bind(this));
        this.page.off('requestfailed', this.handleRequestFailed.bind(this));
        this.isAttached = false;
        this.pendingRequests.clear();
      },
    };

    detachActions[String(this.isAttached)]();
  }

  private async handleRequest(req: PlaywrightRequest): Promise<void> {
    try {
      const url = req.url();
      let pathname = url;
      try {
        pathname = new URL(url).pathname;
      } catch {
        // Fallback
      }

      const interceptedReq: InterceptedRequest = {
        id: `${req.method()}-${url}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        url,
        pathname,
        method: req.method(),
        headers: req.headers(),
        postData: req.postData() || undefined,
        resourceType: req.resourceType(),
        timestamp: Date.now(),
      };

      this.pendingRequests.set(req.url(), interceptedReq);
      this.catalog.recordRequest(interceptedReq);
    } catch (err) {
      logger.debug('Error processing intercepted request', { error: String(err) });
    }
  }

  private async handleResponse(res: PlaywrightResponse): Promise<void> {
    try {
      const url = res.url();
      const interceptedReq = this.pendingRequests.get(url);

      let bodyPreview: string | undefined;
      const headers = res.headers();
      const contentType = headers['content-type'] || '';

      const isTextualMime =
        contentType.includes('application/json') ||
        contentType.includes('text/') ||
        contentType.includes('application/xml');

      const mimeCaptureActions: Record<string, () => Promise<void>> = {
        true: async () => {
          try {
            const rawText = await res.text();
            const isTruncationNeeded = rawText.length > 2000;
            const previewGenerators: Record<string, () => string> = {
              true: () => `${rawText.substring(0, 2000)}...[truncated]`,
              false: () => rawText,
            };
            bodyPreview = previewGenerators[String(isTruncationNeeded)]();
          } catch {
            // Response body might be disposed or binary
          }
        },
        false: async () => {},
      };

      await mimeCaptureActions[String(isTextualMime)]();

      const interceptedRes: InterceptedResponse = {
        requestId: interceptedReq?.id || `res-${Date.now()}`,
        url,
        status: res.status(),
        statusText: res.statusText(),
        headers,
        mimeType: contentType,
        bodyPreview,
        contentLength: Number(headers['content-length'] || 0),
        timestamp: Date.now(),
        durationMs: interceptedReq ? Date.now() - interceptedReq.timestamp : 0,
      };

      this.catalog.recordResponse(interceptedReq, interceptedRes);
      this.pendingRequests.delete(url);
    } catch (err) {
      logger.debug('Error processing intercepted response', { error: String(err) });
    }
  }

  private handleRequestFailed(req: PlaywrightRequest): void {
    const failure = req.failure();
    logger.debug('Request failed during sniffing', {
      url: req.url(),
      errorText: failure?.errorText,
    });
    this.pendingRequests.delete(req.url());
  }

  getCatalog(): EndpointCatalog {
    return this.catalog;
  }
}
