import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { TelemetrySelectors } from "@/constants/selectors.js";
import { SanityTimeouts, SanityDefaults } from "@/constants/sanityConstants.js";

/**
 * UC-08: Telemetry Monitoring & Upstream Audit Trail
 */
export class UC08_TelemetryAndAuditTrail extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-08",
      "Telemetry Monitoring & Upstream Audit Trail",
      "Observability & Health",
      "Validates 4 system telemetry metric cards and real-time audit log event trail",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Navigate to Telemetry & Upstream", async () => {
      await this.navigateToRoute(page, "upstream", "Telemetry & Upstream");
      const container = page.locator(TelemetrySelectors.CONTAINER).first();
      await container.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Telemetry & Upstream view mounted";
    });

    await recordStep("Verify 4 Real-Time Metrics Cards", async () => {
      const cards = page.locator(TelemetrySelectors.METRIC_CARDS);
      const count = await cards.count();
      if (count < SanityDefaults.MIN_TELEMETRY_CARDS) throw new Error(`Expected at least ${SanityDefaults.MIN_TELEMETRY_CARDS} cards, found ${count}`);
      return `${count} telemetry metric cards verified`;
    });

    await recordStep("Verify Audit Event Log Trail", async () => {
      const auditTable = page.locator(TelemetrySelectors.AUDIT_TABLE).first();
      await auditTable.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Live transaction audit trail table verified";
    });
  }
}

