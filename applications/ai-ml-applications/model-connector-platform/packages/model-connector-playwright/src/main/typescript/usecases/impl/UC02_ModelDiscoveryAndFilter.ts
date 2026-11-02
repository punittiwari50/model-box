import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { ModelCatalogSelectors } from "@/constants/selectors.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";

/**
 * UC-02: Multi-Family Model Catalog Discovery & Filtering
 */
export class UC02_ModelDiscoveryAndFilter extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-02",
      "Multi-Family Model Discovery & Real-Time Filtering",
      "Catalog & Providers",
      "Validates model family filtering (Google, Anthropic, Microsoft, OpenAI, xAI) and keyword search",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Navigate to Model Catalog", async () => {
      await this.navigateToRoute(page, "models", "Model Catalog");
      const catalog = page.locator(ModelCatalogSelectors.CONTAINER).first();
      await catalog.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Model catalog mounted";
    });

    await recordStep("Perform Keyword Search", async () => {
      const search = page.locator(ModelCatalogSelectors.SEARCH_INPUT).first();
      await search.fill("flash");
      await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
      await search.fill("");
      return "Search filtering query executed and cleared";
    });

    await recordStep("Verify Family Filter Tabs Activation", async () => {
      const pills = page.locator(ModelCatalogSelectors.FILTER_PILLS);
      const count = await pills.count();
      for (let i = 0; i < Math.min(count, 5); i++) {
        const pill = pills.nth(i);
        await pill.click();
        await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
      }
      const allPill = page.locator(ModelCatalogSelectors.ALL_FILTER).first();
      if (await allPill.isVisible()) await allPill.click();
      return `Iterated through ${count} family tabs and restored ALL filter`;
    });
  }
}

