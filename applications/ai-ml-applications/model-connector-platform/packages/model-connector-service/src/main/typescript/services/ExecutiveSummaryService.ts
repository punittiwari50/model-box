import {
  ExecutiveSummaryEngine,
  type ExecutiveSummaryDigest,
  type IModelTextClient,
} from "@model-box/model-connector-core";
import { taskStateAggregator } from "@/services/TaskStateAggregatorService";
import { modelService } from "@/services/modelService";

/**
 * Enterprise Executive Summary Service.
 * Conforms to:
 * - UC-11 §4.2: Milestone Digest Synthesis & Deterministic Fallback Engine
 * - SLA Guarantee: Milestone digests synthesized within <= 800ms
 */
export class ExecutiveSummaryService {
  private readonly engine: ExecutiveSummaryEngine;

  public constructor() {
    const textClient: IModelTextClient = {
      generateText: async (prompt: string) => {
        const client = modelService.getClient();
        const res = await client.execute({
          prompt,
          model: "gemini-3.8-flash",
          strategy: "api",
        });
        return { text: res.content };
      },
    };

    this.engine = new ExecutiveSummaryEngine(
      taskStateAggregator,
      taskStateAggregator,
      textClient,
      800, // 800ms SLA
    );
  }

  public async generateMilestoneDigest(
    tenantId: string,
    userId: string,
  ): Promise<ExecutiveSummaryDigest> {
    return this.engine.generateMilestoneDigest(tenantId, userId);
  }

  public async getLatestSummary(
    tenantId: string,
    userId: string,
  ): Promise<ExecutiveSummaryDigest | undefined> {
    return taskStateAggregator.findLatestSummary(tenantId, userId);
  }
}

export const executiveSummaryService = new ExecutiveSummaryService();
