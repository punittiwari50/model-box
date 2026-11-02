import type { Page } from "playwright";
import type { ISanityVerifier } from "@/contracts/ISanityVerifier.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts, SanityDefaults } from "@/constants/sanityConstants.js";
import { DesktopNavigationSelectors, MobileLayoutSelectors } from "@/constants/selectors.js";

/**
 * 9. Mobile View Switcher & Bottom Navigation Sanity Verifier
 */
export class MobileNavPage implements ISanityVerifier {
  public readonly menuTitle = "Mobile Layout";
  public readonly menuRoute = "mobile";

  public async verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">> {
    await this.switchToMobileView(page);
    await this.verifyMobileBottomNav(page);
    await this.switchBackToDesktop(page);

    return {
      menu: this.menuTitle,
      route: this.menuRoute,
      status: "PASSED",
      details: "Mobile bottom navigation and responsive mode toggles verified",
    };
  }

  private async switchToMobileView(page: Page): Promise<void> {
    const toggleBtn = page.locator(DesktopNavigationSelectors.VIEW_MODE_TOGGLE).first();
    await toggleBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await toggleBtn.click();
    await page.waitForTimeout(SanityTimeouts.FAST_ACTION_DELAY_MS);

    const mobileLayout = page.locator(MobileLayoutSelectors.LAYOUT).first();
    await mobileLayout.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
  }

  private async verifyMobileBottomNav(page: Page): Promise<void> {
    const bottomNav = page.locator(MobileLayoutSelectors.BOTTOM_NAV).first();
    await bottomNav.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const navButtons = page.locator(MobileLayoutSelectors.TAB_BUTTONS);
    const count = await navButtons.count();
    const limit = Math.min(count, SanityDefaults.MAX_PREVIEW_TABS);
    for (let i = 0; i < limit; i++) {
      const btn = navButtons.nth(i);
      await btn.click();
      await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
    }
  }

  private async switchBackToDesktop(page: Page): Promise<void> {
    const backBtn = page.locator(MobileLayoutSelectors.SWITCH_TO_DESKTOP_BTN).first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
      await page.waitForTimeout(SanityTimeouts.FAST_ACTION_DELAY_MS);
    }
  }
}

