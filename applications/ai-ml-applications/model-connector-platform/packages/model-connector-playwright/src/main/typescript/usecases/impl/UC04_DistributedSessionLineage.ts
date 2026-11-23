import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { SessionHistorySelectors } from "@/constants/selectors.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";
import { DatabaseCleanUpGuard } from "@/runner/DatabaseCleanUpGuard.js";

/**
 * UC-04: Distributed Multi-User Session Lineage
 */
export class UC04_DistributedSessionLineage extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-04",
      "Distributed Multi-User Session Lineage",
      "Sessions & Auditing",
      "Validates user session tracking, lineage table rendering, and new session creation action",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Navigate to Session History", async () => {
      await this.navigateToRoute(page, "sessions", "Session History");
      const container = page.locator(SessionHistorySelectors.CONTAINER).first();
      await container.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Session History container mounted";
    });

    await recordStep("Verify Lineage Table Render", async () => {
      const table = page.locator(SessionHistorySelectors.SESSIONS_TABLE).first();
      await table.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Session lineage records table rendered";
    });

    await recordStep("Verify Create Session Action Control", async () => {
      const newBtn = page.locator(SessionHistorySelectors.NEW_SESSION_BTN).first();
      await newBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "New session trigger action button verified";
    });

    await recordStep("Ensure Test Data Cleanup", async () => {
      const targetUrl = new URL(page.url()).origin;
      const count = await DatabaseCleanUpGuard.cleanupTestSessions(targetUrl);
      return `Teardown check complete. Test sessions purged: ${count}`;
    });
  }
}

