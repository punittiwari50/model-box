import type { UiModel, UiAuditRecord, UiSession } from "@/types/ui.types";
import { TimeComparisonFormatter } from "@/utils/formatters/TimeComparisonFormatter";

export interface ICategoryMetrics {
  readonly modelCount: number;
  readonly lastUsed: string;
  readonly tokenConsumptionPct: number;
}

export class CategoryMetricsCalculator {
  private static readonly TURN_WEIGHT = 6;
  private static readonly LOG_WEIGHT = 4;
  private static readonly BASELINE_SESSION_ALLOWANCE = 12;
  private static readonly MAX_CONSUMPTION_PCT = 100;
  private static readonly MIN_CONSUMPTION_PCT = 0;

  public static calculateStats(
    categoryModels: readonly UiModel[],
    auditLogs: readonly UiAuditRecord[],
    sessions: readonly UiSession[],
    fallbackLastUsed = "Never used",
  ): ICategoryMetrics {
    const modelIds = new Set(categoryModels.map((m) => m.id.toLowerCase()));

    const matchingLogs = auditLogs.filter((l) =>
      modelIds.has((l.modelUsed || "").toLowerCase()),
    );
    const matchingSessions = sessions.filter((s) =>
      modelIds.has((s.model || "").toLowerCase()),
    );

    const latestTimestamp = TimeComparisonFormatter.getLatestTimestamp([
      ...matchingLogs.map((l) => l.timestamp),
      ...matchingSessions.map((s) => s.lastActiveAt),
    ]);

    const lastUsedStr = TimeComparisonFormatter.formatRelative(
      latestTimestamp,
      fallbackLastUsed,
    );

    const tokenConsumptionPct = this.calculateTokenConsumption(
      matchingSessions,
      matchingLogs.length,
    );

    return {
      modelCount: categoryModels.length,
      lastUsed: lastUsedStr,
      tokenConsumptionPct,
    };
  }

  public static calculateTokenConsumption(
    sessions: readonly UiSession[],
    logCount: number,
  ): number {
    const totalTurns = sessions.reduce((sum, s) => sum + (s.turnCount || 0), 0);
    const baseline = sessions.length > 0 ? this.BASELINE_SESSION_ALLOWANCE : 0;
    const computed = totalTurns * this.TURN_WEIGHT + logCount * this.LOG_WEIGHT + baseline;

    return Math.min(
      this.MAX_CONSUMPTION_PCT,
      Math.max(this.MIN_CONSUMPTION_PCT, computed),
    );
  }
}
