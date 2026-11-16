import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import { logger } from '@/core/logger.js';
import type { BrowserPool } from '@/concurrency/browser-pool.js';
import type { CircuitBreakerRegistry } from '@/resilience/circuit-breaker.js';
import type { ConcurrencyTracker } from '@/resilience/concurrency-tracker.js';
import { GOOGLE_XRAY_CONSTANTS } from '@/constants/index.js';
import type {
  XRayQueryParams,
  XRaySearchResponse,
  XRaySearchResultItem,
} from '@/xray/types.js';
import { XRayPlatformRegistry } from '@/xray/platform-strategies.js';

// ============================================================================
// Google X-Ray Service (Microservice & Distributed Systems OOP Service)
// ============================================================================

export interface IGoogleXRayService {
  search(params: XRayQueryParams): Promise<XRaySearchResponse>;
  executeSearch(params: XRayQueryParams): Promise<XRaySearchResponse>;
  previewQuery(params: XRayQueryParams): { computedQuery: string; googleSearchUrl: string };
}

export class GoogleXRayService implements IGoogleXRayService {
  private pool: BrowserPool;
  private circuitBreakers: CircuitBreakerRegistry;
  private tracker: ConcurrencyTracker;

  constructor(
    pool: BrowserPool,
    circuitBreakers: CircuitBreakerRegistry,
    tracker: ConcurrencyTracker
  ) {
    this.pool = pool;
    this.circuitBreakers = circuitBreakers;
    this.tracker = tracker;
  }

  previewQuery(params: XRayQueryParams): { computedQuery: string; googleSearchUrl: string } {
    const strategy = XRayPlatformRegistry.getStrategy(params.platform);
    const builder = strategy.buildQuery(params);
    const computedQuery = builder.build();
    const googleSearchUrl = builder.toGoogleSearchUrl().toString();

    return {
      computedQuery,
      googleSearchUrl,
    };
  }

  async executeSearch(params: XRayQueryParams): Promise<XRaySearchResponse> {
    return this.search(params);
  }

  async search(params: XRayQueryParams): Promise<XRaySearchResponse> {
    const searchId = `xray-${randomUUID().substring(0, 8)}`;
    const startTimeMs = Date.now();
    const strategy = XRayPlatformRegistry.getStrategy(params.platform);
    const builder = strategy.buildQuery(params);
    const computedQuery = builder.build();
    const searchUrlObj = builder.toGoogleSearchUrl();
    const googleSearchUrl = searchUrlObj.toString();
    const maxResults = Math.min(
      params.limit || GOOGLE_XRAY_CONSTANTS.DEFAULT_RESULTS_LIMIT,
      GOOGLE_XRAY_CONSTANTS.MAX_RESULTS_LIMIT
    );
    const timeoutMs = params.timeoutMs || GOOGLE_XRAY_CONSTANTS.DEFAULT_TIMEOUT_MS;

    const cbDomain = GOOGLE_XRAY_CONSTANTS.CIRCUIT_BREAKER_DOMAIN;
    this.circuitBreakers.checkAllowed(cbDomain);

    const { queueWaitStart } = this.tracker.recordTaskStart();
    let assignedSlot = 0;
    let items: XRaySearchResultItem[] = [];

    try {
      logger.info(`[X-Ray:${searchId}] Executing Google X-Ray query for ${params.platform}: ${computedQuery}`);

      items = await this.pool.executeWithSlot(
        `task-${searchId}`,
        'google-xray',
        async (slot, browser) => {
          assignedSlot = slot.slotId;
          const context = await browser.newContext({
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 768 },
          });

          const page = await context.newPage();

          try {
            await page.goto(googleSearchUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

            // Dismiss Google GDPR / Cookie consent banner when present
            await this.dismissConsentDialog(page);

            // Wait for results
            await page
              .waitForSelector(GOOGLE_XRAY_CONSTANTS.SELECTORS.RESULT_CONTAINERS, { timeout: 10000 })
              .catch(() => {});

            // Extract results directly from page DOM
            const rawResults = await page.$$eval(
              GOOGLE_XRAY_CONSTANTS.SELECTORS.RESULT_CONTAINERS,
              (containers, selectors) => {
                return containers.map((c) => {
                  const titleEl = c.querySelector(selectors.RESULT_TITLE);
                  const linkEl = c.querySelector(selectors.RESULT_LINK) as HTMLAnchorElement | null;
                  const snippetEl = c.querySelector(selectors.RESULT_SNIPPET);

                  return {
                    title: titleEl?.textContent?.trim() || '',
                    url: linkEl?.href || '',
                    snippet: snippetEl?.textContent?.trim() || '',
                  };
                });
              },
              GOOGLE_XRAY_CONSTANTS.SELECTORS
            );

            // Filter out empty results and transform
            const validRaw = rawResults.filter((r) => r.title.length > 0 && r.url.startsWith('http'));
            const limited = validRaw.slice(0, maxResults);

            return limited.map((res, index): XRaySearchResultItem => {
              const metadata = strategy.extractProfileMetadata(res.title, res.snippet, res.url);
              return {
                id: `${searchId}-${index + 1}`,
                rank: index + 1,
                platform: params.platform,
                title: res.title,
                url: res.url,
                snippet: res.snippet,
                metadata,
                timestamp: new Date().toISOString(),
              };
            });
          } finally {
            await context.close().catch(() => {});
          }
        }
      );

      const durationMs = Date.now() - startTimeMs;
      const waitDurationMs = Date.now() - queueWaitStart;

      this.circuitBreakers.recordSuccess(cbDomain);
      this.tracker.recordTaskCompletion(waitDurationMs, true);

      logger.info(
        `[X-Ray:${searchId}] Completed successfully: found ${items.length} result(s) in ${durationMs}ms`
      );

      return {
        searchId,
        platform: params.platform,
        computedQuery,
        googleSearchUrl,
        totalResultsFound: items.length,
        durationMs,
        circuitBreakerStatus: this.circuitBreakers.getStatus(cbDomain).state,
        workerSlotId: assignedSlot,
        items,
      };
    } catch (err) {
      const durationMs = Date.now() - startTimeMs;
      const waitDurationMs = Date.now() - queueWaitStart;

      this.circuitBreakers.recordFailure(cbDomain, err);
      this.tracker.recordTaskCompletion(waitDurationMs, false);

      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[X-Ray:${searchId}] Failed: ${errorMessage}`);

      return {
        searchId,
        platform: params.platform,
        computedQuery,
        googleSearchUrl,
        totalResultsFound: 0,
        durationMs,
        circuitBreakerStatus: this.circuitBreakers.getStatus(cbDomain).state,
        workerSlotId: assignedSlot,
        items: [],
        error: errorMessage,
      };
    }
  }

  private async dismissConsentDialog(page: Page): Promise<void> {
    try {
      const consentBtn = await page.$(GOOGLE_XRAY_CONSTANTS.SELECTORS.CONSENT_BUTTON);
      const hasConsent = Boolean(consentBtn);
      const consentActions: Record<string, () => Promise<void>> = {
        true: async () => {
          await consentBtn!.click().catch(() => {});
          await page.waitForTimeout(500);
        },
        false: async () => {},
      };
      await consentActions[String(hasConsent)]();
    } catch {
      // Ignored
    }
  }
}
