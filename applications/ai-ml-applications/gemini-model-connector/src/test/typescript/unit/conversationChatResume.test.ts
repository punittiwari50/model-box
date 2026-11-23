import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { dataSourceManager } from "@/core/datasource/dataSourceManager.js";
import { dataSourceInitialLoader } from "@/core/datasource/initialLoader.js";
import { conversationService } from "@/services/conversation/conversationService.js";
import { GeminiCliStrategy } from "@/core/cli/cliCommandStrategy.js";
import { ModelCatalog } from "@/domain/constants/index.js";

describe("Conversation Chat & Session Resume Logic", () => {
  before(async () => {
    const driver = await dataSourceManager.getDriver();
    await dataSourceInitialLoader.loadAndExecute(driver, ":memory:");
  });

  after(async () => {
    await dataSourceManager.close();
  });

  it("GeminiCliStrategy should append --resume flag when resume is enabled with sessionId", () => {
    const strategy = new GeminiCliStrategy();
    const argsWithoutResume = strategy.buildCommandArgs(
      "gemini",
      ModelCatalog.GEMINI_3_8_FLASH,
      "Hello",
      {
        prompt: "Hello",
        sessionId: "sess-abc-123",
        resume: false,
      },
    );
    assert.ok(!argsWithoutResume.includes("--resume"));

    const argsWithResume = strategy.buildCommandArgs(
      "gemini",
      ModelCatalog.GEMINI_3_8_FLASH,
      "Follow up prompt",
      {
        prompt: "Follow up prompt",
        sessionId: "sess-abc-123",
        resume: true,
      },
    );
    assert.ok(argsWithResume.includes("--resume"));
    const resumeIndex = argsWithResume.indexOf("--resume");
    assert.strictEqual(argsWithResume[resumeIndex + 1], "sess-abc-123");
  });

  it("should start a new chat conversation and persist required session info in DB", async () => {
    const chatResult = await conversationService.chat({
      content: "Explain quantum computing in one sentence",
      title: "Quantum Chat",
      model: ModelCatalog.GEMINI_3_8_FLASH,
      mode: "mock",
    });

    assert.ok(chatResult.conversation.id);
    assert.ok(chatResult.conversation.session_id);
    assert.strictEqual(
      chatResult.userMessage.content,
      "Explain quantum computing in one sentence",
    );
    assert.ok(chatResult.assistantMessage.content.length > 0);

    const stored = await conversationService.getConversation(
      chatResult.conversation.id,
    );
    assert.ok(stored);
    assert.strictEqual(stored?.session_id, chatResult.conversation.session_id);
    assert.strictEqual(stored?.messages?.length, 2);
  });

  it("should continue the same chat conversation and update session metadata", async () => {
    // Step 1: Create initial conversation
    const initial = await conversationService.chat({
      content: "What is Node.js?",
      title: "Node Tech Thread",
      mode: "mock",
    });

    const conversationId = initial.conversation.id;
    const initialSessionId = initial.conversation.session_id;

    // Step 2: Continue same conversation via chat() with conversation_id
    const turn2 = await conversationService.chat({
      conversation_id: conversationId,
      content: "What are its event loops?",
      mode: "mock",
      resume: true,
    });

    assert.strictEqual(turn2.conversation.id, conversationId);
    assert.strictEqual(turn2.conversation.session_id, initialSessionId);
    assert.strictEqual(turn2.userMessage.content, "What are its event loops?");

    // Step 3: Verify all turns exist in database
    const thread = await conversationService.getConversation(conversationId);
    assert.ok(thread);
    assert.strictEqual(thread?.messages?.length, 4); // 2 turns = 4 messages (user, assistant, user, assistant)
    const metadata = thread?.metadata as Record<string, any>;
    assert.strictEqual(metadata.total_turns, 2);
  });

  it("should resume an existing chat conversation via resumeConversation endpoint logic", async () => {
    const conv = await conversationService.createConversation({
      title: "Resume Test Thread",
      model: ModelCatalog.GEMINI_3_8_FLASH,
    });

    const resumeResult = await conversationService.resumeConversation(conv.id, {
      content: "Resuming conversation with new query",
      mode: "mock",
    });

    assert.ok(resumeResult.conversation);
    assert.ok(resumeResult.turnResult);
    assert.strictEqual(
      resumeResult.turnResult?.userMessage.content,
      "Resuming conversation with new query",
    );

    const meta = resumeResult.conversation.metadata as Record<string, any>;
    assert.strictEqual(meta.is_resumed, true);
    assert.strictEqual(meta.resumed_count, 1);
    assert.ok(meta.last_resumed_at);
  });
});
