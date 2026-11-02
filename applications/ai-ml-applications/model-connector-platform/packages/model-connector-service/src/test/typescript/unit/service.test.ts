import test from "node:test";
import assert from "node:assert/strict";
import { appConfig } from "@/config/index";
import { ServiceConstant } from "@/constants/index";
import { modelService } from "@/services/modelService";
import { sessionService } from "@/services/sessionService";
import { accountRepository } from "@/repositories/accountRepository";
import { PaginationQueryGuard } from "@/database/PaginationQueryGuard";

test("Service - loads configuration with defaults", () => {
  assert.equal(appConfig.port, ServiceConstant.DEFAULT_PORT);
  assert.ok(appConfig.geminiConnectorUrl, "Configured upstream URL present");
  assert.equal(typeof appConfig.enableSimulationFallback, "boolean", "enableSimulationFallback is a boolean");
});

test("ModelService - lists verified models", async () => {
  const models = await modelService.getModels("test-corr-id");
  assert.ok(models.length > 0, "Models array is not empty");
  assert.ok(models.some((m) => m.id.includes("gemini")), "Contains gemini model");
});

test("SessionService - retrieves session collection with bounded pagination", () => {
  const sessions = sessionService.listSessions(10, 0);
  assert.ok(Array.isArray(sessions), "Sessions is an array");
  assert.ok(sessions.length <= 10, "Sessions count does not exceed limit");
});

test("PaginationQueryGuard - prevents unbounded queries and clamps million-record requests", () => {
  // 1. When limit is undefined, safely defaults to 50
  assert.equal(PaginationQueryGuard.sanitizeLimit(undefined), ServiceConstant.DEFAULT_QUERY_LIMIT);
  assert.equal(PaginationQueryGuard.sanitizeLimit(null), ServiceConstant.DEFAULT_QUERY_LIMIT);

  // 2. When user requests 1,000,000 records, strictly clamp to MAX_QUERY_LIMIT (1000)
  assert.equal(PaginationQueryGuard.sanitizeLimit(1_000_000), ServiceConstant.MAX_QUERY_LIMIT);
  assert.equal(PaginationQueryGuard.sanitizeLimit("5000000"), ServiceConstant.MAX_QUERY_LIMIT);

  // 3. When user passes invalid or negative numbers, fallback to default
  assert.equal(PaginationQueryGuard.sanitizeLimit(-10), ServiceConstant.DEFAULT_QUERY_LIMIT);
  assert.equal(PaginationQueryGuard.sanitizeLimit("invalid"), ServiceConstant.DEFAULT_QUERY_LIMIT);

  // 4. Bounded offset handling
  assert.equal(PaginationQueryGuard.sanitizeOffset(-5), 0);
  assert.equal(PaginationQueryGuard.sanitizeOffset("25"), 25);
});

test("AccountRepository - respects safe limits and avoids full table scan", () => {
  const accounts = accountRepository.listAllAccounts(5, 0);
  assert.ok(Array.isArray(accounts), "Accounts is an array");
  assert.ok(accounts.length <= 5, "Accounts count respects safe query limit");
});

test("TaskHeartbeatWatchdog - evaluates task liveness dynamically from application.yml", async () => {
  const { TaskHeartbeatWatchdog } = await import("@/services/lifecycle/TaskHeartbeatWatchdog.js");
  const watchdog = new TaskHeartbeatWatchdog();

  assert.equal(watchdog.getHeartbeatTimeoutSeconds(), 30);
  assert.equal(watchdog.getMaxStalledTimeoutSeconds(), 90);

  // Fresh heartbeat
  const freshResult = watchdog.evaluateTaskLiveness("task-1", new Date(), "STREAMING_INFERENCE");
  assert.equal(freshResult.isHealthy, true);
  assert.equal(freshResult.recommendedAction, "NONE");

  // Heartbeat 45s ago (> 30s threshold) -> MARK_STALLED
  const stalledDate = new Date(Date.now() - 45000);
  const stalledResult = watchdog.evaluateTaskLiveness("task-2", stalledDate, "STREAMING_INFERENCE");
  assert.equal(stalledResult.isHealthy, false);
  assert.equal(stalledResult.recommendedAction, "MARK_STALLED");

  // Heartbeat 120s ago (> 90s threshold) -> FORCE_TERMINATE_AND_FAILOVER
  const deadDate = new Date(Date.now() - 120000);
  const deadResult = watchdog.evaluateTaskLiveness("task-3", deadDate, "STREAMING_INFERENCE");
  assert.equal(deadResult.isHealthy, false);
  assert.equal(deadResult.recommendedAction, "FORCE_TERMINATE_AND_FAILOVER");
});

test("ModelOAuthProviderService - generates valid, structured OAuth URL for Gemini models", async () => {
  const { modelOAuthProviderService } = await import("@/services/modelOAuthProviderService");
  const googleDefaultClientId = `oauth-ref-${Date.now()}-google-default`;
  const placeholderConfig = modelOAuthProviderService.getOAuthConfigForModel("gemini-3.8-flash");
  assert.equal(placeholderConfig.requiresClientRegistration, true);
  assert.equal(placeholderConfig.executableLaunchUrl, undefined);
  assert.equal(placeholderConfig.defaultClientId, "");
  assert.equal(
    new URL(placeholderConfig.authorizationUrl).searchParams.get("client_id"),
    "<DB_MANAGED_OAUTH_CLIENT_REFERENCE>",
  );
  const config = modelOAuthProviderService.getOAuthConfigForModel(
    "gemini-3.8-flash",
    undefined,
    googleDefaultClientId,
  );

  assert.equal(config.provider, "google");
  assert.equal(
    config.redirectUri,
    "http://localhost:8085/oauth2callback",
    "Uses standard Gemini CLI loopback redirect endpoint",
  );

  // Validate URL structure & meaningful parameters
  const parsedUrl = new URL(config.authorizationUrl);
  assert.equal(parsedUrl.origin + parsedUrl.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(parsedUrl.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(parsedUrl.searchParams.get("response_type"), "code");
  assert.equal(parsedUrl.searchParams.get("access_type"), "offline");
  assert.equal(parsedUrl.searchParams.get("prompt"), "select_account consent");
  assert.equal(parsedUrl.searchParams.get("include_granted_scopes"), "true");

  // Validate structured state
  const rawState = parsedUrl.searchParams.get("state") || "";
  const stateParams = new URLSearchParams(rawState);
  assert.equal(stateParams.get("app"), "modelbox-studio");
  assert.equal(stateParams.get("provider"), "google");
  assert.equal(stateParams.get("model"), "gemini-3.8-flash");
  assert.equal(stateParams.get("flow"), "cli_oauth");
  assert.ok(stateParams.get("nonce"), "Nonce is present");
  assert.ok(stateParams.get("ts"), "Timestamp is present");

  // Validate provider descriptor
  assert.equal(config.provider, "google");
  assert.equal(config.accountCategory, "individual");
  assert.equal(config.cliCommand, "gemini auth login --browser");

  // Validate CLI Individual Login execution
  const cliLogin = modelOAuthProviderService.executeCliLogin("gemini-3.8-flash", {
    accountCategory: "individual",
    userEmail: "individual.user@gmail.com",
  });
  assert.equal(cliLogin.provider, "google");
  assert.equal(cliLogin.accountCategory, "individual");
  assert.equal(cliLogin.userEmail, "individual.user@gmail.com");
  assert.equal(cliLogin.authType, "cli_oauth");

  // Custom client ID and redirect URI override test
  const googleCustomRedirectConfig = modelOAuthProviderService.getOAuthConfigForModel(
    "gemini-3.8-flash",
    "http://localhost:8085/oauth/callback",
    googleDefaultClientId,
  );
  assert.equal(googleCustomRedirectConfig.defaultClientId, googleDefaultClientId);
  assert.equal(googleCustomRedirectConfig.redirectUri, "http://localhost:8085/oauth/callback");
  const parsedCustomUrl = new URL(googleCustomRedirectConfig.authorizationUrl);
  assert.equal(parsedCustomUrl.searchParams.get("client_id"), googleDefaultClientId);
  assert.equal(parsedCustomUrl.searchParams.get("redirect_uri"), "http://localhost:8085/oauth/callback");
});

test("ModelOAuthProviderService - supports polymorphic Strategy pattern for Grok, Claude, and Gemini", async () => {
  const { modelOAuthProviderService } = await import("@/services/modelOAuthProviderService");

  // 1. Grok Model polymorphic resolution
  const grokConfig = modelOAuthProviderService.getOAuthConfigForModel("grok-3");
  assert.equal(grokConfig.provider, "xai");
  assert.equal(grokConfig.providerName, "xAI Grok");
  assert.equal(grokConfig.authorizationEndpoint, "https://auth.x.ai/oauth/authorize");
  assert.equal(grokConfig.accountCategory, "individual");
  assert.equal(grokConfig.cliCommand, "grok auth login");

  // 2. Claude Model polymorphic resolution
  const claudeConfig = modelOAuthProviderService.getOAuthConfigForModel("claude-3-7-sonnet");
  assert.equal(claudeConfig.provider, "anthropic");
  assert.equal(claudeConfig.authorizationEndpoint, "https://claude.ai/oauth/authorize");
  assert.equal(claudeConfig.accountCategory, "individual");
  assert.equal(claudeConfig.cliCommand, "claude auth login");

  // 3. GitHub Copilot polymorphic resolution (must precede Claude/OpenAI when prefixed with copilot-)
  const copilotClaudeConfig = modelOAuthProviderService.getOAuthConfigForModel("copilot-claude-3.5-sonnet");
  assert.equal(copilotClaudeConfig.provider, "github");
  assert.equal(copilotClaudeConfig.cliCommand, "gh auth login --web");

  const copilotGptConfig = modelOAuthProviderService.getOAuthConfigForModel("copilot-gpt-4o");
  assert.equal(copilotGptConfig.provider, "github");

  // 4. Ollama LFM3-Omni resolution
  const lfm3Config = modelOAuthProviderService.getOAuthConfigForModel("lfm3-omni");
  assert.equal(lfm3Config.provider, "ollama");

  // 5. All descriptors registry check
  const allDescriptors = modelOAuthProviderService.getAllDescriptors();
  assert.ok(allDescriptors.length >= 6, "Registers all providers in strategy mesh");
  const providers = allDescriptors.map((d) => d.provider);
  assert.ok(providers.includes("google"), "Contains Google");
  assert.ok(providers.includes("xai"), "Contains xAI Grok");
  assert.ok(providers.includes("anthropic"), "Contains Anthropic");
  assert.ok(providers.includes("openai"), "Contains OpenAI");
  assert.ok(providers.includes("github"), "Contains GitHub");
});

test("OAuthExecutorFactory - supports DI injection for MockOAuthExecutor in test profile", async () => {
  const { OAuthExecutorFactory } = await import("@/services/oauth/OAuthExecutorFactory");
  const { MockOAuthExecutor } = await import("../mocks/MockOAuthExecutor");

  OAuthExecutorFactory.setExecutor(new MockOAuthExecutor());
  const executor = OAuthExecutorFactory.getExecutor();
  assert.ok(executor instanceof MockOAuthExecutor, "Dispatches injected MockOAuthExecutor");

  const result = await executor.validateToken("test-token", "gemini-3.8-flash");
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.protocol, "OAuth 2.0 PKCE");

  OAuthExecutorFactory.reset();
});

test("ProtocolVerificationRegistry - routes cli_oauth through CLI verification strategy", async () => {
  const { ProtocolVerificationRegistry } = await import("@/services/verification/connectionVerificationStrategies");
  const successfulResult = {
    status: "VERIFIED" as const,
    protocol: "stub",
    message: "ok",
    latencyMs: 1,
    details: {},
  };
  const oauthStrategy = {
    supports: (protocolType: string) => protocolType === "oauth",
    verify: async () => successfulResult,
  };
  const cliStrategy = {
    supports: (protocolType: string) => protocolType === "cli",
    verify: async () => successfulResult,
  };
  const registry = new ProtocolVerificationRegistry(undefined, [oauthStrategy, cliStrategy]);
  const resolved = registry.resolve("cli_oauth");
  assert.equal(resolved, cliStrategy);
});

test("GeminiProviderVerificationStrategy - rejects unauthorized OAuth token as failed verification", async () => {
  const { GeminiProviderVerificationStrategy } = await import("@/services/verification/connectionVerificationStrategies");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "Request is missing a valid API key.",
        },
      }),
      {
        status: 401,
        statusText: "Unauthorized",
        headers: { "Content-Type": "application/json" },
      },
    )) as typeof fetch;
  try {
    const strategy = new GeminiProviderVerificationStrategy();
    const result = await strategy.verifyApi({
      modelId: "gemini-3.8-flash",
      credentialValue: "ya29.invalid_oauth_token",
      userPrompt: "health check",
      startTime: Date.now(),
    });
    assert.equal(result.status, "FAILED");
    assert.equal(result.protocol, "REST API HTTPS / v1beta");
    assert.ok(
      result.message.includes("OAuth credential rejected by Gemini API"),
      "Expected OAuth rejection guidance in failure message",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CliProtocolVerificationStrategy - prefers API verification for OAuth bearer tokens", async () => {
  const { CliProtocolVerificationStrategy } = await import("@/services/verification/connectionVerificationStrategies");
  type ProviderRegistry = import("@/services/verification/connectionVerificationStrategies").IProviderVerificationRegistry;
  let apiCalled = false;
  let cliBuilt = false;
  const providerRegistry: ProviderRegistry = {
    resolve: () => ({
      supports: () => true,
      verifyApi: async () => {
        apiCalled = true;
        return {
          status: "VERIFIED" as const,
          protocol: "REST API HTTPS / v1beta",
          message: "API OAuth verification succeeded",
          latencyMs: 1,
          details: {},
        };
      },
      buildCliPlan: () => {
        cliBuilt = true;
        return {
          binary: "gemini",
          cmd: "gemini -p test --skip-trust",
          env: {},
        };
      },
    }),
  };

  const strategy = new CliProtocolVerificationStrategy(providerRegistry);
  const result = await strategy.verify({
    modelId: "gemini-3.8-flash",
    credentialValue: "ya29.oauth-token-value",
    userPrompt: "health check",
    startTime: Date.now(),
  });

  assert.equal(result.status, "VERIFIED");
  assert.equal(apiCalled, true);
  assert.equal(cliBuilt, false);
});
