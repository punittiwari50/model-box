/**
 * Database Clean Up Guard for Playwright Test Lifecycle
 * Ensures zero mock or dummy data is left in database tables after test execution.
 * Conforms to STD-COD-007 (SLAP <= 20 lines) and STD-COD-011.
 */
export class DatabaseCleanUpGuard {
  public static async cleanupTestSessions(baseUrl?: string): Promise<number> {
    const candidates = [
      baseUrl,
      process.env.BACKEND_API_BASE_URL,
      "http://model-connector-service:8095",
      "http://127.0.0.1:8095",
      "http://localhost:8095",
      "http://model-connector-ui:80",
    ].filter(Boolean) as string[];

    for (const target of candidates) {
      const purged = await DatabaseCleanUpGuard.tryPurgeTarget(target);
      if (purged !== null) {
        return purged;
      }
    }
    return 0;
  }

  private static async tryPurgeTarget(targetUrl: string): Promise<number | null> {
    try {
      const cleanBase = targetUrl.replace(/\/+$/, "");
      const res = await fetch(`${cleanBase}/api/v1/sessions/cleanup-test-data`, {
        method: "POST",
      });
      if (!res.ok) return null;
      const data = await res.json();
      const count = Number(data.deletedCount || 0);
      if (count > 0) {
        console.log(` [DatabaseCleanUpGuard] Purged ${count} test/dummy sessions via ${cleanBase}.`);
      }
      return count;
    } catch {
      return null;
    }
  }
}
