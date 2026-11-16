import test from "node:test";
import assert from "node:assert/strict";
import { taskStateAggregator } from "@/services/TaskStateAggregatorService";
import { executiveSummaryService } from "@/services/ExecutiveSummaryService";
import { summaryController } from "@/controllers/summaryController";

test("TaskStateAggregatorService - records task state transitions and preserves history", async () => {
  const tenantId = "tenant-agg-1";
  const userId = "user-agg-1";
  const taskId = "task-1001";

  // 1. Initial transition: PENDING
  const event1 = await taskStateAggregator.recordTaskTransition(
    taskId,
    tenantId,
    userId,
    "RESUME_PARSING",
    "PENDING",
    { documentId: "doc-99" },
  );
  assert.equal(event1.taskId, taskId);
  assert.equal(event1.status, "PENDING");

  // 2. Transition to RUNNING
  const event2 = await taskStateAggregator.recordTaskTransition(
    taskId,
    tenantId,
    userId,
    "RESUME_PARSING",
    "RUNNING",
    { progress: 50 },
  );
  assert.equal(event2.taskId, taskId);
  assert.equal(event2.status, "RUNNING");

  // 3. Complete task
  const event3 = await taskStateAggregator.recordTaskTransition(
    taskId,
    tenantId,
    userId,
    "RESUME_PARSING",
    "COMPLETED",
    { score: 95 },
    "Resume parsed successfully with 95% match",
  );
  assert.equal(event3.status, "COMPLETED");
  assert.equal(event3.executionOutputSummary, "Resume parsed successfully with 95% match");

  // Check recent unsummarized events
  const events = await taskStateAggregator.getRecentUnsummarizedEvents(tenantId, userId);
  assert.ok(events.length >= 3);
  assert.equal(events[0].taskId, taskId);
});

test("ExecutiveSummaryService - synthesizes milestone digest and aggregates active tasks", async () => {
  const tenantId = "tenant-summary-1";
  const userId = "user-summary-1";

  // Create an active task and a completed task
  await taskStateAggregator.recordTaskTransition("task-active", tenantId, userId, "JOB_PIPELINE", "RUNNING");
  await taskStateAggregator.recordTaskTransition("task-done", tenantId, userId, "SKILL_COMPILATION", "COMPLETED", {}, "Compiled 4 tools");

  const digest = await executiveSummaryService.generateMilestoneDigest(tenantId, userId);

  assert.ok(digest.summaryId.toUpperCase().startsWith("SUM-"));
  assert.equal(digest.tenantId, tenantId);
  assert.equal(digest.userId, userId);
  assert.ok(digest.completedTasksCount >= 1);
  assert.ok(digest.highLevelHighlights.length > 0);

  // Retrieve latest summary
  const latest = await executiveSummaryService.getLatestSummary(tenantId, userId);
  assert.ok(latest);
  assert.equal(latest?.summaryId, digest.summaryId);
});

test("SummaryController - handles requests with proper HTTP responses", async () => {
  let responseData: any = null;
  let responseStatus = 200;

  const mockRes: any = {
    status(code: number) {
      responseStatus = code;
      return this;
    },
    json(body: any) {
      responseData = body;
      return this;
    },
  };

  const mockReq: any = {
    headers: { "x-tenant-id": "mock-tenant", "x-user-id": "mock-user" },
    body: {
      taskId: "task-ctrl-1",
      taskType: "AUDIT_PIPELINE",
      status: "COMPLETED",
      metadata: { items: 12 },
    },
  };

  await summaryController.recordTaskTransition(mockReq, mockRes);
  assert.equal(responseStatus, 200);
  assert.equal(responseData.success, true);
  assert.equal(responseData.event.taskId, "task-ctrl-1");

  // Generate summary
  await summaryController.generateSummary(mockReq, mockRes);
  assert.equal(responseStatus, 200);
  assert.equal(responseData.success, true);
  assert.ok(responseData.summaryId);
  assert.ok(responseData.highLevelHighlights);
});
