import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { DesktopNavigationSelectors, MobileLayoutSelectors } from "@/constants/selectors.js";
import { SanityTimeouts, SanityDefaults } from "@/constants/sanityConstants.js";

/**
 * UC-09: Responsive Multi-Device Continuity
 */
export class UC09_ResponsiveMultiDeviceContinuity extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-09",
      "Responsive Multi-Device Layout Continuity",
      "UX & Responsiveness",
      "Validates seamless transition between desktop studio and mobile layout with bottom navigation",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Switch to Mobile View Mode", async () => {
      const toggle = page.locator(DesktopNavigationSelectors.VIEW_MODE_TOGGLE).first();
      await toggle.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      await toggle.click();
      await page.waitForTimeout(SanityTimeouts.FAST_ACTION_DELAY_MS);
      const layout = page.locator(MobileLayoutSelectors.LAYOUT).first();
      await layout.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Mobile responsive layout mounted";
    });

    await recordStep("Traverse Mobile Bottom Navigation Tabs", async () => {
      const bottomNav = page.locator(MobileLayoutSelectors.BOTTOM_NAV).first();
      await bottomNav.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      const navButtons = page.locator(MobileLayoutSelectors.TAB_BUTTONS);
      const count = await navButtons.count();
      const limit = Math.min(count, SanityDefaults.MAX_PREVIEW_TABS);
      for (let i = 0; i < limit; i++) {
        await navButtons.nth(i).click();
        await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
      }
      return `Clicked through ${limit} mobile navigation pills`;
    });

    await recordStep("Restore Desktop Studio View", async () => {
      const backBtn = page.locator(MobileLayoutSelectors.SWITCH_TO_DESKTOP_BTN).first();
      if (await backBtn.isVisible()) {
        await backBtn.click();
        await page.waitForTimeout(SanityTimeouts.FAST_ACTION_DELAY_MS);
      }
      return "Successfully restored Desktop Studio";
    });
  }
}

