import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { EnterpriseViewSelectors, ModelConfigSelectors } from "@/constants/selectors.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";

/**
 * UC-03: Multi-Protocol Authentication, Integration Onboarding & OAuth Security
 */
export class UC03_MultiProtocolAuthConfig extends AbstractUsecaseTest {
  private static readonly PROTOCOL_TABS = Object.freeze([
    "REST API",
    "OAuth 2.0 Redirect",
    "CLI Binary",
    "Cookie Vault",
  ]);

  public constructor() {
    super(
      "UC-03",
      "Multi-Protocol Authentication & Integration Onboarding",
      "Security & Configuration",
      "Verifies Integration Hub, Onboarding tabs/tags, selected-only Overview protocols, 4 protocol tabs, and Gemini/OAuth security popup behavior",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Navigate to Integration Hub & Verify Control Panel", () => this.stepNavigateHub(page));
    await recordStep("Verify Hub Card & List View Switching", () => this.stepSwitchHubViewModes(page));
    await recordStep("Verify Integration Onboarding Form, Tag Editor & Popup Close Guard", () => this.stepVerifyOnboarding(page));
    await recordStep("Open Gemini Detail View & Launch Protocol Editor", () => this.stepOpenDetailProtocolEditor(page));
    await this.verifyAllProtocolTabs(page, recordStep);
    await recordStep("Verify OAuth Launch Button & Loopback Security Hardening", () => this.stepVerifyOAuthSecurity(page));
    await recordStep("Restore Default Tab & Return to Hub via Breadcrumb", () => this.stepRestoreHub(page));
  }

  private async stepNavigateHub(page: Page): Promise<string> {
    await this.navigateToRoute(page, "model-config", "Integration Hub");
    await page.locator(ModelConfigSelectors.CONTAINER).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await page.locator(EnterpriseViewSelectors.CONTROL_PANEL).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    return "Integration Hub and Control Panel mounted";
  }

  private async stepSwitchHubViewModes(page: Page): Promise<string> {
    const cardViewBtn = page.locator(EnterpriseViewSelectors.VIEW_CARD).first();
    if (await cardViewBtn.isVisible()) {
      await cardViewBtn.click();
      await page.locator(EnterpriseViewSelectors.CARD_GRID).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    }
    const listViewBtn = page.locator(EnterpriseViewSelectors.VIEW_LIST).first();
    if (await listViewBtn.isVisible()) {
      await listViewBtn.click();
      await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
    }
    return "Card and List views switched cleanly";
  }

  private async stepVerifyOnboarding(page: Page): Promise<string> {
    await page.locator(ModelConfigSelectors.ADD_INTEGRATION_BTN).first().click();
    await page.locator(ModelConfigSelectors.ONBOARDING_PAGE).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    await page.locator(ModelConfigSelectors.ONBOARD_PROVIDER_NAME).fill("Google Gemini E2E");
    await page.locator(ModelConfigSelectors.ONBOARD_CATEGORY).waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    await page.locator(ModelConfigSelectors.ONBOARD_TAB_PROTOCOLS).click();
    await page.locator(`${ModelConfigSelectors.ONBOARDING_PAGE} ${ModelConfigSelectors.PROTOCOL_TAB_BTN}`).filter({ hasText: /CLI Binary/i }).first().click();
    await page.locator(ModelConfigSelectors.ONBOARD_CLI_GEMINI_BTN).click();
    if ((await page.locator(ModelConfigSelectors.ONBOARD_CLI_CMD).inputValue()) !== "gemini") {
      throw new Error("Expected Gemini CLI selector to populate #onb-cli-cmd with 'gemini'");
    }
    await page.locator(ModelConfigSelectors.ONBOARD_CLI_ANTIGRAVITY_BTN).click();
    await page.locator(ModelConfigSelectors.ONBOARD_AUTHCODE_INPUT).waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await page.locator(ModelConfigSelectors.ONBOARD_ACCOUNT_ACTIVE_YES).click();

    await page.locator(`${ModelConfigSelectors.ONBOARDING_PAGE} ${ModelConfigSelectors.PROTOCOL_TAB_BTN}`).filter({ hasText: /OAuth 2\.0/i }).first().click();
    await page.locator(ModelConfigSelectors.ONBOARD_OAUTH_BTN).waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await page.locator(ModelConfigSelectors.ONBOARD_AUTHCODE_VERIFY_BTN).waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    await page.locator(ModelConfigSelectors.ONBOARD_TAB_CAPABILITIES).click();
    await page.locator(ModelConfigSelectors.ONBOARD_CUSTOM_CAP).fill("Agentic Trace");
    await page.locator(ModelConfigSelectors.ONBOARD_TAG_ADD_BTN).first().click();
    const chipCount = await page.locator(ModelConfigSelectors.ONBOARD_TAG_CHIPS).count();
    if (chipCount < 1) throw new Error("Expected at least 1 custom tag chip after adding tag");

    await page.locator(EnterpriseViewSelectors.BTN_DISCARD).first().click();
    await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
    return `Onboarding Gemini CLI (antigravity/gemini), Yes/No active toggle, Auth Code box & ${chipCount} tag verified`;
  }

  private async stepOpenDetailProtocolEditor(page: Page): Promise<string> {
    const cardViewBtn = page.locator(EnterpriseViewSelectors.VIEW_CARD).first();
    await cardViewBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await cardViewBtn.click();
    await page.locator(EnterpriseViewSelectors.CARD_GRID).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const geminiItem = page
      .locator('[data-testid="model-card-gemini-3.8-flash"], [data-testid^="model-card-gemini"]')
      .first();
    await geminiItem.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    await geminiItem.click();

    await page.locator(ModelConfigSelectors.DETAIL_VIEW).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    const titleText = (await page.locator(".detail-provider-title").first().textContent()) || "";
    if (!/gemini/i.test(titleText)) {
      throw new Error(`Expected Google Gemini Detail View, got '${titleText}'`);
    }
    const connectionsTab = page.locator(ModelConfigSelectors.DETAIL_TAB_BTN).filter({ hasText: /Connections/i }).first();
    await connectionsTab.click();
    await page.locator(ModelConfigSelectors.ADD_ACCOUNT_BTN).first().click();
    await page.locator(EnterpriseViewSelectors.FORM_VIEW).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    return "Detail View and Protocol Editor mounted for Gemini";
  }

  private async verifyAllProtocolTabs(
    page: Page,
    recordStep: (name: string, fn: () => Promise<string>) => Promise<void>,
  ): Promise<void> {
    for (const proto of UC03_MultiProtocolAuthConfig.PROTOCOL_TABS) {
      await recordStep(`Verify Protocol Tab: ${proto}`, async () => {
        const tabBtn = page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: new RegExp(proto, "i") }).first();
        await tabBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
        await tabBtn.click();
        await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
        const isActive = await tabBtn.evaluate((el) => el.classList.contains("active"));
        if (!isActive) throw new Error(`Protocol tab '${proto}' did not activate`);
        return `Protocol '${proto}' activated cleanly`;
      });
    }
  }

  private async stepVerifyOAuthSecurity(page: Page): Promise<string> {
    await page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: /OAuth 2\.0 Redirect/i }).first().click();
    const step2Btn = page.locator(".oauth-step-progress .step-item-btn").filter({ hasText: /Consent/i }).first();
    if ((await step2Btn.count()) > 0) await step2Btn.click();

    const computedUrl = await page.locator(ModelConfigSelectors.COMPUTED_AUTH_URL_INPUT).first().inputValue();
    if (!computedUrl || computedUrl.includes("<DB_") || computedUrl.includes("%3CDB_")) {
      throw new Error(`Computed OAuth URL contains invalid DB placeholder: ${computedUrl}`);
    }

    await page.evaluate(() => {
      (window as any).__lastOpenedOAuthUrl = null;
      const fakePopup = {
        closed: false,
        focus: () => {},
        location: {
          set href(val: string) {
            if (val && val !== "about:blank") {
              (window as any).__lastOpenedOAuthUrl = String(val);
            }
          },
          replace(val: string) {
            if (val && val !== "about:blank") {
              (window as any).__lastOpenedOAuthUrl = String(val);
            }
          },
          assign(val: string) {
            if (val && val !== "about:blank") {
              (window as any).__lastOpenedOAuthUrl = String(val);
            }
          },
        },
      };
      (window as any).open = (url?: string | URL) => {
        const str = url ? String(url) : "";
        if (str && str !== "about:blank") {
          (window as any).__lastOpenedOAuthUrl = str;
        }
        return fakePopup;
      };
    });

    await page.locator(ModelConfigSelectors.OAUTH_LAUNCH_BROWSER_BTN).first().click();
    await page.waitForFunction(
      () => {
        const u = (window as any).__lastOpenedOAuthUrl;
        return Boolean(u && u !== "about:blank");
      },
      { timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS },
    );
    await page.locator(ModelConfigSelectors.OAUTH_WAITING_INDICATOR).first().waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
    const launchedUrl = await page.evaluate(() => String((window as any).__lastOpenedOAuthUrl));
    if (!launchedUrl.includes("accounts.google.com") && !launchedUrl.includes("/oauth2/authorize")) {
      throw new Error(`Unexpected OAuth launch target: ${launchedUrl}`);
    }

    const cliLoginJson = await this.probeGeminiCliDiscovery(page);
    if (!cliLoginJson.url.includes("accounts.google.com/o/oauth2/")) {
      throw new Error(`Gemini CLI OAuth discovery returned unexpected URL: ${cliLoginJson.url}`);
    }

    await this.assertLoopbackOAuthHeaders(page);
    return `OAuth URL verified (${launchedUrl.substring(0, 48)}...) + Gemini CLI discovery + CSP/DENY security headers verified`;
  }

  private async probeGeminiCliDiscovery(page: Page): Promise<{ url: string }> {
    const apiBase = this.resolveBackendBaseUrl(page.url());
    const res = await fetch(`${apiBase}/api/v1/models/gemini-3.8-flash/cli-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: "gemini-3.8-flash" }),
    });
    const body = await res.json();
    const url = body?.loginResult?.config?.authorizationUrl || body?.session?.oauthUrl || body?.authorizationUrl || "";
    return { url: String(url) };
  }

  private async assertLoopbackOAuthHeaders(page: Page): Promise<void> {
    const backendOrigin = this.resolveBackendBaseUrl(page.url());
    const oauthBase = backendOrigin.replace(":8095", ":8085");
    const res = await fetch(`${oauthBase}/oauth2/authorize?provider=google&model=gemini-3.8-flash&origin=${encodeURIComponent(new URL(page.url()).origin)}`);
    const xFrame = res.headers.get("x-frame-options") || "";
    const csp = res.headers.get("content-security-policy") || "";
    const html = await res.text();
    if (xFrame.toUpperCase() !== "DENY" || !csp.includes("nonce-")) {
      throw new Error(`Missing OAuth security headers (X-Frame-Options=${xFrame}, CSP=${csp})`);
    }
    if (!html.includes("close-window-btn") || html.includes("Return to ModelBox Studio")) {
      throw new Error("OAuth authorize page must expose Close Window button without auto-redirect");
    }
  }

  private resolveBackendBaseUrl(currentUrl: string): string {
    const envBase = process.env.BACKEND_API_BASE_URL;
    if (envBase) return envBase.replace(/\/+$/, "");
    const parsed = new URL(currentUrl);
    if (parsed.hostname === "model-connector-ui") return "http://model-connector-service:8095";
    return `${parsed.protocol}//${parsed.hostname}:8095`;
  }

  private async stepRestoreHub(page: Page): Promise<string> {
    await page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: /REST API/i }).first().click();
    const breadcrumb = page.locator(".breadcrumb-link").first();
    if (await breadcrumb.isVisible()) await breadcrumb.click();
    return "Restored REST API tab and returned to Integration Hub";
  }
}
