import type { Page } from "playwright";
import { BasePage } from "@/pages/BasePage.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts, SanityDefaults } from "@/constants/sanityConstants.js";
import { RbacSelectors } from "@/constants/selectors.js";

/**
 * 8. Access & RBAC Governance Matrix Verifier
 */
export class RbacPage extends BasePage {
  public constructor() {
    super("admin-rbac", "Access & RBAC");
  }

  public async verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">> {
    await this.navigateToMenu(page);
    const cardCount = await this.verifyGovernanceLayout(page);

    return {
      menu: this.menuTitle,
      route: this.menuRoute,
      status: "PASSED",
      details: `${cardCount} governance cards and multi-tenant matrix table verified`,
    };
  }

  private async verifyGovernanceLayout(page: Page): Promise<number> {
    const pageContainer = page.locator(RbacSelectors.PAGE).first();
    await pageContainer.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const rbacCards = page.locator(RbacSelectors.CARDS);
    const count = await rbacCards.count();
    if (count < SanityDefaults.MIN_RBAC_CARDS) {
      throw new Error(`Expected at least ${SanityDefaults.MIN_RBAC_CARDS} cards, found ${count}`);
    }

    const matrixTable = page.locator(RbacSelectors.MATRIX_TABLE).first();
    await matrixTable.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    return count;
  }
}

