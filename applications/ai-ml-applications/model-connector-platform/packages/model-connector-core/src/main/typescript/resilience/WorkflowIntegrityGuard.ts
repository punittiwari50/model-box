import { cryptoUtils } from "@/utils/index.js";
import type { WorkflowStepLedgerEntity } from "@/entities/workflowStepLedger.entity.js";

export const GENESIS_HMAC_SEED = "GENESIS_STEP_00000000";

export interface WorkflowLedgerVerificationResult {
  readonly isValid: boolean;
  readonly verifiedUpToStep: number;
  readonly brokenAtStep?: number;
  readonly reason?: string;
}

/**
 * Enterprise Cryptographic Workflow Integrity Guard.
 * Conforms to:
 * - Roadmap STEP-07 & LLD §19.2: Cryptographic State Ledger & Sequential HMAC
 * - STD-COD-011: Encapsulated node:crypto access via cryptoUtils
 * - STD-COD-007: Immutability by Default & Resilient Error Contracts
 */
export class WorkflowIntegrityGuard {
  public static computeStepHmac(
    tenantSecret: string,
    previousHmac: string,
    stepIndex: number,
    inputHash: string,
    outputHash: string,
  ): string {
    const canonicalPayload = `${previousHmac}|${stepIndex}|${inputHash}|${outputHash}`;
    return cryptoUtils
      .createHmac("sha256", tenantSecret)
      .update(canonicalPayload)
      .digest("hex");
  }

  public static hashPayload(payload: unknown): string {
    const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
    return cryptoUtils.sha256(serialized);
  }

  public static verifyLedgerChain(
    steps: ReadonlyArray<WorkflowStepLedgerEntity>,
    tenantSecret: string,
    genesisSeed: string = GENESIS_HMAC_SEED,
  ): WorkflowLedgerVerificationResult {
    let currentHmac = genesisSeed;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const expectedHmac = this.computeStepHmac(
        tenantSecret,
        currentHmac,
        step.STEP_INDEX,
        step.INPUT_HASH,
        step.OUTPUT_HASH,
      );
      if (!this.constantTimeCompare(expectedHmac, step.CUMULATIVE_HMAC)) {
        return Object.freeze({
          isValid: false,
          verifiedUpToStep: i > 0 ? steps[i - 1].STEP_INDEX : 0,
          brokenAtStep: step.STEP_INDEX,
          reason: `Cryptographic tamper detected at step index ${step.STEP_INDEX}`,
        });
      }
      currentHmac = step.CUMULATIVE_HMAC;
    }
    const lastStep = steps.length > 0 ? steps[steps.length - 1].STEP_INDEX : 0;
    return Object.freeze({ isValid: true, verifiedUpToStep: lastStep });
  }

  private static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    return cryptoUtils.timingSafeEqual(bufA, bufB);
  }
}
