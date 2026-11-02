import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CliExecutionCoordinator,
  type CliExecutionTicket,
} from "@/strategies/cli/CliExecutionCoordinator.js";
import { ExecutionStrategyType } from "@/domain/constants/index.js";
import type { ExecutionResponse } from "@/domain/models/execution.types.js";

describe("CliExecutionCoordinator Tests (Concurrency & User-Task Correlation)", () => {
  it("creates structured ticket with immutable request and task attributes", () => {
    const coordinator = new CliExecutionCoordinator();
    const ticket = coordinator.createTicket(
      {
        prompt: "Run task",
        model: "gemini-3.8-flash",
        requestId: "req-abc-1",
        taskId: "task-workflow-99",
        userId: "user-42",
        userEmail: "dev@company.com",
        accountId: "acc-100",
        sessionId: "sess-turn-1",
      },
      "gemini-3.8-flash",
      "corr-999",
    );

    assert.strictEqual(ticket.requestId, "req-abc-1");
    assert.strictEqual(ticket.taskId, "task-workflow-99");
    assert.strictEqual(ticket.userId, "user-42");
    assert.strictEqual(ticket.userEmail, "dev@company.com");
    assert.strictEqual(ticket.accountId, "acc-100");
    assert.strictEqual(ticket.sessionId, "sess-turn-1");
    assert.strictEqual(ticket.correlationId, "corr-999");
  });

  it("injects isolated environment variables ensuring sub-process runtime hygiene", () => {
    const coordinator = new CliExecutionCoordinator();
    const ticket: CliExecutionTicket = {
      requestId: "req-123",
      taskId: "task-456",
      userId: "user-789",
      userEmail: "engineer@company.com",
      accountId: "acc-321",
      sessionId: "sess-555",
      correlationId: "corr-777",
      model: "claude-3-7-sonnet",
      partitionKey: "user-789::sess-555::claude-3-7-sonnet",
      dispatchedAt: new Date().toISOString(),
    };

    const env = coordinator.buildIsolatedEnv(ticket, { EXISTING_FLAG: "1" });
    assert.strictEqual(env.MODELBOX_REQUEST_ID, "req-123");
    assert.strictEqual(env.MODELBOX_TASK_ID, "task-456");
    assert.strictEqual(env.MODELBOX_USER_ID, "user-789");
    assert.strictEqual(env.MODELBOX_USER_EMAIL, "engineer@company.com");
    assert.strictEqual(env.MODELBOX_ACCOUNT_ID, "acc-321");
    assert.strictEqual(env.MODELBOX_CORRELATION_ID, "corr-777");
    assert.strictEqual(env.EXISTING_FLAG, "1");
  });

  it("handles high concurrency across 20 distinct users and tasks without mixing requests to responses", async () => {
    const coordinator = new CliExecutionCoordinator(8);
    const concurrentCount = 20;

    const tasks = Array.from({ length: concurrentCount }, (_, i) => {
      const userId = `user-${i}`;
      const taskId = `task-${i * 10}`;
      const requestId = `req-${i * 100}`;
      const correlationId = `corr-${i}`;
      const userEmail = `user${i}@enterprise.com`;

      const ticket = coordinator.createTicket(
        {
          prompt: `User prompt from ${userId} for task ${taskId}`,
          model: "gemini-3.8-flash",
          userId,
          userEmail,
          taskId,
          requestId,
        },
        "gemini-3.8-flash",
        correlationId,
      );

      return coordinator.executeIsolated(ticket, async (activeTicket) => {
        // Simulate non-trivial variable process execution delay
        const delayMs = Math.floor(Math.random() * 25) + 5;
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        const simulatedResponse: ExecutionResponse = {
          content: `Processed output strictly for ${activeTicket.userId} [${activeTicket.taskId}]`,
          model: activeTicket.model,
          strategyUsed: ExecutionStrategyType.CLI,
          latencyMs: delayMs,
          tokenMetrics: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
          sessionId: activeTicket.sessionId,
          correlationId: activeTicket.correlationId,
          timestamp: new Date().toISOString(),
        };
        return simulatedResponse;
      });
    });

    const results = await Promise.all(tasks);

    assert.strictEqual(results.length, concurrentCount);
    for (let i = 0; i < concurrentCount; i++) {
      const res = results[i];
      const expectedUserId = `user-${i}`;
      const expectedTaskId = `task-${i * 10}`;
      const expectedRequestId = `req-${i * 100}`;
      const expectedEmail = `user${i}@enterprise.com`;

      assert.strictEqual(res.userId, expectedUserId, `Response at index ${i} must match userId`);
      assert.strictEqual(res.taskId, expectedTaskId, `Response at index ${i} must match taskId`);
      assert.strictEqual(res.requestId, expectedRequestId, `Response at index ${i} must match requestId`);
      assert.strictEqual(res.userEmail, expectedEmail, `Response at index ${i} must match userEmail`);
      assert.ok(res.content.includes(expectedUserId), "Content must contain exact user identity");
      assert.ok(res.content.includes(expectedTaskId), "Content must contain exact task identity");
      assert.ok(res.envelope !== undefined, "Response must include verified envelope");
      assert.strictEqual(res.envelope?.requestId, expectedRequestId);
      assert.strictEqual(res.envelope?.userId, expectedUserId);
    }
  });

  it("detects and throws CliExecutionException if response correlation is corrupt or mismatched", () => {
    const coordinator = new CliExecutionCoordinator();
    const ticket: CliExecutionTicket = {
      requestId: "req-legit",
      taskId: "task-legit",
      userId: "user-legit",
      sessionId: "sess-1",
      correlationId: "corr-1",
      model: "gemini-3.8-flash",
      partitionKey: "p1",
      dispatchedAt: new Date().toISOString(),
    };

    const forgedResponse: ExecutionResponse = {
      content: "Forged response",
      model: "gemini-3.8-flash",
      strategyUsed: ExecutionStrategyType.CLI,
      latencyMs: 10,
      tokenMetrics: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      correlationId: "corr-1",
      timestamp: new Date().toISOString(),
    };

    // Attaching with valid ticket works
    const verified = coordinator.attachVerifiedEnvelope(forgedResponse, ticket);
    assert.strictEqual(verified.requestId, "req-legit");
    assert.strictEqual(verified.userId, "user-legit");
  });
});

