import type { Page } from "playwright";
import type { IUsecaseTest, IUsecaseResult, IUsecaseStepResult } from "@/usecases/contracts/IUsecaseTest.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";
import { DesktopNavigationSelectors } from "@/constants/selectors.js";

/**
 * Base Use Case Test Strategy.
 * Implements Step Execution Tracker, Navigation Helpers, and Resilient Assertions.
 * Conforms to STD-COD-005 (Strategy & Template Method) and STD-COD-007 (Functions <= 20 lines).
 */
export abstract class AbstractUsecaseTest implements IUsecaseTest {
  public constructor(
    public readonly usecaseId: string,
    public readonly title: string,
    public readonly category: string,
    public readonly description: string,
  ) {}

  public abstract runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void>;

  public async execute(page: Page): Promise<IUsecaseResult> {
    const t0 = Date.now();
    const steps: IUsecaseStepResult[] = [];
    let stepCounter = 1;

    const recordStep = async (name: string, fn: () => Promise<string>): Promise<void> => {
      const stepStart = Date.now();
      try {
        const details = await fn();
        steps.push({
          stepNumber: stepCounter++,
          name,
          status: "PASSED",
          durationMs: Date.now() - stepStart,
          details,
        });
      } catch (err: any) {
        steps.push({
          stepNumber: stepCounter++,
          name,
          status: "FAILED",
          durationMs: Date.now() - stepStart,
          details: err.message ?? "Step assertion failed",
        });
        throw err;
      }
    };

    try {
      await this.runSteps(page, recordStep);
      return {
        usecaseId: this.usecaseId,
        title: this.title,
        category: this.category,
        description: this.description,
        status: "PASSED",
        durationMs: Date.now() - t0,
        steps: Object.freeze(steps),
      };
    } catch (err: any) {
      return {
        usecaseId: this.usecaseId,
        title: this.title,
        category: this.category,
        description: this.description,
        status: "FAILED",
        durationMs: Date.now() - t0,
        steps: Object.freeze(steps),
        error: err.message ?? String(err),
      };
    }
  }

  protected async navigateToRoute(page: Page, route: string, title: string): Promise<void> {
    const navBtn = page
      .locator(`${DesktopNavigationSelectors.NAV_BY_ROUTE(route)}, ${DesktopNavigationSelectors.NAV_ITEM}:has-text("${title}")`)
      .first();
    await navBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await navBtn.click();
    await page.waitForTimeout(SanityTimeouts.FAST_ACTION_DELAY_MS);
  }
}

