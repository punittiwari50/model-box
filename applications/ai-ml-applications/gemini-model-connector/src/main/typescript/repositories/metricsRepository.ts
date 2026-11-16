import { randomUUID } from "node:crypto";
import {
  dataSourceManager,
  type IDataSourceDriver,
} from "@/core/datasource/index.js";
import { logger } from "@/core/observability/logging/logger.js";
import { getCurrentTraceContext } from "@/core/observability/tracing/traceContext.js";

export interface UsageMetricRecord {
  id?: string;
  org_id: string;
  project_id: string;
  model: string;
  execution_mode: string;
  request_count?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost_usd?: number;
  execution_time_ms: number;
  concurrency_level?: number;
  status: "SUCCESS" | "FAILURE" | "DEGRADED";
  trace_id?: string;
  correlation_id?: string;
  metadata?: Record<string, any>;
  created_timestamp?: string;
  update_timestamp?: string;
  created_at?: string;
}

export interface IMetricsRepository {
  recordMetric(metric: UsageMetricRecord): Promise<UsageMetricRecord>;
  queryMetrics(filter: {
    org_id?: string;
    project_id?: string;
    model?: string;
    limit?: number;
    offset?: number;
  }): Promise<readonly UsageMetricRecord[]>;
}

/**
 * Enterprise Metrics & Usage Telemetry Repository.
 * Conforms to Requirement #8:
 * - Logs metrics across performance, concurrency, and costing per project and organization.
 * - Records metrics synchronously/asynchronously to database and structured observability logs.
 */
export class MetricsRepository implements IMetricsRepository {
  private async getDriver(): Promise<IDataSourceDriver> {
    return dataSourceManager.getDriver();
  }

  /**
   * Estimate cost in USD based on model pricing tiers.
   */
  public estimateCostUsd(
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): number {
    const lowerModel = model.toLowerCase();
    // Default tier pricing per 1,000 tokens
    let promptRate = 0.000125;
    let completionRate = 0.000375;

    if (lowerModel.includes("pro")) {
      promptRate = 0.00125;
      completionRate = 0.005;
    } else if (lowerModel.includes("flash")) {
      promptRate = 0.000075;
      completionRate = 0.0003;
    }

    const cost =
      (promptTokens / 1000) * promptRate +
      (completionTokens / 1000) * completionRate;
    return Math.round(cost * 1000000) / 1000000;
  }

  public async recordMetric(
    metric: UsageMetricRecord,
  ): Promise<UsageMetricRecord> {
    const id = metric.id || randomUUID();
    const traceCtx = getCurrentTraceContext();
    const trace_id = metric.trace_id || traceCtx?.traceId;
    const correlation_id = metric.correlation_id || traceCtx?.correlationId;

    const promptTokens = metric.prompt_tokens || 0;
    const completionTokens = metric.completion_tokens || 0;
    const totalTokens = metric.total_tokens || promptTokens + completionTokens;
    const estimatedCost =
      metric.estimated_cost_usd !== undefined
        ? metric.estimated_cost_usd
        : this.estimateCostUsd(metric.model, promptTokens, completionTokens);

    const now = new Date().toISOString();
    const record: UsageMetricRecord = {
      ...metric,
      id,
      request_count: metric.request_count || 1,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      concurrency_level: metric.concurrency_level || 1,
      trace_id,
      correlation_id,
      created_timestamp: now,
      update_timestamp: now,
      created_at: now,
    };

    // 1. Emit structured log conforming to Requirement #8 (logs + database)
    logger.info(
      "METRICS",
      `[Usage Metric] Org: ${record.org_id} | Project: ${record.project_id} | Model: ${record.model} | Latency: ${record.execution_time_ms}ms | Cost: $${record.estimated_cost_usd} | Status: ${record.status}`,
      {
        org_id: record.org_id,
        project_id: record.project_id,
        model: record.model,
        execution_mode: record.execution_mode,
        latency_ms: record.execution_time_ms,
        cost_usd: record.estimated_cost_usd,
        tokens: totalTokens,
      },
    );

    // 2. Persist to database table ORGANIZATION_USAGE_METRICS
    try {
      const driver = await this.getDriver();
      await driver.run(
        `INSERT INTO ORGANIZATION_USAGE_METRICS 
        (ID, ORG_ID, PROJECT_ID, MODEL, EXECUTION_MODE, REQUEST_COUNT, PROMPT_TOKENS, COMPLETION_TOKENS, TOTAL_TOKENS, ESTIMATED_COST_USD, EXECUTION_TIME_MS, CONCURRENCY_LEVEL, STATUS, TRACE_ID, CORRELATION_ID, METADATA, CREATED_TIMESTAMP, UPDATE_TIMESTAMP)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.org_id,
          record.project_id,
          record.model,
          record.execution_mode,
          record.request_count,
          record.prompt_tokens,
          record.completion_tokens,
          record.total_tokens,
          record.estimated_cost_usd,
          record.execution_time_ms,
          record.concurrency_level,
          record.status,
          record.trace_id || null,
          record.correlation_id || null,
          JSON.stringify(record.metadata || {}),
          record.created_timestamp,
          record.update_timestamp,
        ],
      );
    } catch (err: any) {
      logger.warn(
        "METRICS",
        `Failed to persist metrics to database table: ${err.message}`,
      );
    }

    return record;
  }

  public async queryMetrics(filter: {
    org_id?: string;
    project_id?: string;
    model?: string;
    limit?: number;
    offset?: number;
  }): Promise<readonly UsageMetricRecord[]> {
    const driver = await this.getDriver();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter.org_id) {
      conditions.push("ORG_ID = ?");
      params.push(filter.org_id);
    }
    if (filter.project_id) {
      conditions.push("PROJECT_ID = ?");
      params.push(filter.project_id);
    }
    if (filter.model) {
      conditions.push("MODEL = ?");
      params.push(filter.model);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    params.push(limit, offset);

    const rows = await driver.all<any>(
      `SELECT * FROM ORGANIZATION_USAGE_METRICS ${whereClause} ORDER BY CREATED_TIMESTAMP DESC LIMIT ? OFFSET ?`,
      params,
    );

    return rows.map((r) => {
      const createdTimestamp =
        r.CREATED_TIMESTAMP ||
        r.created_timestamp ||
        r.CREATED_AT ||
        r.created_at;
      const updateTimestamp =
        r.UPDATE_TIMESTAMP || r.update_timestamp || createdTimestamp;
      return {
        id: r.ID || r.id,
        org_id: r.ORG_ID || r.org_id,
        project_id: r.PROJECT_ID || r.project_id,
        model: r.MODEL || r.model,
        execution_mode: r.EXECUTION_MODE || r.execution_mode,
        request_count: Number(r.REQUEST_COUNT ?? r.request_count ?? 1),
        prompt_tokens: Number(r.PROMPT_TOKENS ?? r.prompt_tokens ?? 0),
        completion_tokens: Number(
          r.COMPLETION_TOKENS ?? r.completion_tokens ?? 0,
        ),
        total_tokens: Number(r.TOTAL_TOKENS ?? r.total_tokens ?? 0),
        estimated_cost_usd: Number(
          r.ESTIMATED_COST_USD ?? r.estimated_cost_usd ?? 0.0,
        ),
        execution_time_ms: Number(
          r.EXECUTION_TIME_MS ?? r.execution_time_ms ?? 0.0,
        ),
        concurrency_level: Number(
          r.CONCURRENCY_LEVEL ?? r.concurrency_level ?? 1,
        ),
        status: r.STATUS || r.status,
        trace_id: r.TRACE_ID || r.trace_id,
        correlation_id: r.CORRELATION_ID || r.correlation_id,
        metadata:
          typeof r.METADATA === "string"
            ? JSON.parse(r.METADATA)
            : r.METADATA || {},
        created_timestamp: createdTimestamp,
        update_timestamp: updateTimestamp,
        created_at: createdTimestamp,
      };
    });
  }
}

export const metricsRepo = new MetricsRepository();
