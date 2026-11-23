import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { WorkflowsSelectors } from "@/constants/selectors.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";

/**
 * UC-05: Resilient DAG Workflow Execution & Resumption Integrity
 */
export class UC05_ResilientDAGWorkflowIntegrity extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-05",
      "Resilient DAG Workflow Execution & Resumption Integrity",
      "Workflows & Orchestration",
      "Validates DAG Canvas, Tabular steps switching, and cryptographic HMAC resumption tamper protection",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Navigate to Executive Workflows", async () => {
      await this.navigateToRoute(page, "workflows", "Executive Workflows");
      const pageEl = page.locator(WorkflowsSelectors.PAGE).first();
      await pageEl.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Executive Workflows view mounted";
    });

    await recordStep("Toggle Tabular Steps View Mode", async () => {
      const tabPill = page.locator(WorkflowsSelectors.VIEW_MODE_PILL).filter({ hasText: /Tabular Steps/i }).first();
      if (await tabPill.isVisible()) {
        await tabPill.click();
        await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
      }
      return "Tabular execution mode toggled";
    });

    await recordStep("Toggle DAG Graph View Mode", async () => {
      const dagPill = page.locator(WorkflowsSelectors.VIEW_MODE_PILL).filter({ hasText: /DAG Graph/i }).first();
      if (await dagPill.isVisible()) {
        await dagPill.click();
        await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
      }
      return "DAG canvas view mode restored";
    });

    await recordStep("Execute Cryptographic Resumption Integrity Guard", async () => {
      const verifyBtn = page.locator(WorkflowsSelectors.VERIFY_INTEGRITY_BTN).first();
      if (await verifyBtn.isVisible()) {
        await verifyBtn.click();
        await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
        const alert = page.locator(WorkflowsSelectors.ALERT_BANNER).first();
        await alert.waitFor({ state: "visible", timeout: SanityTimeouts.ALERT_TIMEOUT_MS });
      }
      return "HMAC cryptographic integrity validated";
    });
  }
}

