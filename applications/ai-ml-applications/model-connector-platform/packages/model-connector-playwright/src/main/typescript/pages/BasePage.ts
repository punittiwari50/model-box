import type { Page } from "playwright";
import type { ISanityVerifier } from "@/contracts/ISanityVerifier.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";
import { DesktopNavigationSelectors } from "@/constants/selectors.js";

/**
 * Abstract Base Page implementing common navigation and layout verification.
 * Conforms to STD-COD-005 (Page Object Pattern & Strategy).
 */
export abstract class BasePage implements ISanityVerifier {
  public constructor(
    public readonly menuRoute: string,
    public readonly menuTitle: string,
  ) {}

  public async navigateToMenu(page: Page): Promise<void> {
    const navBtn = page
      .locator(`${DesktopNavigationSelectors.NAV_BY_ROUTE(this.menuRoute)}, ${DesktopNavigationSelectors.NAV_ITEM}:has-text("${this.menuTitle}")`)
      .first();
    await navBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await navBtn.click();
    await page.waitForTimeout(SanityTimeouts.FAST_ACTION_DELAY_MS);
  }

  public abstract verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">>;
}

