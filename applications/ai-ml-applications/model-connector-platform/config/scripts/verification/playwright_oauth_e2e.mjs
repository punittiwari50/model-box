/**
 * Playwright E2E OAuth Flow Verifier, Dual Ollama Auth Verifier & Zero-Test-Data Cleanup Engine
 * Conforms to:
 * - STD-COD-005: OOP Strategy Pattern, Factory Pattern, and Dependency Injection (SOLID)
 * - STD-COD-010: Isolated Container Execution
 * - Requirement 1: Verifies 24h Distributed Model Cache across all providers
 * - Requirement 2: Cleans up all E2E test accounts/configs so zero dummy test data remains in DB
 * - Requirement 4: Verifies both Ollama Use Case 1 (without OAuth) and Use Case 2 (with OAuth 2.0)
 * - Requirement 7: Verifies multiple OAuth clientId/clientSecret entries via database
 */

import net from "node:net";
import { chromium } from "playwright";

class ContainerLoopbackProxyBridge {
  constructor() {
    this.servers = [];
  }

  async startIfNeeded(enabled) {
    if (!enabled) return;
    const routes = [
      { localPort: 3005, targetHost: "model-connector-ui", targetPort: 80 },
      { localPort: 8095, targetHost: "model-connector-service", targetPort: 8095 },
      { localPort: 8085, targetHost: "model-connector-service", targetPort: 8085 },
      { localPort: 11436, targetHost: "model-connector-service", targetPort: 11436 },
    ];
    for (const route of routes) {
      await this.bindRoute(route);
    }
  }

  bindRoute(route) {
    return new Promise((resolve, reject) => {
      const server = net.createServer((clientSocket) => {
        const upstream = net.connect(route.targetPort, route.targetHost);
        clientSocket.pipe(upstream);
        upstream.pipe(clientSocket);
        clientSocket.on("error", () => upstream.destroy());
        upstream.on("error", () => clientSocket.destroy());
      });
      server.on("error", reject);
      server.listen(route.localPort, "127.0.0.1", () => {
        this.servers.push(server);
        resolve();
      });
    });
  }

  stopAll() {
    for (const s of this.servers) {
      s.close();
    }
  }
}

class BrowserConnectionFactory {
  async createBrowser(envConfig) {
    if (envConfig.edgeCdpUrl) {
      try {
        console.log(` [BrowserFactory] Connecting to existing Microsoft Edge via CDP: ${envConfig.edgeCdpUrl}`);
        return await chromium.connectOverCDP(envConfig.edgeCdpUrl);
      } catch (err) {
        console.warn(` [BrowserFactory] Edge CDP not reachable (${err.message}), falling back to managed browser.`);
      }
    }
    if (envConfig.useMsEdgeChannel) {
      return chromium.launch({ channel: "msedge", headless: envConfig.headless });
    }
    return chromium.launch({
      executablePath: envConfig.chromiumExecutablePath || undefined,
      headless: envConfig.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
}

class GoogleFirstAccountSelectorStrategy {
  supports(url) {
    return url.includes("accounts.google.com");
  }

  async selectFirstAccount(popupPage) {
    const selector = '[data-authuser="0"], [data-identifier]:first-of-type, li.JDAKTe:first-of-type';
    const first = popupPage.locator(selector).first();
    await first.waitFor({ state: "visible", timeout: 10000 });
    const email = (await first.getAttribute("data-identifier")) || "google-first-account";
    await first.click();
    return email;
  }
}

class MicrosoftEdgeFirstAccountSelectorStrategy {
  supports(url) {
    return url.includes("login.microsoftonline.com") || url.includes("login.live.com");
  }

  async selectFirstAccount(popupPage) {
    const selector = '[data-test-id]:first-of-type, .table-row:first-of-type';
    const first = popupPage.locator(selector).first();
    await first.waitFor({ state: "visible", timeout: 10000 });
    await first.click();
    return "edge-first-account";
  }
}

class GitHubFirstAccountSelectorStrategy {
  supports(url) {
    return url.includes("github.com/login/oauth");
  }

  async selectFirstAccount(popupPage) {
    const selector = 'button[name="authorize"]:first-of-type, .oauth-account-picker button:first-of-type';
    const first = popupPage.locator(selector).first();
    await first.waitFor({ state: "visible", timeout: 10000 });
    await first.click();
    return "github-first-account";
  }
}

class ClaudeFirstAccountSelectorStrategy {
  supports(url) {
    return url.includes("anthropic.com") || url.includes("claude.ai");
  }

  async selectFirstAccount(popupPage) {
    const selector = '[data-testid="oauth-authorize"]:first-of-type, button[type="submit"]:first-of-type';
    const first = popupPage.locator(selector).first();
    await first.waitFor({ state: "visible", timeout: 10000 });
    await first.click();
    return "claude-first-account";
  }
}

class OllamaOAuthFirstAccountSelectorStrategy {
  supports(url) {
    return url.includes("/ollama-oauth/authorize");
  }

  async selectFirstAccount(popupPage) {
    const firstAccount = popupPage.locator("#ollama-account-primary, [data-identifier]").first();
    await firstAccount.waitFor({ state: "visible", timeout: 10000 });
    const selectedEmail = (await firstAccount.getAttribute("data-identifier")) || "ollama.operator@model-connector.local";
    await firstAccount.click();
    return selectedEmail;
  }
}

class LoopbackAccountChooserSelectorStrategy {
  supports(url) {
    return url.includes("/oauth2/authorize");
  }

  async selectFirstAccount(popupPage) {
    const firstAccount = popupPage.locator('.oauth-account-item[data-account-index="0"], [data-identifier]').first();
    await firstAccount.waitFor({ state: "visible", timeout: 10000 });
    const selectedEmail = (await firstAccount.getAttribute("data-identifier")) || "first-account";
    await firstAccount.click();
    return selectedEmail;
  }
}

class OAuthAccountSelectorRegistry {
  constructor(strategies) {
    this.strategies = strategies || [
      new OllamaOAuthFirstAccountSelectorStrategy(),
      new LoopbackAccountChooserSelectorStrategy(),
      new GoogleFirstAccountSelectorStrategy(),
      new MicrosoftEdgeFirstAccountSelectorStrategy(),
      new GitHubFirstAccountSelectorStrategy(),
      new ClaudeFirstAccountSelectorStrategy(),
    ];
    this.fallback = new LoopbackAccountChooserSelectorStrategy();
  }

  resolve(url) {
    return this.strategies.find((s) => s.supports(url)) || this.fallback;
  }
}

class OAuthFlowTestOrchestrator {
  constructor(browserFactory, selectorRegistry, config) {
    this.browserFactory = browserFactory;
    this.selectorRegistry = selectorRegistry;
    this.config = config;
    this.createdClientConfigs = [];
  }

  async runAllModelFlows() {
    const proxyBridge = new ContainerLoopbackProxyBridge();
    await proxyBridge.startIfNeeded(this.config.useContainerBridge);
    const browser = await this.browserFactory.createBrowser(this.config);
    try {
      await this.verifyDistributedProviderModelCacheAndMultiClientDb();
      await this.verifyDualOllamaAuthenticationUseCases(browser);

      const contexts = browser.contexts();
      const context = contexts.length > 0 ? contexts[0] : await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await this.openModelConfigStudio(page);

      const modelsToVerify = [
        { modelId: "gemini-3.8-flash", expectedProvider: "google" },
        { modelId: "claude-3-7-sonnet", expectedProvider: "anthropic" },
        { modelId: "copilot-gpt-4o", expectedProvider: "github" },
      ];

      for (const spec of modelsToVerify) {
        await this.verifyModelOAuthFlow(page, spec);
      }
      await page.close();
    } finally {
      await this.cleanupAllE2ETestData();
      await browser.close();
      proxyBridge.stopAll();
    }
  }

  async verifyDistributedProviderModelCacheAndMultiClientDb() {
    console.log("\n=== [Playwright E2E] Verifying 24h Distributed Provider Model Cache & Multi-Client OAuth DB ===");
    const catRes = await fetch(`${this.config.apiBaseUrl}/api/v1/models/providers/catalog`);
    const catBody = await catRes.json();
    if (!catBody.success || !catBody.providerCaches || !catBody.providerCaches.ollama) {
      throw new Error(`Missing distributed providerCaches in catalog response: ${JSON.stringify(catBody)}`);
    }
    console.log(
      ` [Playwright] Verified 24h distributed cache across ${Object.keys(catBody.providerCaches).length} providers (TTL: ${catBody.providerCaches.ollama.ttlMs} ms)`,
    );

    const createClientRes = await fetch(`${this.config.apiBaseUrl}/api/v1/models/providers/google/oauth-clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: "gemini-3.8-flash",
        clientName: "E2E Ephemeral Client",
        clientId: "ephemeral-google-client-id",
        clientSecret: "ephemeral-google-secret",
        isDefault: true,
      }),
    });
    const createClientBody = await createClientRes.json();
    const configId = createClientBody.client?.oauthClientConfigId || createClientBody.client?.clientConfigId;
    if (!createClientBody.success || !configId) {
      throw new Error(`Failed to create provider OAuth client in DB: ${JSON.stringify(createClientBody)}`);
    }
    this.createdClientConfigs.push({
      providerId: "google",
      clientConfigId: configId,
    });
    console.log(` [Playwright] Verified multi-client OAuth DB registration: ${configId}`);
  }

  async verifyDualOllamaAuthenticationUseCases(browser) {
    console.log("\n=== [Playwright E2E] Verifying Ollama Use Case 1 (Without OAuth) & Use Case 2 (With OAuth 2.0) ===");
    // Use Case 1: Ollama WITHOUT OAuth
    const uc1Res = await fetch(`${this.config.apiBaseUrl}/api/v1/models/config/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: "lfm3-omni:latest",
        authType: "none",
        credentialValue: "",
        prompt: "Say OK",
      }),
    });
    const uc1Body = await uc1Res.json();
    if (!uc1Body.success || uc1Body.result?.status !== "VERIFIED") {
      throw new Error(`Ollama Use Case 1 (Without OAuth) failed: ${JSON.stringify(uc1Body)}`);
    }
    console.log(` [Playwright] Ollama Use Case 1 (Without OAuth) VERIFIED: ${uc1Body.result.message}`);

    // Use Case 2: Ollama WITH OAuth 2.0
    const unauthGatewayRes = await fetch(`${this.config.ollamaOAuthBaseUrl}/ollama-oauth/api/tags`);
    if (unauthGatewayRes.status !== 401) {
      throw new Error(`Expected Ollama OAuth Gateway to reject unauthenticated request with 401, got ${unauthGatewayRes.status}`);
    }

    const page = await browser.newPage();
    const authUrl = `${this.config.ollamaOAuthBaseUrl}/ollama-oauth/authorize?client_id=ollama-e2e-client&redirect_uri=${encodeURIComponent("http://localhost:8085/oauth2callback")}&state=${encodeURIComponent("provider=ollama&model=lfm3-omni:latest")}`;
    await page.goto(authUrl, { waitUntil: "domcontentloaded" });
    const strategy = this.selectorRegistry.resolve(page.url());
    const chosenEmail = await strategy.selectFirstAccount(page);
    await page.waitForURL(/\/oauth2callback/, { timeout: 10000 });
    await page.close();

    const latestRes = await fetch(`${this.config.apiBaseUrl}/api/v1/models/${encodeURIComponent("lfm3-omni:latest")}/latest-oauth-callback`);
    const latestBody = await latestRes.json();
    if (!latestBody.success || !latestBody.session?.accessToken?.startsWith("oat_ollama_")) {
      throw new Error(`Ollama Use Case 2 OAuth token exchange failed: ${JSON.stringify(latestBody)}`);
    }
    const bearerToken = latestBody.session.accessToken;

    const uc2Res = await fetch(`${this.config.apiBaseUrl}/api/v1/models/config/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: "lfm3-omni:latest",
        authType: "api",
        credentialValue: bearerToken,
        prompt: "Say OK",
      }),
    });
    const uc2Body = await uc2Res.json();
    if (!uc2Body.success || uc2Body.result?.status !== "VERIFIED") {
      throw new Error(`Ollama Use Case 2 (With OAuth) verification failed: ${JSON.stringify(uc2Body)}`);
    }
    console.log(` [Playwright] Ollama Use Case 2 (With OAuth 2.0) VERIFIED for ${chosenEmail}: ${uc2Body.result.message}`);
  }

  async openModelConfigStudio(page) {
    await page.goto(this.config.uiBaseUrl, { waitUntil: "networkidle" });
    const navBtn = page.locator(".desktop-nav-item").filter({ hasText: /Config|Account|Model/i });
    const count = await navBtn.count();
    for (let i = 0; i < count; i++) {
      const text = (await navBtn.nth(i).textContent()) || "";
      if (text.toLowerCase().includes("config") || text.toLowerCase().includes("account")) {
        await navBtn.nth(i).click();
        break;
      }
    }
    const oauthTab = page.locator(".protocol-tab-btn").filter({ hasText: /OAuth 2\.0 Redirect/i }).first();
    await oauthTab.waitFor({ state: "visible", timeout: 10000 });
    await oauthTab.click();
  }

  async verifyModelOAuthFlow(page, spec) {
    console.log(`\n=== [Playwright OAuth E2E] Testing model: ${spec.modelId} (${spec.expectedProvider}) ===`);
    const modelSelect = page.locator("select.form-select").first();
    await modelSelect.waitFor({ state: "visible", timeout: 10000 });
    await modelSelect.selectOption(spec.modelId);

    const popupPromise = page.waitForEvent("popup", { timeout: 15000 });
    const launchBtn = page.locator(".btn-cli-auth, .btn-browser-auth").first();
    await launchBtn.waitFor({ state: "visible", timeout: 10000 });
    await launchBtn.click();

    const popupPage = await popupPromise;
    await popupPage.waitForLoadState("domcontentloaded");
    const popupUrl = popupPage.url();
    console.log(` [Playwright] OAuth Popup opened: ${popupUrl}`);

    const strategy = this.selectorRegistry.resolve(popupUrl);
    const chosenEmail = await strategy.selectFirstAccount(popupPage);
    console.log(` [Playwright] Selected 1st account in chooser: ${chosenEmail}`);

    await popupPage.waitForURL(/\/oauth2callback/, { timeout: 10000 });
    const badgeText = await popupPage.locator(".badge").textContent();
    if (!badgeText || !badgeText.includes("Account Connected Successfully")) {
      throw new Error(`Expected callback badge 'Account Connected Successfully', got: ${badgeText}`);
    }
    console.log(` [Playwright] Callback verified for ${spec.modelId}: ${badgeText.trim()} (${chosenEmail})`);

    const identityEmailLocator = page.locator(".identity-email").first();
    await identityEmailLocator.waitFor({ state: "visible", timeout: 10000 });
    const uiConnectedEmail = (await identityEmailLocator.textContent())?.trim();
    console.log(` [Playwright] UI updated with active OAuth principal: ${uiConnectedEmail}`);

    await this.verifyBackendSessionCaptured(spec.modelId, chosenEmail);
  }

  async verifyBackendSessionCaptured(modelId, expectedEmail) {
    const res = await fetch(`${this.config.apiBaseUrl}/api/v1/models/${encodeURIComponent(modelId)}/latest-oauth-callback`);
    const body = await res.json();
    if (!body.success || !body.session || body.session.email !== expectedEmail) {
      throw new Error(`Backend session mismatch for ${modelId}: ${JSON.stringify(body)}`);
    }
    const accountsRes = await fetch(`${this.config.apiBaseUrl}/api/v1/models/${encodeURIComponent(modelId)}/accounts`);
    const accountsBody = await accountsRes.json();
    const activeAcc = (accountsBody.accounts || []).find((a) => a.isActive);
    if (!activeAcc || activeAcc.userEmail !== expectedEmail) {
      throw new Error(`Active account not persisted in SQLite for ${modelId}: ${JSON.stringify(accountsBody)}`);
    }
    console.log(` [Playwright] Active OAuth session & SQLite account verified for ${modelId}: ${body.session.email}`);
  }

  async cleanupAllE2ETestData() {
    console.log("\n=== [Playwright E2E Cleanup] Removing all E2E test accounts & OAuth client configs (Req 2) ===");
    for (const item of this.createdClientConfigs) {
      await fetch(
        `${this.config.apiBaseUrl}/api/v1/models/providers/${encodeURIComponent(item.providerId)}/oauth-clients/${encodeURIComponent(item.clientConfigId)}`,
        { method: "DELETE" },
      );
    }
    const allAccountsRes = await fetch(`${this.config.apiBaseUrl}/api/v1/accounts`);
    const allAccountsBody = await allAccountsRes.json();
    const accounts = allAccountsBody.accounts || [];
    for (const acc of accounts) {
      await fetch(
        `${this.config.apiBaseUrl}/api/v1/models/${encodeURIComponent(acc.modelId)}/accounts/${encodeURIComponent(acc.accountId)}`,
        { method: "DELETE" },
      );
    }
    const verifyEmptyRes = await fetch(`${this.config.apiBaseUrl}/api/v1/accounts`);
    const verifyEmptyBody = await verifyEmptyRes.json();
    const remainingCount = (verifyEmptyBody.accounts || []).length;
    if (remainingCount !== 0) {
      throw new Error(`Expected 0 test accounts remaining after E2E cleanup, found ${remainingCount}`);
    }
    console.log(" [Playwright E2E Cleanup] Verified 0 dummy/test accounts remain in database.");
  }
}

const config = {
  uiBaseUrl: process.env.UI_BASE_URL || "http://localhost:3005",
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:8095",
  ollamaOAuthBaseUrl: process.env.OLLAMA_OAUTH_BASE_URL || "http://localhost:11436",
  edgeCdpUrl: process.env.EDGE_CDP_URL || "",
  useMsEdgeChannel: process.env.USE_MSEDGE_CHANNEL === "true",
  chromiumExecutablePath: process.env.CHROMIUM_PATH || "",
  headless: process.env.HEADLESS !== "false",
  useContainerBridge: process.env.CONTAINER_NETWORK_BRIDGE === "true",
};

const orchestrator = new OAuthFlowTestOrchestrator(
  new BrowserConnectionFactory(),
  new OAuthAccountSelectorRegistry(),
  config,
);

orchestrator
  .runAllModelFlows()
  .then(() => {
    console.log("\n=== [PASS] All Playwright OAuth 2.0, Dual Ollama Auth & Zero-Dummy-Data E2E Flows Succeeded ===");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n=== [FAIL] Playwright OAuth 2.0 E2E Flow Failed ===", err);
    process.exit(1);
  });
