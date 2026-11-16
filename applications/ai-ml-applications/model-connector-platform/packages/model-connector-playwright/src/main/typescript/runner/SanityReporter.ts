import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";

/**
 * Enterprise Results Formatter & Table Reporter
 * Conforms to STD-COD-007 (Functions <= 20 lines)
 */
export class SanityReporter {
  public static printHeader(targetUrl: string): void {
    console.log("==================================================================");
    console.log(" ModelConnector UI - Playwright Menu & Tab Sanity Verification");
    console.log(` Target URL: ${targetUrl}`);
    console.log("==================================================================");
  }

  public static printSummary(results: readonly ISanityCheckResult[]): void {
    console.log("\n==================================================================");
    console.log(" Sanity Verification Summary Report");
    console.log("==================================================================");
    console.table(
      results.map((r) => ({
        "Menu / Feature": r.menu,
        Route: `/${r.route}`,
        Status: r.status === "PASSED" ? "✔ PASSED" : "✖ FAILED",
        "Latency (ms)": `${r.latencyMs}ms`,
        "Verified Controls": r.details,
      })),
    );
    const passed = results.filter((r) => r.status === "PASSED").length;
    console.log(`\nResult: ${passed}/${results.length} Menus & Tab Flows Passed`);
    console.log("==================================================================\n");
  }
}

