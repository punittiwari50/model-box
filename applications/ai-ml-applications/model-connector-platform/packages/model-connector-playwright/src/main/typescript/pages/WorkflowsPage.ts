import type { Page } from "playwright";
import { BasePage } from "@/pages/BasePage.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";
import { WorkflowsSelectors } from "@/constants/selectors.js";

/**
 * 6. Executive Workflows Studio & DAG Verifier
 */
export class WorkflowsPage extends BasePage {
  public constructor() {
    super("workflows", "Executive Workflows");
  }

  public async verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">> {
    await this.navigateToMenu(page);
    await this.verifyCanvas(page);
    await this.verifyViewModes(page);
    await this.verifyIntegrityGuard(page);
    await this.verifySummary(page);

    return {
      menu: this.menuTitle,
      route: this.menuRoute,
      status: "PASSED",
      details: "DAG canvas, HMAC guard, and executive summary verified",
    };
  }

  private async verifyCanvas(page: Page): Promise<void> {
    const pageContainer = page.locator(WorkflowsSelectors.PAGE).first();
    await pageContainer.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const canvas = page.locator(WorkflowsSelectors.CANVAS_CONTAINER).first();
    await canvas.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
  }

  private async verifyViewModes(page: Page): Promise<void> {
    const tabularPill = page.locator(WorkflowsSelectors.VIEW_MODE_PILL).filter({ hasText: /Tabular Steps/i }).first();
    if (await tabularPill.isVisible()) {
      await tabularPill.click();
      await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
    }
    const dagPill = page.locator(WorkflowsSelectors.VIEW_MODE_PILL).filter({ hasText: /DAG Graph/i }).first();
    if (await dagPill.isVisible()) {
      await dagPill.click();
      await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
    }
  }

  private async verifyIntegrityGuard(page: Page): Promise<void> {
    const verifyBtn = page.locator(WorkflowsSelectors.VERIFY_INTEGRITY_BTN).first();
    if (await verifyBtn.isVisible()) {
      await verifyBtn.click();
      await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
      const alert = page.locator(WorkflowsSelectors.ALERT_BANNER).first();
      await alert.waitFor({ state: "visible", timeout: SanityTimeouts.ALERT_TIMEOUT_MS });
    }
  }

  private async verifySummary(page: Page): Promise<void> {
    const summaryWidget = page.locator(WorkflowsSelectors.SUMMARY_WIDGET).first();
    await summaryWidget.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
  }
}

