import type { Browser, Page } from "playwright";
import type { IBrowserFactory } from "@/contracts/IBrowserFactory.js";
import type { ISanityConfig } from "@/contracts/ISanityConfig.js";
import type { ISanityVerifier } from "@/contracts/ISanityVerifier.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityViewports, SanityTimeouts } from "@/constants/sanityConstants.js";
import { SanityReporter } from "@/runner/SanityReporter.js";
import { DatabaseCleanUpGuard } from "@/runner/DatabaseCleanUpGuard.js";

/**
 * Menu & Tab Sanity Test Suite Orchestrator.
 * Conforms to STD-COD-005 (Strategy & DI) and STD-COD-007 (SLAP <= 20 lines).
 */
export class MenuSanityTestSuite {
  public constructor(
    private readonly browserFactory: IBrowserFactory,
    private readonly verifiers: readonly ISanityVerifier[],
    private readonly config: ISanityConfig,
  ) {}

  public async run(): Promise<readonly ISanityCheckResult[]> {
    SanityReporter.printHeader(this.config.uiBaseUrl);
    const browser = await this.browserFactory.createBrowser(this.config);
    try {
      return await this.executeSuiteWithBrowser(browser);
    } finally {
      await browser.close();
    }
  }

  private async executeSuiteWithBrowser(browser: Browser): Promise<readonly ISanityCheckResult[]> {
    const context = await browser.newContext({ viewport: SanityViewports.DESKTOP });
    const page = await context.newPage();
    this.attachDiagnosticListeners(page);
    try {
      await page.goto(this.config.uiBaseUrl, {
        waitUntil: "networkidle",
        timeout: this.config.defaultTimeoutMs ?? SanityTimeouts.NAVIGATION_TIMEOUT_MS,
      });
      return await this.executeAllVerifiers(page);
    } finally {
      await DatabaseCleanUpGuard.cleanupTestSessions(this.config.uiBaseUrl);
      await page.close();
    }
  }

  private attachDiagnosticListeners(page: Page): void {
    page.on("pageerror", (err) => console.log(" [BROWSER PAGE ERROR]", err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(" [BROWSER ERROR]", msg.text());
    });
  }

  private async executeAllVerifiers(page: Page): Promise<readonly ISanityCheckResult[]> {
    const results: ISanityCheckResult[] = [];
    for (const verifier of this.verifiers) {
      const result = await this.executeSingleVerifier(page, verifier);
      results.push(result);
    }
    SanityReporter.printSummary(results);
    const hasFailures = results.some((r) => r.status === "FAILED");
    if (hasFailures) {
      throw new Error("[SanitySuite] One or more UI menu/tab sanity checks failed.");
    }
    return Object.freeze(results);
  }

  private async executeSingleVerifier(page: Page, verifier: ISanityVerifier): Promise<ISanityCheckResult> {
    const t0 = Date.now();
    try {
      const res = await verifier.verifyView(page);
      return { ...res, latencyMs: Date.now() - t0 };
    } catch (err: any) {
      console.error(` [FAIL] Menu verification failed: ${verifier.menuTitle}`, err.message);
      return {
        menu: verifier.menuTitle,
        route: verifier.menuRoute,
        status: "FAILED",
        details: err.message ?? "Unknown error",
        latencyMs: Date.now() - t0,
      };
    }
  }
}

