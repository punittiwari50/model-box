import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GeminiCliSessionAuthManager,
  type IGeminiCliSessionAuthManager,
} from "@/auth/GeminiCliSessionAuthManager.js";
import { accountRepository } from "@/auth/ModelAccountRepository.js";
import { GoogleAuthConstants } from "@/domain/constants/index.js";
import type { CliExecutionTicket } from "@/strategies/cli/CliExecutionCoordinator.js";
import { fileUtils, pathUtils } from "@model-box/model-connector-core";

describe("Gemini CLI Session Auth & Custom Location Manager Tests", () => {
  it("formats credential file content matching Gemini CLI oauth_creds.json specification", () => {
    const manager = new GeminiCliSessionAuthManager();
    const content = manager.formatCredentialFileContent({
      access_token: "ya29.test-access-token",
      refresh_token: "1//test-refresh-token",
      token_type: "Bearer",
      scope: "openid https://www.googleapis.com/auth/userinfo.email",
      expiry_date: 1730000000000,
    });

    const parsed = JSON.parse(content);
    assert.strictEqual(parsed.access_token, "ya29.test-access-token");
    assert.strictEqual(parsed.refresh_token, "1//test-refresh-token");
    assert.strictEqual(parsed.token_type, "Bearer");
    assert.strictEqual(parsed.expiry_date, 1730000000000);
  });

  it("resolves default isolated directory for ticket when no custom location is configured", () => {
    const manager = new GeminiCliSessionAuthManager();
    const ticket: CliExecutionTicket = {
      requestId: "req-1",
      taskId: "task-1",
      userId: "user-alice",
      userEmail: "alice@example.com",
      accountId: "acc-alice-1",
      sessionId: "sess-1",
      correlationId: "corr-1",
      model: "gemini-3.8-flash",
      partitionKey: "user-alice::sess-1::gemini-3.8-flash",
      dispatchedAt: new Date().toISOString(),
    };

    const location = manager.resolveCustomAuthLocation(ticket);
    assert.strictEqual(location.isCustom, false);
    assert.ok(location.filePath.endsWith(GoogleAuthConstants.DEFAULT_GEMINI_OAUTH_FILE));
    assert.ok(location.filePath.includes("user-alice"));
    assert.ok(location.filePath.includes("acc-alice-1"));
  });

  it("resolves explicit custom location when configured in user credential", () => {
    const manager = new GeminiCliSessionAuthManager();
    const customPath = pathUtils.resolve("/tmp/custom-auth/gemini/user_custom.json");
    const ticket: CliExecutionTicket = {
      requestId: "req-2",
      taskId: "task-2",
      userId: "user-bob",
      userEmail: "bob@example.com",
      sessionId: "sess-2",
      correlationId: "corr-2",
      model: "gemini-3.8-flash",
      partitionKey: "user-bob::sess-2::gemini-3.8-flash",
      dispatchedAt: new Date().toISOString(),
    };

    const location = manager.resolveCustomAuthLocation(ticket, {
      accountId: "acc-bob",
      modelId: "gemini-3.8-flash",
      accountName: "Bob Personal",
      userEmail: "bob@example.com",
      authType: "cli_oauth",
      isActive: true,
      customLocation: customPath,
    });

    assert.strictEqual(location.isCustom, true);
    assert.strictEqual(location.filePath, customPath);
    assert.strictEqual(location.baseDir, pathUtils.dirname(customPath));
  });

  it("synchronizes credential file to disk location with valid content", () => {
    const manager = new GeminiCliSessionAuthManager();
    const testDir = pathUtils.resolve("/tmp/test-gemini-auth-sync");
    const testFile = pathUtils.join(testDir, "oauth_creds.json");
    const testContent = manager.formatCredentialFileContent({
      access_token: "ya29.mock-sync-token",
      refresh_token: "1//mock-sync-refresh",
    });

    manager.syncCredentialFileToLocation({ baseDir: testDir, filePath: testFile, isCustom: true }, testContent);
    assert.ok(fileUtils.exists(testFile));

    const read = fileUtils.readFileSync(testFile);
    assert.strictEqual(read, testContent);
    if (fileUtils.exists(testFile)) {
      fileUtils.unlinkSync(testFile);
    }
  });

  it("builds isolated CLI environment referencing the custom credential file and isolated home directory", () => {
    const manager = new GeminiCliSessionAuthManager();
    const location = {
      baseDir: pathUtils.resolve("/tmp/gemini-isolated-home"),
      filePath: pathUtils.resolve("/tmp/gemini-isolated-home/oauth_creds.json"),
      isCustom: true,
    };

    const env = manager.buildSessionCliEnvironment(location, { access_token: "ya29.env-token" });
    assert.strictEqual(env[GoogleAuthConstants.ENV_GOOGLE_APPLICATION_CREDENTIALS], location.filePath);
    assert.strictEqual(env[GoogleAuthConstants.ENV_HOME], location.baseDir);
    assert.strictEqual(env[GoogleAuthConstants.ENV_USERPROFILE], location.baseDir);
    assert.strictEqual(env[GoogleAuthConstants.ENV_GOOGLE_GENAI_USE_GCA], "true");
    assert.strictEqual(env[GoogleAuthConstants.ENV_GOOGLE_CLOUD_ACCESS_TOKEN], "ya29.env-token");
  });

  it("persists Google OAuth account with custom location and file content into database", () => {
    const fileContent = JSON.stringify({
      access_token: "ya29.db-test-token",
      refresh_token: "1//db-refresh-token",
    });
    const customLocation = "/tmp/db-auth/gemini/user_db_test.json";

    const account = accountRepository.createGoogleOAuthAccount({
      modelId: "gemini-3.8-flash",
      accountName: "DB Test Google Account",
      userEmail: "dbtest@example.com",
      fileContent,
      customLocation,
      tokens: { access_token: "ya29.db-test-token" },
    });

    assert.ok(account.accountId);
    assert.strictEqual(account.userEmail, "dbtest@example.com");
    assert.strictEqual(account.authType, "cli_oauth");
    assert.strictEqual(account.customLocation, customLocation);
    assert.strictEqual(account.credentialsFileContent, fileContent);

    // Verify lookup by email
    const fetched = accountRepository.getGoogleOAuthAccount("gemini-3.8-flash", "dbtest@example.com");
    assert.ok(fetched);
    assert.strictEqual(fetched?.accountId, account.accountId);

    // Clean up test account
    accountRepository.deleteAccount(account.accountId);
  });

  it("handles multi-user and multi-account credential isolation without collision", () => {
    const manager = new GeminiCliSessionAuthManager();

    const ticketUser1: CliExecutionTicket = {
      requestId: "req-u1",
      taskId: "task-u1",
      userId: "user-alpha",
      userEmail: "alpha@example.com",
      accountId: "acc-alpha",
      sessionId: "sess-u1",
      correlationId: "corr-u1",
      model: "gemini-3.8-flash",
      partitionKey: "user-alpha::sess-u1::gemini-3.8-flash",
      dispatchedAt: new Date().toISOString(),
    };

    const ticketUser2: CliExecutionTicket = {
      requestId: "req-u2",
      taskId: "task-u2",
      userId: "user-beta",
      userEmail: "beta@example.com",
      accountId: "acc-beta",
      sessionId: "sess-u2",
      correlationId: "corr-u2",
      model: "gemini-3.8-flash",
      partitionKey: "user-beta::sess-u2::gemini-3.8-flash",
      dispatchedAt: new Date().toISOString(),
    };

    const loc1 = manager.resolveCustomAuthLocation(ticketUser1);
    const loc2 = manager.resolveCustomAuthLocation(ticketUser2);

    assert.notStrictEqual(loc1.filePath, loc2.filePath);
    assert.notStrictEqual(loc1.baseDir, loc2.baseDir);
    assert.ok(loc1.filePath.includes("user-alpha"));
    assert.ok(loc2.filePath.includes("user-beta"));
  });
});

