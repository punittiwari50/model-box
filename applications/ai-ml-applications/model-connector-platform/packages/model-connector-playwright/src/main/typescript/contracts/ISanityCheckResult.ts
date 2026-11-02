/**
 * Result Contract for Sanity Verifications
 */
export type SanityStatus = "PASSED" | "FAILED";

export interface ISanityCheckResult {
  readonly menu: string;
  readonly route: string;
  readonly status: SanityStatus;
  readonly details: string;
  readonly latencyMs: number;
}

