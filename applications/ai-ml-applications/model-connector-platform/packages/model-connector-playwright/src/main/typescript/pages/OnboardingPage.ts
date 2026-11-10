import type { Page } from "playwright";
import { BasePage } from "@/pages/BasePage.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";
import { OnboardingSelectors } from "@/constants/selectors.js";

/**
 * 7. Provider Onboarding & Domain Stepper Tabs Verifier
 */
export class OnboardingPage extends BasePage {
  private static readonly STEPPER_TABS = Object.freeze([
    "Job Portal",
    "Apps Builder",
    "Storyteller",
  ]);

  public constructor() {
    super("onboarding", "Provider Onboarding");
  }

  public async verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">> {
    await this.navigateToMenu(page);
    await this.verifyPageContainer(page);
    await this.verifyStepperTabs(page);

    return {
      menu: this.menuTitle,
      route: this.menuRoute,
      status: "PASSED",
      details: "All 3 domain stepper tabs (Job Portal, Apps Builder, Storyteller) verified",
    };
  }

  private async verifyPageContainer(page: Page): Promise<void> {
    const pageContainer = page.locator(OnboardingSelectors.PAGE).first();
    await pageContainer.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
  }

  private async verifyStepperTabs(page: Page): Promise<void> {
    for (const tabName of OnboardingPage.STEPPER_TABS) {
      const tabBtn = page.locator(OnboardingSelectors.STEPPER_TAB).filter({ hasText: new RegExp(tabName, "i") }).first();
      await tabBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      await tabBtn.click();
      await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
      const host = page.locator(OnboardingSelectors.FLOW_HOST).first();
      await host.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    }
  }
}

