import test from "node:test";
import assert from "node:assert/strict";
import {
  ClientFactory,
  ExecutionStrategyType,
  ModelCatalogDefaults,
  ModelPropertyResolverRegistry,
} from "@/index.js";

test("ModelConnectorClient - ClientFactory instantiates client with default strategy", () => {
  const client = ClientFactory.createDefault();
  assert.ok(client, "Client instance created");
});

test("ModelConnectorClient - executes CLI strategy simulation fallback", async () => {
  const client = ClientFactory.createCliClient();
  const res = await client.execute({
    prompt: "Hello ModelBox",
    model: ModelCatalogDefaults.DEFAULT_GEMINI_MODEL,
    strategy: ExecutionStrategyType.CLI,
  });

  assert.equal(res.strategyUsed, ExecutionStrategyType.CLI);
  assert.ok(res.content.length > 0, "Response content is populated");
  assert.ok(res.latencyMs >= 0, "Latency is non-negative");
  assert.ok(res.tokenMetrics.totalTokens > 0, "Tokens are accounted");
});

test("ModelConnectorClient - manages session cookies and turn lineage", async () => {
  const client = ClientFactory.createCookieClient();
  const res1 = await client.execute({
    prompt: "Turn 1",
    strategy: ExecutionStrategyType.COOKIE,
  });

  assert.equal(res1.strategyUsed, ExecutionStrategyType.COOKIE);
  const sessionId = res1.sessionId;
  assert.ok(sessionId, "Session ID generated");

  const session = client.getSession(sessionId!);
  assert.ok(session, "Session retrieved from store");
  assert.equal(session!.turnCount, 1, "Turn count is 1");
  assert.ok(session!.cookies.length > 0, "Cookie jar contains session cookie");
});

test("ModelConnectorClient - provides default model catalog when upstream is offline", async () => {
  const client = ClientFactory.create({ upstreamUrl: "http://127.0.0.1:9999" });
  const models = await client.getModels();

  assert.ok(models.length >= 3, "Catalog contains fallback verified models");
  const gemini = models.find((m) => m.id === "gemini-3.8-flash");
  assert.ok(gemini, "Gemini 3.8 Flash model present");
});

test("ModelConnectorClient - verifies fallback naming convention backed by Ollama defaults", () => {
  assert.equal(ModelCatalogDefaults.DEFAULT_FALLBACK_PROVIDER, "ollama", "Fallback provider defaults to ollama");
  assert.equal(ModelCatalogDefaults.DEFAULT_FALLBACK_MODEL, "llama3.2", "Fallback model defaults to llama3.2");
});

test("ModelConnectorClient - avoids mock and throws exception when simulation fallback is disabled in rest", async () => {
  const origNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.ENABLE_SIMULATION_FALLBACK = "false";
  process.env.ALLOW_MOCK_FALLBACK = "false";
  process.env.IS_BUILDER = "false";
  process.env.CONTAINER_ROLE = "runner";

  const client = ClientFactory.createCliClient();
  await assert.rejects(
    async () => {
      await client.execute({
        prompt: "Strict live test",
        model: "non-existent-cli-model",
        strategy: ExecutionStrategyType.CLI,
      });
    },
    (err: any) => {
      return err.name === "CliExecutionException" || err.code === "CLI_EXECUTION_ERROR";
    },
    "Should reject and avoid mock when mock is disabled in rest",
  );

  // Restore builder/test environment
  if (origNodeEnv) {
    process.env.NODE_ENV = origNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }
  delete process.env.ENABLE_SIMULATION_FALLBACK;
  delete process.env.ALLOW_MOCK_FALLBACK;
  process.env.IS_BUILDER = "true";
  process.env.CONTAINER_ROLE = "builder";
});

test("ModelConnectorClient - verifies model-agnostic default model resolution", () => {
  assert.equal(ModelCatalogDefaults.DEFAULT_MODEL, "gemini-3.8-flash");
  assert.ok(ModelCatalogDefaults.DEFAULT_MODEL, "Universal default model key is defined");
});

test("ModelPropertyResolverRegistry - propagates UI credentials to Gemini, Claude, Copilot, and LFM3 CLI specs", () => {
  const registry = ModelPropertyResolverRegistry.getInstance();
  const geminiResolver = registry.resolve("gemini-3.8-flash");
  const geminiOAuthSpec = geminiResolver.resolveCliCommand("gemini-3.8-flash", undefined, "ya29.test-oauth-token");
  assert.equal(geminiOAuthSpec.binary, "gemini");
  assert.equal(geminiOAuthSpec.env?.GOOGLE_GENAI_USE_GCA, "true");
  assert.equal(geminiOAuthSpec.env?.GOOGLE_CLOUD_ACCESS_TOKEN, "ya29.test-oauth-token");

  const claudeResolver = registry.resolve("claude-3-7-sonnet");
  const claudeOAuthSpec = claudeResolver.resolveCliCommand("claude-3-7-sonnet", "sess-1", "sk-ant-oat01-token");
  assert.equal(claudeOAuthSpec.binary, "claude");
  assert.ok(claudeOAuthSpec.args.includes("--print"), "Claude CLI uses headless --print flag");
  assert.equal(claudeOAuthSpec.env?.CLAUDE_CODE_OAUTH_TOKEN, "sk-ant-oat01-token");

  const copilotResolver = registry.resolve("copilot-claude-3.5-sonnet");
  const copilotSpec = copilotResolver.resolveCliCommand("copilot-claude-3.5-sonnet", undefined, "gho_copilot_token");
  assert.equal(copilotSpec.binary, "github-copilot-cli");
  assert.equal(copilotSpec.env?.GITHUB_TOKEN, "gho_copilot_token");
  assert.equal(copilotSpec.env?.GH_TOKEN, "gho_copilot_token");

  const lfm3Resolver = registry.resolve("lfm3-omni");
  const lfm3Spec = lfm3Resolver.resolveCliCommand("lfm3-omni");
  assert.equal(lfm3Spec.binary, "ollama");
  assert.deepEqual(lfm3Spec.args, ["run", "lfm3-omni"]);
  assert.ok(lfm3Spec.env?.OLLAMA_HOST !== undefined, "Ollama CLI spec sets OLLAMA_HOST for container communication");
});

test("ModelConnectorClient - binds user-specific and task-specific response to request", async () => {
  const client = ClientFactory.createCliClient();
  const res = await client.execute({
    prompt: "Generate deployment status",
    model: "gemini-3.8-flash",
    userId: "eng-user-88",
    userEmail: "eng88@company.com",
    taskId: "task-deploy-build-42",
    requestId: "req-unique-999",
  });

  assert.strictEqual(res.userId, "eng-user-88");
  assert.strictEqual(res.userEmail, "eng88@company.com");
  assert.strictEqual(res.taskId, "task-deploy-build-42");
  assert.strictEqual(res.requestId, "req-unique-999");
  assert.ok(res.content.length > 0);
});

test("ModelConnectorClient - builds model-specific OAuth URL with interactive chooser routing", () => {
  const client = ClientFactory.createDefault();
  const oauthConfig = client.buildOAuthAuthorizationConfig({
    modelId: "gemini-3.8-flash",
    userEmail: "engineer@company.com",
  });

  assert.strictEqual(oauthConfig.prompt, "select_account consent");
  assert.ok(oauthConfig.executableLaunchUrl.includes("oauth2/authorize"));
  assert.strictEqual(oauthConfig.usesLoopbackAccountChooser, true);
});
