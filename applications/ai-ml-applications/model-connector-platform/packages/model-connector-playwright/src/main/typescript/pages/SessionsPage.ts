import type { Page } from "playwright";
import { BasePage } from "@/pages/BasePage.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";
import { SessionHistorySelectors } from "@/constants/selectors.js";

/**
 * 4. Session History & Lineage Verifier
 */
export class SessionsPage extends BasePage {
  public constructor() {
    super("sessions", "Session History");
  }

  public async verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">> {
    await this.navigateToMenu(page);
    await this.verifyLayout(page);

    return {
      menu: this.menuTitle,
      route: this.menuRoute,
      status: "PASSED",
      details: "Session lineage table and creation controls verified",
    };
  }

  private async verifyLayout(page: Page): Promise<void> {
    const view = page.locator(SessionHistorySelectors.CONTAINER).first();
    await view.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const newBtn = page.locator(SessionHistorySelectors.NEW_SESSION_BTN).first();
    await newBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const table = page.locator(SessionHistorySelectors.SESSIONS_TABLE).first();
    await table.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
  }
}

