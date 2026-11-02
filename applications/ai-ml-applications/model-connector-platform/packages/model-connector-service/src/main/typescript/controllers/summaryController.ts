import type { Request, Response } from "express";
import { HttpStatus } from "@/constants/index";
import { executiveSummaryService } from "@/services/ExecutiveSummaryService";
import { taskStateAggregator } from "@/services/TaskStateAggregatorService";
import { WorkflowResumptionController } from "@/services/WorkflowResumptionController";

/**
 * Controller for UC-11 Executive Summaries & Workflow Resumption.
 */
export class SummaryController {
  public async getLatestSummary(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.headers["x-tenant-id"] as string) || "default-tenant";
      const userId = (req.headers["x-user-id"] as string) || "default-user";

      const summary = await executiveSummaryService.getLatestSummary(tenantId, userId);
      if (!summary) {
        // Synthesize milestone digest if no summary persisted yet
        const newSummary = await executiveSummaryService.generateMilestoneDigest(tenantId, userId);
        res.status(HttpStatus.OK).json({ success: true, ...newSummary });
        return;
      }

      res.status(HttpStatus.OK).json({ success: true, ...summary });
    } catch (err: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: { message: err.message || "Failed to retrieve executive summary" },
      });
    }
  }

  public async generateSummary(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.headers["x-tenant-id"] as string) || req.body.tenantId || "default-tenant";
      const userId = (req.headers["x-user-id"] as string) || req.body.userId || "default-user";

      const digest = await executiveSummaryService.generateMilestoneDigest(tenantId, userId);
      res.status(HttpStatus.OK).json({ success: true, ...digest });
    } catch (err: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: { message: err.message || "Failed to generate summary" },
      });
    }
  }

  public async recordTaskTransition(req: Request, res: Response): Promise<void> {
    try {
      const { taskId, tenantId, userId, taskType, status, metadata, executionOutputSummary } = req.body;
      const event = await taskStateAggregator.recordTaskTransition(
        taskId,
        tenantId || "default-tenant",
        userId || "default-user",
        taskType || "GENERIC_TASK",
        status || "COMPLETED",
        metadata,
        executionOutputSummary,
      );
      res.status(HttpStatus.OK).json({ success: true, event });
    } catch (err: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: { message: err.message || "Failed to record task transition" },
      });
    }
  }

  public async resumeWorkflow(req: Request, res: Response): Promise<void> {
    try {
      const { steps, tenantSecret } = req.body || {};
      if (!tenantSecret) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: { message: "tenantSecret is required to evaluate workflow resumption" },
        });
        return;
      }
      const decision = WorkflowResumptionController.evaluateResumption(steps || [], tenantSecret);
      res.status(HttpStatus.OK).json({ success: true, ...decision });
    } catch (err: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: { message: err.message || "Failed to evaluate workflow resumption" },
      });
    }
  }
}

export const summaryController = new SummaryController();
