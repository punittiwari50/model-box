import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutiveSummaryEngine } from "@/domain/services/ExecutiveSummaryEngine.js";
import type {
  TaskEvent,
  ITaskRepository,
  ISummaryRepository,
  IModelTextClient,
  ExecutiveSummaryDigest,
} from "@/domain/models/executiveSummary.types.js";

describe("ExecutiveSummaryEngine Tests (UC-11)", () => {
  const mockEvents: TaskEvent[] = [
    {
      taskId: "TASK-01",
      tenantId: "TENANT-1",
      userId: "USER-1",
      taskType: "JOB_APPLICATION",
      status: "COMPLETED",
      executionOutputSummary: "Applied to Acme Corp",
    },
    {
      taskId: "TASK-02",
      tenantId: "TENANT-1",
      userId: "USER-1",
      taskType: "JOB_APPLICATION",
      status: "COMPLETED",
      executionOutputSummary: "Applied to CloudTech",
    },
    {
      taskId: "TASK-03",
      tenantId: "TENANT-1",
      userId: "USER-1",
      taskType: "FOLLOWUP_DISPATCH",
      status: "FAILED",
      executionOutputSummary: "SMTP network timeout",
    },
  ];

  it("synthesizes milestone digest with model client", async () => {
    let savedDigest: ExecutiveSummaryDigest | undefined;
    const taskRepo: ITaskRepository = {
      async getRecentUnsummarizedEvents() {
        return mockEvents;
      },
    };
    const summaryRepo: ISummaryRepository = {
      async persist(digest) {
        savedDigest = digest;
      },
    };
    const modelClient: IModelTextClient = {
      async generateText() {
        return {
          text: "• Applied to 2 jobs successfully\n• Follow-up notification flagged for retry",
        };
      },
    };

    const engine = new ExecutiveSummaryEngine(taskRepo, summaryRepo, modelClient);
    const digest = await engine.generateMilestoneDigest("TENANT-1", "USER-1");

    assert.strictEqual(digest.completedTasksCount, 2);
    assert.strictEqual(digest.failedTasksCount, 1);
    assert.strictEqual(digest.highLevelHighlights.length, 2);
    assert.strictEqual(savedDigest?.summaryId, digest.summaryId);
  });

  it("falls back to deterministic template when model client throws error", async () => {
    const taskRepo: ITaskRepository = {
      async getRecentUnsummarizedEvents() {
        return mockEvents;
      },
    };
    const summaryRepo: ISummaryRepository = {
      async persist() {},
    };
    const failingModelClient: IModelTextClient = {
      async generateText() {
        throw new Error("HTTP 504 Gateway Timeout");
      },
    };

    const engine = new ExecutiveSummaryEngine(taskRepo, summaryRepo, failingModelClient);
    const digest = await engine.generateMilestoneDigest("TENANT-1", "USER-1");

    assert.strictEqual(digest.summaryId.startsWith("SUM-FALLBACK-"), true);
    assert.strictEqual(digest.completedTasksCount, 2);
    assert.strictEqual(digest.failedTasksCount, 1);
    assert.strictEqual(digest.highLevelHighlights.length, 2);
    assert.strictEqual(digest.highLevelHighlights[0], "• Processed 2 automated tasks successfully");
  });

  it("falls back to deterministic template when model SLA is exceeded", async () => {
    const taskRepo: ITaskRepository = {
      async getRecentUnsummarizedEvents() {
        return mockEvents;
      },
    };
    const summaryRepo: ISummaryRepository = {
      async persist() {},
    };
    const slowModelClient: IModelTextClient = {
      async generateText() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { text: "• Slow response" };
      },
    };

    // Timeout limit set to 50ms (well under 200ms)
    const engine = new ExecutiveSummaryEngine(taskRepo, summaryRepo, slowModelClient, 50);
    const digest = await engine.generateMilestoneDigest("TENANT-1", "USER-1");

    assert.strictEqual(digest.summaryId.startsWith("SUM-FALLBACK-"), true);
    assert.strictEqual(digest.completedTasksCount, 2);
    assert.strictEqual(digest.failedTasksCount, 1);
  });
});
