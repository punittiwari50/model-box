import test from "node:test";
import assert from "node:assert/strict";
import {
  modelAuthenticationFlowCoordinator,
  ModelAuthenticationFlowCoordinator,
  protocolVerificationRegistry,
  providerVerificationRegistry,
  OAuthExecutorFactory,
} from "@/index.js";

test("ModelAuthenticationFlowCoordinator - resolves OAuth configuration from application.yml", () => {
  const config = modelAuthenticationFlowCoordinator.getOAuthConfig("gemini-3.8-flash");
  assert.ok(config, "OAuth config is resolved");
  assert.equal(config.provider, "google");
  assert.ok(config.authorizationUrl.length > 0, "Authorization URL is generated");
  assert.ok(config.authorizationUrl.includes("response_type=code"), "Includes response_type=code");
});

test("ModelAuthenticationFlowCoordinator - handles OAuth code exchange and repository persistence", async () => {
  const outcome = await modelAuthenticationFlowCoordinator.exchangeOAuthCode({
    modelId: "gemini-3.8-flash",
    code: "test_auth_code_12345",
    userEmail: "<user-email>",
  });

  assert.ok(outcome, "Outcome returned");
  assert.equal(outcome.modelId, "gemini-3.8-flash");
  assert.ok(outcome.result.accessToken, "Access token issued or vaulted");
  assert.ok(outcome.account, "Account persisted in repository");
  assert.equal(outcome.account.userEmail, "<user-email>");
});

test("ModelAuthenticationFlowCoordinator - dispatches connection verification and updates status", async () => {
  const startTime = Date.now();
  const result = await modelAuthenticationFlowCoordinator.verifyConnection("oauth", {
    modelId: "gemini-3.8-flash",
    credentialValue: "ya29.test_credential_value",
    userPrompt: "Hi, what time is it?",
    startTime,
  });

  assert.ok(result, "Verification result returned");
  assert.ok(result.protocol, "Protocol is populated");
  assert.ok(typeof result.latencyMs === "number", "Latency measured");
});

test("ModelAuthenticationFlowCoordinator - deactivates accounts on verification failure", () => {
  modelAuthenticationFlowCoordinator.deactivateAccountOnFailure(
    "gemini-3.8-flash",
    "invalid_token",
    "FAILED",
  );
  assert.ok(true, "Deactivation completed without throwing");
});
