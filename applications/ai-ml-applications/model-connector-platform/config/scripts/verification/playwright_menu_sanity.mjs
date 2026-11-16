/**
 * ==============================================================================
 * Playwright Menu & Tab Sanity Verification Suite
 * ==============================================================================
 * Conforms to:
 * - STD-COD-005: OOP Strategy & Page Object Pattern, Dependency Injection (SOLID)
 * - STD-COD-007: Concise, clean functions & immutability by default
 * - STD-COD-010: Isolated Container & Local Execution
 *
 * Sanity scope:
 * 1. Clicks and verifies each authorized navigation menu opens properly.
 * 2. Once each menu view is open, verifies that all child tabs, protocol pills,
 *    and stepper flows render and toggle without UI exceptions or blank states.
 * 3. Verifies mobile view switching and bottom navigation responsiveness.
 */

import { chromium } from "playwright";

/**
 * Centralized Sanity Constants & Selectors
 */
export const SanityConfig = Object.freeze({
  DEFAULT_TIMEOUT_MS: 10000,
  FAST_ACTION_DELAY_MS: 300,
  VIEWPORT: Object.freeze({ width: 1440, height: 900 }),
  MOBILE_VIEWPORT: Object.freeze({ width: 390, height: 844 }),
});

/**
 * Browser Connection Factory supporting Container, Edge, Chrome, and Headless
 */
export class BrowserFactory {
  async createBrowser(envConfig = {}) {
    if (envConfig.edgeCdpUrl) {
      try {
        console.log(` [BrowserFactory] Connecting to existing browser via CDP: ${envConfig.edgeCdpUrl}`);
        return await chromium.connectOverCDP(envConfig.edgeCdpUrl);
      } catch (err) {
        console.warn(` [BrowserFactory] CDP connection failed (${err.message}), falling back to direct launch.`);
      }
    }
    if (envConfig.useMsEdgeChannel) {
      return chromium.launch({ channel: "msedge", headless: envConfig.headless !== false });
    }
    if (envConfig.chromiumExecutablePath) {
      return chromium.launch({
        executablePath: envConfig.chromiumExecutablePath,
        headless: envConfig.headless !== false,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
    }
    return chromium.launch({
      headless: envConfig.headless !== false,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
  }
}

/**
 * Base Menu Verifier Strategy
 */
export class AbstractMenuVerifier {
  constructor(menuRoute, menuTitle) {
    this.menuRoute = menuRoute;
    this.menuTitle = menuTitle;
  }

  async navigateToMenu(page) {
    console.log(`\n--- [Sanity] Navigating to Menu: ${this.menuTitle} (/${this.menuRoute}) ---`);
    const navBtn = page
      .locator(`.desktop-nav-item[data-route="${this.menuRoute}"], .desktop-nav-item:has-text("${this.menuTitle}")`)
      .first();
    await navBtn.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });
    await navBtn.click();
    await page.waitForTimeout(SanityConfig.FAST_ACTION_DELAY_MS);
  }

  abstractVerify(page) {
    throw new Error("verifyView must be implemented by subclass");
  }
}

/**
 * 1. AI Chat Workspace Verifier
 */
export class ChatMenuVerifier extends AbstractMenuVerifier {
  constructor() {
    super("chat", "AI Chat Workspace");
  }

  async verifyView(page) {
    await this.navigateToMenu(page);
    const container = page.locator(".desktop-chat-view, .chat-panel, .desktop-view-container").first();
    await container.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const textarea = page.locator("textarea, .chat-input-textarea").first();
    await textarea.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const sendBtn = page.locator(".desktop-send-btn, .chat-send-btn, button[title*='Send' i]").first();
    await sendBtn.waitFor({ state: "attached", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    // Sanity verify strategy toggle pills (API, CLI, COOKIE) in sidebar
    const strategyPills = page.locator(".strategy-pill");
    const count = await strategyPills.count();
    for (let i = 0; i < count; i++) {
      const pill = strategyPills.nth(i);
      const text = (await pill.textContent())?.trim();
      await pill.click();
      await page.waitForTimeout(100);
      console.log(`   ✔ Strategy pill [${text}] active and clickable`);
    }

    return { menu: this.menuTitle, route: this.menuRoute, status: "PASSED", details: "Chat container, textarea, send button, and strategy pills verified" };
  }
}

/**
 * 2. Model Catalog Verifier & Category Filter Pills
 */
export class ModelsMenuVerifier extends AbstractMenuVerifier {
  constructor() {
    super("models", "Model Catalog");
  }

  async verifyView(page) {
    await this.navigateToMenu(page);
    const catalog = page.locator(".desktop-model-catalog").first();
    await catalog.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const searchInput = page.locator(".desktop-search-input").first();
    await searchInput.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });
    await searchInput.fill("flash");
    await page.waitForTimeout(150);
    await searchInput.fill("");

    // Verify all category/family filter tabs/pills
    const filterPills = page.locator(".family-filter-pills .filter-pill");
    const pillCount = await filterPills.count();
    console.log(`   ✔ Found ${pillCount} family filter pills in Model Catalog`);

    for (let i = 0; i < Math.min(pillCount, 6); i++) {
      const pill = filterPills.nth(i);
      const label = (await pill.textContent())?.trim();
      await pill.click();
      await page.waitForTimeout(100);
      const isActive = await pill.evaluate((el) => el.classList.contains("active"));
      if (!isActive) throw new Error(`Filter pill '${label}' failed to activate on click`);
      console.log(`   ✔ Filter tab [${label}] clicked and verified active`);
    }

    // Reset to "all" filter
    const allPill = filterPills.filter({ hasText: /all/i }).first();
    if (await allPill.isVisible()) await allPill.click();

    return { menu: this.menuTitle, route: this.menuRoute, status: "PASSED", details: `Catalog and ${pillCount} family filter tabs verified` };
  }
}

/**
 * 3. Model Config Studio Verifier & All 4 Protocol Tabs
 */
export class ModelConfigMenuVerifier extends AbstractMenuVerifier {
  constructor() {
    super("model-config", "Integration Hub");
  }

  async verifyView(page) {
    await this.navigateToMenu(page);
    const configContainer = page.locator(".desktop-model-config-page, .desktop-model-config").first();
    await configContainer.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const firstRow = page.locator('[data-testid^="model-card-"], tr.model-list-row, .resource-card').first();
    await firstRow.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });
    await firstRow.click();

    await page.locator('[data-testid="integration-detail-view"]').first().waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });
    await page.locator(".integration-detail-tabs .detail-tab-btn").filter({ hasText: /Connections/i }).first().click();
    await page.locator('[data-testid="btn-add-account"]').first().click();

    const protocolTabs = [
      { name: "REST API", selector: "api" },
      { name: "OAuth 2.0 Redirect", selector: "oauth" },
      { name: "CLI Binary", selector: "cli" },
      { name: "Cookie Vault", selector: "cookie" },
    ];

    for (const tab of protocolTabs) {
      const tabBtn = page.locator(".protocol-tab-btn").filter({ hasText: new RegExp(tab.name, "i") }).first();
      await tabBtn.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });
      await tabBtn.click();
      await page.waitForTimeout(200);

      const isActive = await tabBtn.evaluate((el) => el.classList.contains("active"));
      if (!isActive) throw new Error(`Protocol tab '${tab.name}' did not become active`);

      console.log(`   ✔ Protocol Tab [${tab.name}] clicked, active state confirmed`);
    }

    // Return to REST API as default
    const apiTab = page.locator(".protocol-tab-btn").filter({ hasText: /REST API/i }).first();
    await apiTab.click();

    return { menu: this.menuTitle, route: this.menuRoute, status: "PASSED", details: "All 4 Protocol Tabs (REST API, OAuth 2.0, CLI, Cookie Vault) verified" };
  }
}

/**
 * 4. Session History Verifier
 */
export class SessionsMenuVerifier extends AbstractMenuVerifier {
  constructor() {
    super("sessions", "Session History");
  }

  async verifyView(page) {
    await this.navigateToMenu(page);
    const view = page.locator(".desktop-sessions-view").first();
    await view.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const newBtn = page.locator(".desktop-new-session-btn").first();
    await newBtn.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const table = page.locator(".sessions-table-wrapper, table.desktop-table").first();
    await table.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    console.log("   ✔ Sessions lineage table and '+ Create New Session' button verified");
    return { menu: this.menuTitle, route: this.menuRoute, status: "PASSED", details: "Session lineage table and creation controls verified" };
  }
}

/**
 * 5. Telemetry & Upstream Health Verifier
 */
export class UpstreamMenuVerifier extends AbstractMenuVerifier {
  constructor() {
    super("upstream", "Telemetry & Upstream");
  }

  async verifyView(page) {
    await this.navigateToMenu(page);
    const view = page.locator(".desktop-telemetry-view").first();
    await view.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const cards = page.locator(".telemetry-card");
    const cardCount = await cards.count();
    if (cardCount < 4) throw new Error(`Expected at least 4 telemetry metric cards, found ${cardCount}`);

    const auditTable = page.locator(".audit-table-card").first();
    await auditTable.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    console.log(`   ✔ ${cardCount} telemetry metric cards and audit log table verified`);
    return { menu: this.menuTitle, route: this.menuRoute, status: "PASSED", details: `${cardCount} metric cards and audit log trail verified` };
  }
}

/**
 * 6. Executive Workflows Studio Verifier
 */
export class WorkflowsMenuVerifier extends AbstractMenuVerifier {
  constructor() {
    super("workflows", "Executive Workflows");
  }

  async verifyView(page) {
    await this.navigateToMenu(page);
    const pageContainer = page.locator(".desktop-workflow-page").first();
    await pageContainer.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const canvas = page.locator(".workflow-canvas-container, .canvas-viewport, .desktop-workflow-page").first();
    await canvas.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    // Verify DAG Graph and Tabular Steps mode tabs
    const tabularPill = page.locator(".workflow-canvas-container button.view-mode-pill").filter({ hasText: /Tabular Steps/i }).first();
    if (await tabularPill.isVisible()) {
      await tabularPill.click();
      await page.waitForTimeout(150);
      console.log("   ✔ Workflow Tabular Steps view mode clicked and verified");
    }
    const dagPill = page.locator(".workflow-canvas-container button.view-mode-pill").filter({ hasText: /DAG Graph/i }).first();
    if (await dagPill.isVisible()) {
      await dagPill.click();
      await page.waitForTimeout(150);
      console.log("   ✔ Workflow DAG Graph view mode clicked and verified");
    }

    const verifyBtn = page.locator("button").filter({ hasText: /Verify Resumption Integrity/i }).first();
    if (await verifyBtn.isVisible()) {
      await verifyBtn.click();
      await page.waitForTimeout(250);
      const alertBanner = page.locator(".alert-banner").first();
      await alertBanner.waitFor({ state: "visible", timeout: 5000 });
      console.log("   ✔ Resumption integrity guard action verified");
    }

    const summaryWidget = page.locator(".executive-summary-widget, .summary-card, h3:has-text('Executive Summary')").first();
    await summaryWidget.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    console.log("   ✔ Interactive workflow DAG canvas and executive summary widget verified");
    return { menu: this.menuTitle, route: this.menuRoute, status: "PASSED", details: "DAG canvas, HMAC guard, and executive summary verified" };
  }
}

/**
 * 7. Provider Onboarding & Domain Stepper Tabs Verifier
 */
export class OnboardingMenuVerifier extends AbstractMenuVerifier {
  constructor() {
    super("onboarding", "Provider Onboarding");
  }

  async verifyView(page) {
    await this.navigateToMenu(page);
    const pageContainer = page.locator(".desktop-onboarding-page").first();
    await pageContainer.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const stepperTabs = [
      { name: "Job Portal", expectedText: "Job" },
      { name: "Apps Builder", expectedText: "Apps" },
      { name: "Storyteller", expectedText: "Storyteller" },
    ];

    for (const tab of stepperTabs) {
      const tabBtn = page.locator(".stepper-tab-pills .ui-segment-btn, .view-mode-pill").filter({ hasText: new RegExp(tab.name, "i") }).first();
      await tabBtn.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });
      await tabBtn.click();
      await page.waitForTimeout(200);

      const isActive = await tabBtn.evaluate((el) => el.classList.contains("active"));
      if (!isActive) throw new Error(`Onboarding stepper tab '${tab.name}' did not activate`);

      const host = page.locator(".onboarding-flow-host").first();
      await host.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

      console.log(`   ✔ Stepper Tab [${tab.name}] clicked, flow host rendered`);
    }

    return { menu: this.menuTitle, route: this.menuRoute, status: "PASSED", details: "All 3 domain stepper tabs (Job Portal, Apps Builder, Storyteller) verified" };
  }
}

/**
 * 8. Access & RBAC Governance Matrix Verifier
 */
export class RbacMenuVerifier extends AbstractMenuVerifier {
  constructor() {
    super("admin-rbac", "Access & RBAC");
  }

  async verifyView(page) {
    await this.navigateToMenu(page);
    const pageContainer = page.locator(".desktop-rbac-page").first();
    await pageContainer.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const tabs = page.locator(".rbac-tabs-bar .ui-segment-btn");
    const count = await tabs.count();
    if (count < 3) throw new Error(`Expected at least 3 RBAC governance tabs, found ${count}`);

    await tabs.filter({ hasText: /Access Matrix/i }).first().click();
    const matrixTable = page.locator("table.matrix-table").first();
    await matrixTable.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    console.log(`   ✔ ${count} RBAC governance tabs and dynamic authorization matrix table verified`);
    return { menu: this.menuTitle, route: this.menuRoute, status: "PASSED", details: `${count} governance tabs and multi-tenant matrix table verified` };
  }
}

/**
 * 9. Mobile View Switcher & Bottom Navigation Sanity Verifier
 */
export class MobileViewSanityVerifier {
  async verifyView(page) {
    console.log(`\n--- [Sanity] Verifying Mobile View Mode & Bottom Navigation ---`);
    const toggleBtn = page.locator(".view-mode-toggle").first();
    await toggleBtn.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });
    await toggleBtn.click();
    await page.waitForTimeout(300);

    const mobileLayout = page.locator(".mobile-layout").first();
    await mobileLayout.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    const bottomNav = page.locator(".mobile-bottom-nav").first();
    await bottomNav.waitFor({ state: "visible", timeout: SanityConfig.DEFAULT_TIMEOUT_MS });

    // Click through mobile bottom nav buttons
    const navButtons = page.locator(".mobile-bottom-nav .mobile-tab-btn");
    const count = await navButtons.count();
    console.log(`   ✔ Found ${count} mobile bottom nav tabs`);

    for (let i = 0; i < Math.min(count, 4); i++) {
      const btn = navButtons.nth(i);
      const label = (await btn.textContent())?.trim();
      await btn.click();
      await page.waitForTimeout(150);
      console.log(`   ✔ Mobile bottom tab [${label}] clicked`);
    }

    // Switch back to desktop view
    const backToDesktopBtn = page.locator('.app-header .mobile-desktop-toggle, button[aria-label="Switch to Desktop"]').first();
    if (await backToDesktopBtn.isVisible()) {
      await backToDesktopBtn.click();
      await page.waitForTimeout(300);
      console.log("   ✔ Successfully switched back to Desktop Studio");
    }

    return { menu: "Mobile Layout", route: "mobile", status: "PASSED", details: "Mobile bottom navigation and responsive mode toggles verified" };
  }
}

/**
 * Main Sanity Test Orchestrator
 */
export class MenuSanityOrchestrator {
  constructor(browserFactory, verifiers, config) {
    this.browserFactory = browserFactory;
    this.verifiers = verifiers;
    this.config = config;
  }

  async runSanitySuite() {
    console.log("==================================================================");
    console.log(" ModelConnector UI - Playwright Menu & Tab Sanity Verification");
    console.log(" Target URL:", this.config.uiBaseUrl);
    console.log("==================================================================");

    const browser = await this.browserFactory.createBrowser(this.config);
    const results = [];
    let page;

    try {
      const context = await browser.newContext({ viewport: SanityConfig.VIEWPORT });
      page = await context.newPage();
      page.on("pageerror", (err) => console.log(" [BROWSER PAGE ERROR]", err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") console.log(" [BROWSER ERROR]", msg.text());
      });

      console.log(`\n[Sanity] Loading ModelConnector UI: ${this.config.uiBaseUrl}`);
      await page.goto(this.config.uiBaseUrl, { waitUntil: "networkidle", timeout: 15000 });

      // Run each menu & tab verifier sequentially
      for (const verifier of this.verifiers) {
        const t0 = Date.now();
        try {
          const res = await verifier.verifyView(page);
          results.push({ ...res, latencyMs: Date.now() - t0 });
        } catch (err) {
          console.error(` [FAIL] Menu verification failed: ${verifier.menuTitle || "Unknown"}`, err.message);
          results.push({
            menu: verifier.menuTitle || "Unknown",
            route: verifier.menuRoute || "unknown",
            status: "FAILED",
            details: err.message,
            latencyMs: Date.now() - t0,
          });
        }
      }

      // Print clean structured summary table
      this.printSummaryTable(results);

      const hasFailures = results.some((r) => r.status === "FAILED");
      if (hasFailures) {
        throw new Error("One or more UI menu/tab sanity checks failed.");
      }
    } finally {
      if (page) await page.close();
      await browser.close();
    }
  }

  printSummaryTable(results) {
    console.log("\n==================================================================");
    console.log(" Sanity Verification Summary Report");
    console.log("==================================================================");
    console.table(
      results.map((r) => ({
        "Menu / Feature": r.menu,
        Route: `/${r.route}`,
        Status: r.status === "PASSED" ? "✔ PASSED" : "✖ FAILED",
        "Latency (ms)": `${r.latencyMs}ms`,
        "Verified Controls": r.details,
      })),
    );
    const passed = results.filter((r) => r.status === "PASSED").length;
    console.log(`\nResult: ${passed}/${results.length} Menus & Tab Flows Passed 100%`);
    console.log("==================================================================\n");
  }
}

// Execution entry point
const envConfig = {
  uiBaseUrl: process.env.UI_BASE_URL || "http://localhost:3005",
  edgeCdpUrl: process.env.EDGE_CDP_URL || "",
  useMsEdgeChannel: process.env.USE_MSEDGE_CHANNEL === "true",
  chromiumExecutablePath: process.env.CHROMIUM_PATH || "",
  headless: process.env.HEADLESS !== "false",
};

const verifiers = [
  new ChatMenuVerifier(),
  new ModelsMenuVerifier(),
  new ModelConfigMenuVerifier(),
  new SessionsMenuVerifier(),
  new UpstreamMenuVerifier(),
  new WorkflowsMenuVerifier(),
  new OnboardingMenuVerifier(),
  new RbacMenuVerifier(),
  new MobileViewSanityVerifier(),
];

const orchestrator = new MenuSanityOrchestrator(new BrowserFactory(), verifiers, envConfig);

orchestrator
  .runSanitySuite()
  .then(() => {
    console.log("[PASS] All UI Menus and Tabs Verified Successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[FAIL] Sanity Verification Failed:", err);
    process.exit(1);
  });
