import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { OnboardingSelectors } from "@/constants/selectors.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";

/**
 * UC-06: Domain Application Stepper Wizard Onboarding
 */
export class UC06_DomainApplicationOnboarding extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-06",
      "Domain Application Stepper Wizard Onboarding",
      "Onboarding & Domains",
      "Validates domain stepper wizard flows across Job Portal, Apps Builder, and Storyteller Studio",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Navigate to Provider Onboarding", async () => {
      await this.navigateToRoute(page, "onboarding", "Provider Onboarding");
      const pageEl = page.locator(OnboardingSelectors.PAGE).first();
      await pageEl.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Provider Onboarding page mounted";
    });

    const domains = ["Job Portal", "Apps Builder", "Storyteller Studio"];
    for (const dom of domains) {
      await recordStep(`Activate Domain Wizard: ${dom}`, async () => {
        const tabBtn = page.locator(OnboardingSelectors.STEPPER_TAB).filter({ hasText: new RegExp(dom, "i") }).first();
        await tabBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
        await tabBtn.click();
        await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
        const host = page.locator(OnboardingSelectors.FLOW_HOST).first();
        await host.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
        return `Domain '${dom}' flow host rendered cleanly`;
      });
    }
  }
}

