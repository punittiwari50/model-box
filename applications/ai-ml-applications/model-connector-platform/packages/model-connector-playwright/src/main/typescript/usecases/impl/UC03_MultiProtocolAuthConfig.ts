import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { ModelConfigSelectors } from "@/constants/selectors.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";

/**
 * UC-03: Multi-Protocol Authentication & Credential Onboarding
 */
export class UC03_MultiProtocolAuthConfig extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-03",
      "Multi-Protocol Authentication & Credential Onboarding",
      "Security & Configuration",
      "Verifies configuration views for REST API, OAuth 2.0 PKCE redirect, CLI binary, and Cookie vault",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Navigate to Model Config Studio", async () => {
      await this.navigateToRoute(page, "model-config", "Model Config Studio");
      const container = page.locator(ModelConfigSelectors.CONTAINER).first();
      await container.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Model Config Studio mounted";
    });

    const protocols = ["REST API", "OAuth 2.0 Redirect", "CLI Binary", "Cookie Vault"];
    for (const proto of protocols) {
      await recordStep(`Verify Protocol Tab: ${proto}`, async () => {
        const tabBtn = page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: new RegExp(proto, "i") }).first();
        await tabBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
        await tabBtn.click();
        await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
        const isActive = await tabBtn.evaluate((el) => el.classList.contains("active"));
        if (!isActive) throw new Error(`Protocol tab '${proto}' did not activate`);
        return `Protocol '${proto}' activated without UI error`;
      });
    }

    await recordStep("Restore REST API Default Tab", async () => {
      const defaultTab = page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: /REST API/i }).first();
      await defaultTab.click();
      return "REST API selected as baseline protocol";
    });
  }
}

