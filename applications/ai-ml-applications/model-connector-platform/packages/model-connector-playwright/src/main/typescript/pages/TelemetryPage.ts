import type { Page } from "playwright";
import { BasePage } from "@/pages/BasePage.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts, SanityDefaults } from "@/constants/sanityConstants.js";
import { TelemetrySelectors } from "@/constants/selectors.js";

/**
 * 5. Telemetry & Upstream Health Verifier
 */
export class TelemetryPage extends BasePage {
  public constructor() {
    super("upstream", "Telemetry & Upstream");
  }

  public async verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">> {
    await this.navigateToMenu(page);
    const cardCount = await this.verifyMetricsAndAudit(page);

    return {
      menu: this.menuTitle,
      route: this.menuRoute,
      status: "PASSED",
      details: `${cardCount} metric cards and audit log trail verified`,
    };
  }

  private async verifyMetricsAndAudit(page: Page): Promise<number> {
    const view = page.locator(TelemetrySelectors.CONTAINER).first();
    await view.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const cards = page.locator(TelemetrySelectors.METRIC_CARDS);
    const count = await cards.count();
    if (count < SanityDefaults.MIN_TELEMETRY_CARDS) {
      throw new Error(`Expected at least ${SanityDefaults.MIN_TELEMETRY_CARDS} cards, found ${count}`);
    }

    const auditTable = page.locator(TelemetrySelectors.AUDIT_TABLE).first();
    await auditTable.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    return count;
  }
}

