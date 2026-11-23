export class TimeComparisonFormatter {
  private static readonly MS_PER_MINUTE = 60000;
  private static readonly MINUTES_PER_HOUR = 60;
  private static readonly DEFAULT_FALLBACK = "Never used";
  private static readonly JUST_NOW_THRESHOLD_MINUTES = 1;

  public static getLatestTimestamp(
    dates: readonly (string | Date | number | undefined | null)[],
  ): number | null {
    let latest: number | null = null;
    for (const d of dates) {
      if (!d) continue;
      const t = typeof d === "number" ? d : new Date(d).getTime();
      if (!Number.isNaN(t) && (!latest || t > latest)) {
        latest = t;
      }
    }
    return latest;
  }

  public static formatRelative(
    timestamp: number | null,
    fallback = TimeComparisonFormatter.DEFAULT_FALLBACK,
  ): string {
    if (!timestamp) {
      return fallback;
    }
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.floor(diffMs / TimeComparisonFormatter.MS_PER_MINUTE);

    if (diffMin < TimeComparisonFormatter.JUST_NOW_THRESHOLD_MINUTES) {
      return "Just now";
    }
    if (diffMin < TimeComparisonFormatter.MINUTES_PER_HOUR) {
      return `${diffMin}m ago`;
    }
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}
