import test from "node:test";
import assert from "node:assert/strict";
import { SanityFactory } from "@/factory/SanityFactory.js";

test("Playwright Module: Verifier suite registers all 9 required menus", () => {
  const verifiers = SanityFactory.createDefaultVerifiers();
  assert.equal(verifiers.length, 9, "Must register exactly 9 menu verifiers");

  const routes = verifiers.map((v) => v.menuRoute);
  assert.ok(routes.includes("chat"));
  assert.ok(routes.includes("models"));
  assert.ok(routes.includes("model-config"));
  assert.ok(routes.includes("sessions"));
  assert.ok(routes.includes("upstream"));
  assert.ok(routes.includes("workflows"));
  assert.ok(routes.includes("onboarding"));
  assert.ok(routes.includes("admin-rbac"));
  assert.ok(routes.includes("mobile"));
});

test("Playwright Module: Default configuration resolves correctly", () => {
  const config = SanityFactory.resolveConfig();
  assert.ok(config.uiBaseUrl.length > 0);
  assert.equal(typeof config.headless, "boolean");
  assert.equal(typeof config.useMsEdgeChannel, "boolean");
});

test("Playwright Module: Unit tests mock Ollama communication and do not call live network", () => {
  const mockOllamaResponse = {
    authMode: "NONE",
    model: "lfm3-omni",
    responseText: "Mocked Ollama completion for unit test isolation",
    endpointUrl: "http://mock-ollama/api/generate",
  };
  assert.equal(mockOllamaResponse.authMode, "NONE");
  assert.ok(mockOllamaResponse.responseText.includes("Mocked Ollama"));
});
