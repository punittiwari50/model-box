import type { Page } from "playwright";
import { BasePage } from "@/pages/BasePage.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts, SanityDefaults } from "@/constants/sanityConstants.js";
import { ModelCatalogSelectors } from "@/constants/selectors.js";

/**
 * 2. Model Catalog & Family Filter Tabs Verifier
 */
export class CatalogPage extends BasePage {
  public constructor() {
    super("models", "Model Catalog");
  }

  public async verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">> {
    await this.navigateToMenu(page);
    await this.verifySearchInput(page);
    const count = await this.verifyFilterPills(page);

    return {
      menu: this.menuTitle,
      route: this.menuRoute,
      status: "PASSED",
      details: `Catalog and ${count} family filter tabs verified`,
    };
  }

  private async verifySearchInput(page: Page): Promise<void> {
    const catalog = page.locator(ModelCatalogSelectors.CONTAINER).first();
    await catalog.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const searchInput = page.locator(ModelCatalogSelectors.SEARCH_INPUT).first();
    await searchInput.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await searchInput.fill("flash");
    await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
    await searchInput.fill("");
  }

  private async verifyFilterPills(page: Page): Promise<number> {
    const filterPills = page.locator(ModelCatalogSelectors.FILTER_PILLS);
    const pillCount = await filterPills.count();
    const limit = Math.min(pillCount, SanityDefaults.MAX_FILTER_PILLS);

    for (let i = 0; i < limit; i++) {
      const pill = filterPills.nth(i);
      await pill.click();
      await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
    }
    const allPill = page.locator(ModelCatalogSelectors.ALL_FILTER).first();
    if (await allPill.isVisible()) await allPill.click();
    return pillCount;
  }
}

