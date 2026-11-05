import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  LocalDirectoryVcsService,
  DirectoryAccountSyncService,
  GeminiCliJsonCredentialExtractor,
  ClaudeCredentialExtractor,
  ChatGptCredentialExtractor,
  credentialExtractorRegistry,
  coreDatabaseManager,
  fileUtils,
  pathUtils,
  processUtils,
} from "@/index.js";

describe("Local Directory VCS & Multi-Account Synchronization", () => {
  const testDir = pathUtils.resolve(processUtils.cwd(), ".test-vcs-credentials");

  before(async () => {
    fileUtils.ensureDirectory(testDir);
    coreDatabaseManager.initDatabase();
  });

  after(() => {
    try {
      if (fileUtils.exists(testDir)) {
        const entries = fileUtils.readdirSync(testDir);
        for (const entry of entries) {
          const full = pathUtils.join(testDir, entry);
          if (!fileUtils.isDirectory(full)) {
            fileUtils.unlinkSync(full);
          }
        }
      }
    } catch {
      // Cleanup best effort
    }
  });

  describe("LocalDirectoryVcsService", () => {
    it("initializes directory and captures initial baseline snapshot", async () => {
      const vcs = new LocalDirectoryVcsService();
      const ready = await vcs.initializeDirectory(testDir);
      assert.equal(ready, true);

      const baseline = await vcs.captureSnapshot(testDir, "baseline");
      assert.ok(baseline.snapshotId.startsWith("snap-baseline-"));
      assert.equal(baseline.directoryPath, testDir);
    });

    it("detects newly created and modified files via local snapshot diff", async () => {
      const vcs = new LocalDirectoryVcsService();
      const baseline = await vcs.captureSnapshot(testDir, "diff-base");

      // Create a test credentials file
      const credFile = pathUtils.join(testDir, "gemini_oauth_credentials.json");
      const credContent = JSON.stringify({
        access_token: "ya29.test_token_12345",
        email: "multi.user1@gmail.com",
        token_type: "Bearer",
        expires_in: 3600,
      });
      fileUtils.writeFileSync(credFile, credContent);

      const diff = await vcs.detectDiffAndCommit(baseline, "feat: test credential creation");
      assert.equal(diff.hasChanges, true);
      assert.equal(diff.changedFiles.length, 1);
      assert.equal(diff.changedFiles[0].relativePath, "gemini_oauth_credentials.json");
      assert.equal(diff.changedFiles[0].changeType, "CREATED");
    });
  });

  describe("CredentialExtractorStrategies", () => {
    it("extracts Gemini CLI credentials and detects principal email", () => {
      const extractor = new GeminiCliJsonCredentialExtractor();
      const content = JSON.stringify({
        access_token: "ya29.mock_gemini_token",
        email: "personal.developer@gmail.com",
        scope: "https://www.googleapis.com/auth/cloud-platform",
      });

      const supported = extractor.supports("credentials.json", content);
      assert.equal(supported, true);

      const extracted = extractor.extract("credentials.json", content, "gemini-3.8-flash");
      assert.ok(extracted);
      assert.equal(extracted.userEmail, "personal.developer@gmail.com");
      assert.equal(extracted.credentialValue, "ya29.mock_gemini_token");
      assert.equal(extracted.authType, "cli_oauth");
    });

    it("extracts Claude credentials correctly", () => {
      const extractor = new ClaudeCredentialExtractor();
      const content = JSON.stringify({
        apiKey: "sk-ant-api-test-key",
        email: "dev@anthropic.user",
      });

      assert.equal(extractor.supports("claude_credentials.json", content), true);
      const extracted = extractor.extract("claude_credentials.json", content, "claude-3-7-sonnet");
      assert.ok(extracted);
      assert.equal(extracted.credentialValue, "sk-ant-api-test-key");
    });

    it("extracts ChatGPT credentials correctly", () => {
      const extractor = new ChatGptCredentialExtractor();
      const content = JSON.stringify({
        token: "sess-openai-mock-token",
        email: "user@openai.org",
      });

      assert.equal(extractor.supports("chatgpt_token.json", content), true);
      const extracted = extractor.extract("chatgpt_token.json", content, "gpt-4o");
      assert.ok(extracted);
      assert.equal(extracted.credentialValue, "sess-openai-mock-token");
    });
  });

  describe("DirectoryAccountSyncService (Multi-Account Coexistence)", () => {
    it("handles multiple accounts for the same model by persisting distinct records", async () => {
      const syncService = new DirectoryAccountSyncService();

      // Simulate User 1 authentication
      const user1File = pathUtils.join(testDir, "user1_credentials.json");
      fileUtils.writeFileSync(
        user1File,
        JSON.stringify({
          access_token: "ya29.user1_token",
          email: "user1@enterprise.com",
          accountName: "Google Gemini (user1@enterprise.com)",
        }),
      );

      const baseline1 = await syncService.getVcsStatus(testDir);
      assert.equal(baseline1.exists, true);

      const mockDiff1 = {
        snapshotId: "diff-u1",
        baseSnapshotId: "base-u1",
        timestamp: new Date().toISOString(),
        hasChanges: true,
        changedFiles: [
          {
            relativePath: "user1_credentials.json",
            fullPath: user1File,
            changeType: "CREATED" as const,
            content: fileUtils.readFileSync(user1File),
          },
        ],
      };

      const synced1 = await syncService.syncChangedFilesToDatabase(mockDiff1, "gemini-3.8-flash");
      assert.equal(synced1.length, 1);
      assert.equal(synced1[0].userEmail, "user1@enterprise.com");

      // Simulate User 2 authentication for the same model
      const user2File = pathUtils.join(testDir, "user2_credentials.json");
      fileUtils.writeFileSync(
        user2File,
        JSON.stringify({
          access_token: "ya29.user2_token",
          email: "user2@startup.io",
          accountName: "Google Gemini (user2@startup.io)",
        }),
      );

      const mockDiff2 = {
        snapshotId: "diff-u2",
        baseSnapshotId: "base-u2",
        timestamp: new Date().toISOString(),
        hasChanges: true,
        changedFiles: [
          {
            relativePath: "user2_credentials.json",
            fullPath: user2File,
            changeType: "CREATED" as const,
            content: fileUtils.readFileSync(user2File),
          },
        ],
      };

      const synced2 = await syncService.syncChangedFilesToDatabase(mockDiff2, "gemini-3.8-flash");
      assert.equal(synced2.length, 1);
      assert.equal(synced2[0].userEmail, "user2@startup.io");

      // Verify that both accounts exist simultaneously in the database!
      const db = coreDatabaseManager.getDatabase();
      const accounts = db
        .prepare(`SELECT USER_EMAIL as userEmail, IS_ACTIVE as isActive FROM MODEL_ACCOUNTS WHERE MODEL_ID = ? ORDER BY CREATED_TIMESTAMP ASC`)
        .all("gemini-3.8-flash") as Array<{ userEmail: string; isActive: number }>;

      const emails = accounts.map((a) => a.userEmail.toLowerCase());
      assert.ok(emails.includes("user1@enterprise.com"));
      assert.ok(emails.includes("user2@startup.io"));

      // The latest authenticated account (user2) is active, while user1 is preserved!
      const user2Account = accounts.find((a) => a.userEmail.toLowerCase() === "user2@startup.io");
      assert.equal(user2Account?.isActive, 1);
    });
  });
});

