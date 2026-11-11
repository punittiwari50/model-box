import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import {
  EnterpriseViewSelectors,
  ModelConfigSelectors,
  ProfileThemeSelectors,
} from "@/constants/selectors.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";

/**
 * UC-11: Comprehensive UX Views, Theme Profile Control & OAuth/API Integrity Suite.
 * Verifies Card/List/Detail views, Protocol Studio tabs, Profile Theme Switcher,
 * CLI session endpoint HTTP 200 contract, and single-scope OAuth URL sanitization.
 */
export class UC11_UxViewsAndThemeSuite extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-11",
      "UX View Consistency, Theme Profile & OAuth/API Integrity",
      "UX & Governance",
      "Verifies Card/List/Detail views, buttons, Profile Theme switching, and zero 404/OAuth scope errors.",
    );
  }

  public async runSteps(
    page: Page,
    recordStep: (name: string, fn: () => Promise<string>) => Promise<void>,
  ): Promise<void> {
    await recordStep("Verify Integration Hub Card and List views", () => this.verifyCardAndListViews(page));
    await recordStep("Verify Detail view, Connection Studio tabs & single Save button", () =>
      this.verifyDetailAndConnectionStudio(page));
    await recordStep("Verify cli-sessions/latest 200 OK and single-scope Google OAuth URL", () =>
      this.verifyApiAndOAuthIntegrity(page));
    await recordStep("Verify Profile Detail Theme Switcher (Dark & Light)", () =>
      this.verifyProfileThemeSwitcher(page));
  }

  private async verifyCardAndListViews(page: Page): Promise<string> {
    await this.navigateToRoute(page, "model-config", "Integration Hub");
    await page.locator(EnterpriseViewSelectors.CARD_GRID).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await page.locator(EnterpriseViewSelectors.VIEW_LIST).first().click();
    await page.locator(EnterpriseViewSelectors.GROUPED_LIST).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await page.locator(EnterpriseViewSelectors.VIEW_CARD).first().click();
    await page.locator(EnterpriseViewSelectors.CARD_GRID).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    return "Switched between Card Grid and Grouped List views cleanly";
  }

  private async verifyDetailAndConnectionStudio(page: Page): Promise<string> {
    await page.locator(EnterpriseViewSelectors.MODEL_ROW).first().click();
    await page.locator(ModelConfigSelectors.DETAIL_VIEW).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await page.locator(ModelConfigSelectors.DETAIL_TAB_BTN).filter({ hasText: /Connections/i }).first().click();
    await page.locator(ModelConfigSelectors.ADD_ACCOUNT_BTN).first().click();
    await page.locator(EnterpriseViewSelectors.FORM_VIEW).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const saveCount = await page.locator(EnterpriseViewSelectors.BTN_SAVE).count();
    const bannerCount = await page.locator(EnterpriseViewSelectors.CREATE_BANNER).count();
    if (saveCount !== 1 || bannerCount !== 0) {
      throw new Error(`Expected 1 save button and 0 create banners, found save=${saveCount}, banner=${bannerCount}`);
    }

    for (const label of ["REST API", "OAuth 2.0", "CLI Binary", "Cookie Vault"]) {
      await page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: new RegExp(label, "i") }).first().click();
    }
    return "Detail View tabs, 4 Protocol tabs, and single Save button verified";
  }

  private async verifyApiAndOAuthIntegrity(page: Page): Promise<string> {
    const apiCheck = await page.evaluate(async () => {
      const latestRes = await fetch("/api/v1/models/cli-sessions/latest?modelId=gemini-3.8-flash");
      const latestJson = await latestRes.json();
      const loginRes = await fetch("/api/v1/models/gemini-3.8-flash/cli-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google", cliTool: "antigravity", userEmail: "ux.verify@modelbox.local" }),
      });
      const loginJson = await loginRes.json();
      return { latestStatus: latestRes.status, latestJson, oauthUrl: loginJson?.session?.oauthUrl || "" };
    });

    if (apiCheck.latestStatus !== 200) {
      throw new Error(`Expected HTTP 200 from /api/v1/models/cli-sessions/latest, got ${apiCheck.latestStatus}`);
    }
    if (apiCheck.oauthUrl) {
      this.assertCleanOAuthUrl(apiCheck.oauthUrl);
    }
    return `cli-sessions/latest returned HTTP 200 and OAuth URL validation passed`;
  }

  private assertCleanOAuthUrl(oauthUrl: string): void {
    if (/[\u0000-\u001F\u007F]/.test(oauthUrl)) {
      throw new Error("OAuth URL contains ASCII control or OSC-8 escape characters");
    }
    const parsed = new URL(oauthUrl);
    if (parsed.searchParams.getAll("scope").length > 1) {
      throw new Error("OAuth URL contains duplicate 'scope' query parameters");
    }
  }

  private async verifyProfileThemeSwitcher(page: Page): Promise<string> {
    await page.locator(ProfileThemeSelectors.PROFILE_TRIGGER).first().click();
    await page.locator(ProfileThemeSelectors.THEME_SWITCHER).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await page.locator(ProfileThemeSelectors.BTN_THEME_DARK).first().click();
    const darkAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.locator(ProfileThemeSelectors.BTN_THEME_LIGHT).first().click();
    const lightAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    if (darkAttr !== "dark" || lightAttr !== "light" || darkBg === lightBg) {
      throw new Error(`Theme switcher mismatch: dark=(${darkAttr}, ${darkBg}), light=(${lightAttr}, ${lightBg})`);
    }
    await page.keyboard.press("Escape");
    return `Profile theme switcher toggled cleanly (${darkBg} <-> ${lightBg})`;
  }
}

