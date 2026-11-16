import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { dataSourceManager } from "@/core/datasource/dataSourceManager.js";
import { conversationRepo } from "@/repositories/conversationRepository.js";
import { auditRepo } from "@/repositories/auditRepository.js";
import { dataSourceInitialLoader } from "@/core/datasource/initialLoader.js";

describe("Repository Integration (Uppercase Tables, Columns & DDL Loader)", () => {
  before(async () => {
    const driver = await dataSourceManager.getDriver();
    await dataSourceInitialLoader.loadAndExecute(driver, ":memory:");
  });

  after(async () => {
    await dataSourceManager.close();
  });

  it("should create and retrieve conversation with uppercase table and column mapping", async () => {
    const created = await conversationRepo.createConversation({
      title: "Integration Test Conversation",
      model: "gemini-3.8-flash",
      system_instruction: "Test instruction",
      tags: ["test", "integration"],
      metadata: { env: "ci" },
    });

    assert.ok(created.id);
    assert.strictEqual(created.title, "Integration Test Conversation");
    assert.strictEqual(created.model, "gemini-3.8-flash");

    const retrieved = await conversationRepo.getConversation(created.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved?.id, created.id);
    assert.strictEqual(retrieved?.title, "Integration Test Conversation");
    assert.deepStrictEqual(retrieved?.tags, ["test", "integration"]);
  });

  it("should add messages and context with capitalized columns", async () => {
    const conv = await conversationRepo.createConversation({
      title: "Context Test Conv",
      model: "gemini-3.8-flash",
    });

    const msg = await conversationRepo.addMessage({
      conversation_id: conv.id,
      role: "user",
      content: "Hello World from test",
    });

    assert.ok(msg.id);
    assert.strictEqual(msg.content, "Hello World from test");

    const ctx = await conversationRepo.addContext({
      conversation_id: conv.id,
      context_type: "resume",
      title: "Candidate Resume",
      content: "Senior Software Engineer with 10 years experience",
    });

    assert.ok(ctx.id);
    assert.strictEqual(ctx.title, "Candidate Resume");

    const fullConv = await conversationRepo.getConversation(conv.id);
    assert.strictEqual(fullConv?.messages?.length, 1);
    assert.strictEqual(fullConv?.contexts?.length, 1);
  });

  it("should log audit event into capitalized AUDIT_LOGS table", async () => {
    const logged = await auditRepo.logEvent({
      action: "TEST_AUDIT",
      client_ip: "127.0.0.1",
      model_used: "gemini-3.8-flash",
      status: "SUCCESS",
      details: { test: true },
    });

    assert.ok(logged.id);
    assert.strictEqual(logged.action, "TEST_AUDIT");

    const events = await auditRepo.queryLogs({ limit: 10 });
    assert.ok(events.some((e: any) => e.id === logged.id));
  });

  it("should support optimistic locking and reject concurrent stale updates", async () => {
    const created = await conversationRepo.createConversation({
      title: "Optimistic Lock Target",
      model: "gemini-3.8-flash",
    });

    assert.strictEqual(created.version, 1);

    // First update with version 1 -> succeeds, increments to 2
    const updated = await conversationRepo.updateWithOptimisticLock(
      created.id,
      1,
      {
        title: "Updated Title First Pass",
      },
    );
    assert.strictEqual(updated.version, 2);
    assert.strictEqual(updated.title, "Updated Title First Pass");

    // Stale update using version 1 -> throws OptimisticLockException
    await assert.rejects(
      async () => {
        await conversationRepo.updateWithOptimisticLock(created.id, 1, {
          title: "Stale Concurrent Update",
        });
      },
      (err: any) => {
        return err.name === "OptimisticLockException";
      },
    );
  });

  it("should persist and query session_id and support updating session metadata", async () => {
    const customSession = "cli-sess-test-12345";
    const conv = await conversationRepo.createConversation({
      title: "Session Resume Conv",
      model: "gemini-3.8-flash",
      session_id: customSession,
    });

    assert.strictEqual(conv.session_id, customSession);

    const foundBySession =
      await conversationRepo.findBySessionId(customSession);
    assert.ok(foundBySession);
    assert.strictEqual(foundBySession?.id, conv.id);
    assert.strictEqual(foundBySession?.session_id, customSession);

    await conversationRepo.updateSessionId(conv.id, "cli-sess-updated-67890");
    const updated = await conversationRepo.getConversation(conv.id);
    assert.strictEqual(updated?.session_id, "cli-sess-updated-67890");

    await conversationRepo.updateMetadata(conv.id, {
      is_resumed: true,
      resumed_count: 2,
    });
    const withMeta = await conversationRepo.getConversation(conv.id);
    assert.strictEqual((withMeta?.metadata as any)?.is_resumed, true);
    assert.strictEqual((withMeta?.metadata as any)?.resumed_count, 2);
  });
});
