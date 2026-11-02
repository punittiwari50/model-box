import type { Page } from "playwright";
import { BasePage } from "@/pages/BasePage.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";
import { ModelConfigSelectors } from "@/constants/selectors.js";

/**
 * 3. Model Config Studio & 4 Protocol Tabs Verifier
 */
export class ConfigStudioPage extends BasePage {
  private static readonly PROTOCOL_TABS = Object.freeze([
    "REST API",
    "OAuth 2.0 Redirect",
    "CLI Binary",
    "Cookie Vault",
  ]);

  public constructor() {
    super("model-config", "Model Config Studio");
  }

  public async verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">> {
    await this.navigateToMenu(page);
    await this.verifyContainer(page);
    await this.verifyProtocolTabs(page);

    return {
      menu: this.menuTitle,
      route: this.menuRoute,
      status: "PASSED",
      details: "All 4 Protocol Tabs (REST API, OAuth 2.0, CLI, Cookie Vault) verified",
    };
  }

  private async verifyContainer(page: Page): Promise<void> {
    const container = page.locator(ModelConfigSelectors.CONTAINER).first();
    await container.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
  }

  private async verifyProtocolTabs(page: Page): Promise<void> {
    for (const tabName of ConfigStudioPage.PROTOCOL_TABS) {
      const tabBtn = page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: new RegExp(tabName, "i") }).first();
      await tabBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      await tabBtn.click();
      await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
      const isActive = await tabBtn.evaluate((el) => el.classList.contains("active"));
      if (!isActive) {
        throw new Error(`Protocol tab '${tabName}' did not activate on click`);
      }
    }
    const defaultTab = page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: /REST API/i }).first();
    await defaultTab.click();
  }
}

