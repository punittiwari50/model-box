import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { ModelConfigSelectors, EnterpriseViewSelectors, OdooSelectors } from "@/constants/selectors.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";

/**
 * UC-03: Multi-Protocol Authentication & Credential Onboarding
 */
export class UC03_MultiProtocolAuthConfig extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-03",
      "Multi-Protocol Authentication & Credential Onboarding",
      "Security & Configuration",
      "Verifies Odoo List/Card views, Create/Save view transitions, and configuration views for REST API, OAuth 2.0 PKCE redirect, CLI binary, and Cookie vault",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Navigate to Model Config Studio and Verify Odoo Control Panel", async () => {
      await this.navigateToRoute(page, "model-config", "Model Config Studio");
      const container = page.locator(ModelConfigSelectors.CONTAINER).first();
      await container.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      const controlPanel = page.locator(OdooSelectors.CONTROL_PANEL).first();
      await controlPanel.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Model Config Studio and Odoo Control Panel mounted";
    });

    await recordStep("Verify Odoo View Mode Switching (Card & List)", async () => {
      const cardViewBtn = page.locator(OdooSelectors.VIEW_CARD).first();
      if (await cardViewBtn.isVisible()) {
        await cardViewBtn.click();
        await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
        const cardGrid = page.locator(OdooSelectors.CARD_GRID).first();
        await cardGrid.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      }

      const listViewBtn = page.locator(OdooSelectors.VIEW_LIST).first();
      if (await listViewBtn.isVisible()) {
        await listViewBtn.click();
        await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
      }
      return "Successfully switched between Odoo List view and Card view";
    });

    await recordStep("Verify Odoo Create View and Discard Navigation", async () => {
      const createBtn = page.locator(OdooSelectors.BTN_CREATE).first();
      await createBtn.click();
      await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);

      const formView = page.locator(OdooSelectors.FORM_VIEW).first();
      await formView.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      const createBanner = page.locator(OdooSelectors.CREATE_BANNER).first();
      await createBanner.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

      const discardBtn = page.locator(OdooSelectors.BTN_DISCARD).first();
      await discardBtn.click();
      await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
      return "Create View opened, verified, and successfully discarded back to list";
    });

    await recordStep("Open Odoo Save View for Model Configuration", async () => {
      const geminiRow = page.locator(EnterpriseViewSelectors.MODEL_ROW).filter({ hasText: /gemini/i }).first();
      if (await geminiRow.isVisible()) {
        await geminiRow.click();
      } else {
        const modelItem = page.locator(EnterpriseViewSelectors.MODEL_ROW).first();
        if (await modelItem.isVisible()) {
          await modelItem.click();
        } else {
          const createBtn = page.locator(EnterpriseViewSelectors.BTN_CREATE).first();
          await createBtn.click();
        }
      }
      await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);

      const formView = page.locator(EnterpriseViewSelectors.FORM_VIEW).first();
      await formView.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Save View opened for target model configuration";
    });

    const protocols = ["REST API", "OAuth 2.0 Redirect", "CLI Binary", "Cookie Vault"];
    for (const proto of protocols) {
      await recordStep(`Verify Protocol Tab: ${proto}`, async () => {
        const tabBtn = page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: new RegExp(proto, "i") }).first();
        await tabBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
        await tabBtn.click();
        await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
        const isActive = await tabBtn.evaluate((el) => el.classList.contains("active"));
        if (!isActive) throw new Error(`Protocol tab '${proto}' did not activate`);
        return `Protocol '${proto}' activated without UI error`;
      });
    }

    await recordStep("Verify OAuth 2.0 Launch Browser Button & Responsive Clean UI", async () => {
      const oauthTab = page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: /OAuth 2\.0 Redirect/i }).first();
      await oauthTab.click();
      await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);

      // If active session is present from previous runs, switch stepper to Step 2: Browser Redirect & Consent
      const step2Btn = page.locator(".oauth-step-progress .step-item-btn").filter({ hasText: /Redirect & Consent/i }).first();
      if ((await step2Btn.count()) > 0) {
        await step2Btn.click();
        await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
      }

      const urlInput = page.locator(ModelConfigSelectors.COMPUTED_AUTH_URL_INPUT).first();
      await urlInput.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      let computedUrl = await urlInput.inputValue();
      if (!computedUrl || computedUrl.includes("<DB_") || computedUrl.includes("%3CDB_") || !computedUrl.includes("client_id=")) {
        const advancedDetails = page.locator(".oauth-advanced-details summary").first();
        if ((await advancedDetails.count()) > 0) {
          await advancedDetails.click();
          const clientIdInput = page.locator(".oauth-advanced-details input.form-input").first();
          await clientIdInput.fill(process.env.TEST_CLIENT_ID || "");
          await page.waitForTimeout(SanityTimeouts.TRANSITION_WAIT_MS);
          computedUrl = await urlInput.inputValue();
        }
      }
      if (!computedUrl || computedUrl.includes("<DB_") || computedUrl.includes("%3CDB_") || !computedUrl.includes("client_id=")) {
        throw new Error(`Computed OAuth URL is invalid or has unpopulated placeholders: ${computedUrl}`);
      }

      const unwantedBtn1 = page.locator("button:has-text('Use CLI Authentication Mode')");
      const unwantedBtn2 = page.locator("button:has-text('Run CLI Auth Then Test Connection')");
      if ((await unwantedBtn1.count()) > 0 || (await unwantedBtn2.count()) > 0) {
        throw new Error("Unwanted placeholder buttons still present in UI");
      }

      await page.evaluate(() => {
        (window as any).__lastOpenedOAuthUrl = null;
        (window as any).open = (url?: string | URL, _target?: string, _features?: string) => {
          (window as any).__lastOpenedOAuthUrl = url ? String(url) : null;
          return { closed: false, focus: () => {} };
        };
      });

      const launchBtn = page.locator(ModelConfigSelectors.OAUTH_LAUNCH_BROWSER_BTN).first();
      await launchBtn.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      const isEnabled = await launchBtn.isEnabled();
      if (!isEnabled) throw new Error("OAuth Launch Browser button is unexpectedly disabled");

      await launchBtn.click();
      await page.waitForFunction(
        () => Boolean((window as any).__lastOpenedOAuthUrl),
        { timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS },
      );

      const launchedUrl = await page.evaluate(() => (window as any).__lastOpenedOAuthUrl);
      if (!launchedUrl || !launchedUrl.includes("accounts.google.com")) {
        throw new Error(`Launch button failed to open OAuth URL in browser. Target was: ${launchedUrl}`);
      }

      const waitingBanner = page.locator(ModelConfigSelectors.OAUTH_WAITING_INDICATOR).first();
      await waitingBanner.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

      return `Launch Browser verified with URL: ${launchedUrl.substring(0, 60)}... and responsive waiting indicator active`;
    });

    await recordStep("Restore REST API Default Tab & Return via Breadcrumb", async () => {
      const defaultTab = page.locator(ModelConfigSelectors.PROTOCOL_TAB_BTN).filter({ hasText: /REST API/i }).first();
      await defaultTab.click();
      const breadcrumbLink = page.locator(".breadcrumb-link").first();
      if (await breadcrumbLink.isVisible()) {
        await breadcrumbLink.click();
        await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
      }
      return "REST API selected and returned to List View via breadcrumb";
    });
  }
}

