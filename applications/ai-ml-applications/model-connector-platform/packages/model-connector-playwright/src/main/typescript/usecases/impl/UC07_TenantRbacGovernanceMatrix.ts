import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { RbacSelectors } from "@/constants/selectors.js";
import { SanityTimeouts, SanityDefaults } from "@/constants/sanityConstants.js";

/**
 * UC-07: Multi-Tenant RBAC Governance & Permissions Matrix
 */
export class UC07_TenantRbacGovernanceMatrix extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-07",
      "Multi-Tenant RBAC Governance & Permissions Matrix",
      "Governance & Security",
      "Validates multi-tenant governance metrics and dynamic role-to-menu authorization matrix",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Navigate to Access & RBAC", async () => {
      await this.navigateToRoute(page, "admin-rbac", "Access & RBAC");
      const pageEl = page.locator(RbacSelectors.PAGE).first();
      await pageEl.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Access & RBAC page mounted";
    });

    await recordStep("Verify Governance Metrics Cards", async () => {
      const cards = page.locator(RbacSelectors.CARDS);
      const count = await cards.count();
      if (count < SanityDefaults.MIN_RBAC_CARDS) throw new Error(`Expected at least ${SanityDefaults.MIN_RBAC_CARDS} cards, found ${count}`);
      return `${count} governance metric cards verified`;
    });

    await recordStep("Verify Dynamic Role-to-Menu Matrix", async () => {
      const matrix = page.locator(RbacSelectors.MATRIX_TABLE).first();
      await matrix.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Role-to-menu dynamic authorization table validated";
    });
  }
}

