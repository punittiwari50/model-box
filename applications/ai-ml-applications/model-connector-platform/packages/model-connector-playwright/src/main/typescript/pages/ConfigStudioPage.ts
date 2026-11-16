import type { Page } from "playwright";
import { BasePage } from "@/pages/BasePage.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";
import { EnterpriseViewSelectors, ModelConfigSelectors } from "@/constants/selectors.js";

/**
 * 3. Integration Hub, Onboarding Studio & 4 Protocol Tabs Verifier
 */
export class ConfigStudioPage extends BasePage {
  private static readonly PROTOCOL_TABS = Object.freeze([
    "REST API",
    "OAuth 2.0 Redirect",
    "CLI Binary",
    "Cookie Vault",
  ]);

  public constructor() {
    super("model-config", "Integration Hub");
  }

  public async verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">> {
    await this.navigateToMenu(page);
    await this.verifyContainer(page);
    await this.verifyOnboardingRoute(page);
    await this.openDetailProtocolEditor(page);
    await this.verifyProtocolTabs(page);

    return {
      menu: this.menuTitle,
      route: this.menuRoute,
      status: "PASSED",
      details: "Integration Hub, Onboarding Studio & all 4 Protocol Tabs verified",
    };
  }

  private async verifyContainer(page: Page): Promise<void> {
    const container = page.locator(ModelConfigSelectors.CONTAINER).first();
    await container.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
  }

  private async verifyOnboardingRoute(page: Page): Promise<void> {
    const addBtn = page.locator(ModelConfigSelectors.ADD_INTEGRATION_BTN).first();
    await addBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await addBtn.click();
    await page.locator(ModelConfigSelectors.ONBOARDING_PAGE).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await page.locator(EnterpriseViewSelectors.BTN_DISCARD).first().click();
    await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
  }

  private async openDetailProtocolEditor(page: Page): Promise<void> {
    const row = page.locator(EnterpriseViewSelectors.MODEL_ROW).first();
    await row.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await row.click();
    await page.locator(ModelConfigSelectors.DETAIL_VIEW).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    const connectionsTab = page.locator(ModelConfigSelectors.DETAIL_TAB_BTN).filter({ hasText: /Connections/i }).first();
    await connectionsTab.click();
    await page.locator(ModelConfigSelectors.ADD_ACCOUNT_BTN).first().click();
    await page.locator(EnterpriseViewSelectors.FORM_VIEW).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
  }

  private async verifyProtocolTabs(page: Page): Promise<void> {
    for (const tabName of ConfigStudioPage.PROTOCOL_TABS) {
      const tabBtn = page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: new RegExp(tabName, "i") }).first();
      await tabBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      await tabBtn.click();
      await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
      const isActive = await tabBtn.evaluate((el) => el.classList.contains("active"));
      if (!isActive) throw new Error(`Protocol tab '${tabName}' did not activate on click`);
    }
    await page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: /REST API/i }).first().click();
  }
}
