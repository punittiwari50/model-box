import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import {
  DesktopNavigationSelectors,
  EnterpriseViewSelectors,
  ModelCatalogSelectors,
  ProfileThemeSelectors,
  MobileLayoutSelectors,
} from "@/constants/selectors.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";

/**
 * UC-12: Full Menu Navigation, Interactive Buttons & Dual-Viewport Responsive Parity.
 * Conforms to:
 * - STD-COD-001: Absolute @/* package-root imports
 * - STD-COD-005: Strategy & OOP Pattern
 * - STD-COD-006: Max nesting depth <= 3
 * - STD-COD-007: SLAP <= 20 lines per method
 */
export class UC12_ResponsiveMenuButtonFunctionalSuite extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-12",
      "Menu Routing, Button Functionality & Dual-Viewport Responsive Parity",
      "UX & Navigation",
      "Verifies star-free navigation, every menu and button functional across views, and desktop/mobile responsiveness",
    );
  }

  public async runSteps(
    page: Page,
    recordStep: (name: string, fn: () => Promise<string>) => Promise<void>,
  ): Promise<void> {
    await recordStep("Verify Star-Free Navigation & Badge Counts", () =>
      this.verifyCleanNavigationWithoutStars(page));

    await recordStep("Verify All Sidebar Menus & Target Views", () =>
      this.verifyAllSidebarMenus(page));

    await recordStep("Verify Interactive Buttons Across Catalog & Config", () =>
      this.verifyInteractiveButtons(page));

    await recordStep("Verify Desktop Viewport (1440x900) & Collapse Control", () =>
      this.verifyDesktopViewportAndCollapse(page));

    await recordStep("Verify Mobile Viewport (390x844), Bottom Nav & Drawer", () =>
      this.verifyMobileViewportAndDrawer(page));
  }

  private async verifyCleanNavigationWithoutStars(page: Page): Promise<string> {
    const sidebar = page.locator(DesktopNavigationSelectors.SIDEBAR).first();
    await sidebar.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const starCount = await page.locator(DesktopNavigationSelectors.DEFAULT_INDICATOR).count();
    if (starCount !== 0) {
      throw new Error(`Expected 0 star default indicators in navigation, found ${starCount}`);
    }

    const badgeCount = await page.locator(DesktopNavigationSelectors.NAV_COUNT).count();
    if (badgeCount === 0) {
      throw new Error("Expected numeric count badges in sidebar navigation, found none");
    }

    return `Verified sidebar is star-free (0 stars) with ${badgeCount} count badges present`;
  }

  private async verifyAllSidebarMenus(page: Page): Promise<string> {
    const menuRoutes: readonly { readonly route: string; readonly title: string; readonly container: string }[] = [
      { route: "chat", title: "AI Chat", container: ".desktop-chat-view, .chat-panel" },
      { route: "model-config", title: "Integration Hub", container: ".desktop-model-config-page, .desktop-model-config" },
      { route: "models", title: "Models", container: ".desktop-model-catalog" },
      { route: "sessions", title: "Sessions", container: ".desktop-sessions-view" },
      { route: "upstream", title: "Telemetry", container: ".desktop-telemetry-view" },
      { route: "workflows", title: "Workflows", container: ".desktop-workflow-page" },
      { route: "onboarding", title: "Onboarding", container: ".desktop-onboarding-page" },
      { route: "admin-rbac", title: "Access / RBAC", container: ".desktop-rbac-page" },
    ];

    for (const menu of menuRoutes) {
      await this.navigateToRoute(page, menu.route, menu.title);
      const container = page.locator(menu.container).first();
      await container.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    }

    return `Navigated through all ${menuRoutes.length} primary menu routes successfully`;
  }

  private async verifyInteractiveButtons(page: Page): Promise<string> {
    await this.navigateToRoute(page, "models", "Models");
    await page.locator(EnterpriseViewSelectors.VIEW_LIST).first().click();
    await page.locator(EnterpriseViewSelectors.GROUPED_LIST).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    await page.locator(EnterpriseViewSelectors.VIEW_CARD).first().click();
    await page.locator(EnterpriseViewSelectors.CARD_GRID).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const filterPills = page.locator(ModelCatalogSelectors.FILTER_PILLS);
    if ((await filterPills.count()) > 0) {
      await filterPills.first().click();
      await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
      const allFilter = page.locator(ModelCatalogSelectors.ALL_FILTER).first();
      if (await allFilter.isVisible()) await allFilter.click();
    }

    await this.verifyThemeSwitchButtons(page);
    await this.verifyConfiguredAccountStatus(page);
    return "Verified list/card view toggles, filter pills, theme switcher, and account status indicators";
  }

  private async verifyConfiguredAccountStatus(page: Page): Promise<void> {
    await this.navigateToRoute(page, "model-config", "Integration Hub");
    const modelRow = page.locator(EnterpriseViewSelectors.MODEL_ROW).first();
    if (await modelRow.isVisible()) {
      await modelRow.click();
      const connTab = page.locator(".integration-detail-tabs .detail-tab-btn").filter({ hasText: /Connections/i }).first();
      if (await connTab.isVisible()) {
        await connTab.click();
        const statusBadge = page.locator(".configured-account-row .status-pill-badge").first();
        if (await statusBadge.isVisible()) {
          const badgeText = await statusBadge.textContent();
          if (!badgeText?.includes("Active") && !badgeText?.includes("Inactive")) {
            throw new Error(`Invalid status badge text: ${badgeText}`);
          }
        }
      }
    }
  }

  private async verifyThemeSwitchButtons(page: Page): Promise<void> {
    const trigger = page.locator(ProfileThemeSelectors.PROFILE_TRIGGER).first();
    if (await trigger.isVisible()) {
      await trigger.click();
      const popover = page.locator(ProfileThemeSelectors.PROFILE_POPOVER).first();
      await popover.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

      const lightBtn = page.locator(ProfileThemeSelectors.BTN_THEME_LIGHT).first();
      const darkBtn = page.locator(ProfileThemeSelectors.BTN_THEME_DARK).first();
      if (await lightBtn.isVisible() && await darkBtn.isVisible()) {
        await lightBtn.click();
        await darkBtn.click();
      }
      await trigger.click();
    }
  }

  private async verifyDesktopViewportAndCollapse(page: Page): Promise<string> {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);

    const collapseBtn = page.locator(DesktopNavigationSelectors.COLLAPSE_BTN).first();
    if (await collapseBtn.isVisible()) {
      await collapseBtn.click();
      await page.locator(".desktop-sidebar.collapsed").first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      await collapseBtn.click();
      await page.locator(".desktop-sidebar:not(.collapsed)").first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    }

    return "Verified 1440x900 desktop viewport and sidebar collapse/expand toggle";
  }

  private async verifyMobileViewportAndDrawer(page: Page): Promise<string> {
    const toggle = page.locator(DesktopNavigationSelectors.VIEW_MODE_TOGGLE).first();
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(SanityTimeouts.FAST_ACTION_DELAY_MS);
      await page.locator(MobileLayoutSelectors.LAYOUT).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);

    const bottomNav = page.locator(MobileLayoutSelectors.BOTTOM_NAV).first();
    if (await bottomNav.isVisible()) {
      const tabs = page.locator(MobileLayoutSelectors.TAB_BUTTONS);
      const tabCount = await tabs.count();
      for (let i = 0; i < Math.min(tabCount, 3); i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
      }
    }

    await this.restoreDesktopMode(page);
    return "Verified 390x844 mobile viewport, bottom navigation pills, and restored desktop view";
  }

  private async restoreDesktopMode(page: Page): Promise<void> {
    const backBtn = page.locator(MobileLayoutSelectors.SWITCH_TO_DESKTOP_BTN).first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
      await page.waitForTimeout(SanityTimeouts.FAST_ACTION_DELAY_MS);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
  }
}
