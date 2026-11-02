import type { Browser, Page } from "playwright";
import { BrowserFactory } from "@/browser/BrowserFactory.js";
import { SanityViewports, SanityTimeouts } from "@/constants/sanityConstants.js";
import type { ISanityConfig } from "@/contracts/ISanityConfig.js";
import type { IUsecaseTest, IUsecaseResult, IUsecaseSuiteSummary } from "@/usecases/contracts/IUsecaseTest.js";
import { UsecaseReportGenerator } from "@/reports/UsecaseReportGenerator.js";
import { DatabaseCleanUpGuard } from "@/runner/DatabaseCleanUpGuard.js";

/**
 * Enterprise Use Case Test Suite Orchestrator.
 * Conforms to STD-COD-005 (Strategy & DI) and STD-COD-007 (Functions <= 20 lines).
 */
export class UsecaseRunner {
  public constructor(
    private readonly usecases: readonly IUsecaseTest[],
    private readonly config: ISanityConfig,
    private readonly outputDir: string,
  ) {}

  public async run(): Promise<IUsecaseSuiteSummary> {
    console.log("==================================================================");
    console.log(" ModelConnector Platform - Playwright Use-Case Testing Suite");
    console.log(` Target UI: ${this.config.uiBaseUrl}`);
    console.log(` Report Output Directory: ${this.outputDir}`);
    console.log("==================================================================");

    const factory = new BrowserFactory();
    const browser = await factory.createBrowser(this.config);
    try {
      return await this.executeSuite(browser);
    } finally {
      await browser.close();
    }
  }

  private async executeSuite(browser: Browser): Promise<IUsecaseSuiteSummary> {
    const context = await browser.newContext({ viewport: SanityViewports.DESKTOP });
    const page = await context.newPage();
    const suiteStart = Date.now();
    try {
      await page.goto(this.config.uiBaseUrl, { waitUntil: "networkidle", timeout: SanityTimeouts.NAVIGATION_TIMEOUT_MS });
      const results = await this.executeAll(page);
      const summary = this.buildSummary(results, Date.now() - suiteStart);
      await UsecaseReportGenerator.generateReports(summary, this.outputDir);
      this.printConsoleSummary(summary);
      return summary;
    } finally {
      await DatabaseCleanUpGuard.cleanupTestSessions(this.config.uiBaseUrl);
      await page.close();
    }
  }

  private async executeAll(page: Page): Promise<IUsecaseResult[]> {
    const results: IUsecaseResult[] = [];
    for (const uc of this.usecases) {
      console.log(`\n▶ [${uc.usecaseId}] Running Use Case: ${uc.title}`);
      const res = await uc.execute(page);
      results.push(res);
      console.log(`   ${res.status === "PASSED" ? "✔" : "✖"} Status: ${res.status} (${res.durationMs}ms)`);
    }
    return results;
  }

  private buildSummary(results: readonly IUsecaseResult[], durationMs: number): IUsecaseSuiteSummary {
    const passed = results.filter((r) => r.status === "PASSED").length;
    return Object.freeze({
      totalUsecases: results.length,
      passedUsecases: passed,
      failedUsecases: results.length - passed,
      totalDurationMs: durationMs,
      executedAt: new Date().toISOString(),
      targetUrl: this.config.uiBaseUrl,
      results,
    });
  }

  private printConsoleSummary(s: IUsecaseSuiteSummary): void {
    console.log("\n==================================================================");
    console.log(" Use-Case Verification Summary Report");
    console.log("==================================================================");
    console.table(
      s.results.map((r) => ({
        ID: r.usecaseId,
        "Use Case Title": r.title,
        Category: r.category,
        Status: r.status === "PASSED" ? "✔ PASSED" : "✖ FAILED",
        Duration: `${r.durationMs}ms`,
        Steps: r.steps.length,
      })),
    );
    console.log(`Result: ${s.passedUsecases}/${s.totalUsecases} Use Cases Passed`);
    console.log("==================================================================\n");
  }
}

