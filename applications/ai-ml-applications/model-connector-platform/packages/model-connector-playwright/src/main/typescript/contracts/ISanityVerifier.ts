import type { Page } from "playwright";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";

/**
 * Strategy Contract for Individual Menu and Tab Verifiers
 */
export interface ISanityVerifier {
  readonly menuTitle: string;
  readonly menuRoute: string;

  /**
   * Executes view mounting and tab interactivity sanity verification.
   * Conforms to STD-COD-007: Zero null returns.
   */
  verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">>;
}

