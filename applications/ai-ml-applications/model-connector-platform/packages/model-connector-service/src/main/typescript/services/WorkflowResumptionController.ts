import {
  WorkflowIntegrityGuard,
  type WorkflowStepLedgerEntity,
} from "@model-box/model-connector-core";

export interface ResumptionDecision {
  readonly action: "RESUME" | "RESTART_FROM_STEP_1";
  readonly resumeAtStepIndex: number;
  readonly verifiedStepsCount: number;
  readonly brokenAtStep?: number;
  readonly reason: string;
}

/**
 * Enterprise Workflow Resilient Resumption Controller.
 * Conforms to:
 * - Roadmap STEP-08 & LLD §19.3: Resilient Resumption & Tamper Detection
 * - STD-COD-007: Resilient Error Contracts & Immutability by Default
 */
export class WorkflowResumptionController {
  public static evaluateResumption(
    steps: ReadonlyArray<WorkflowStepLedgerEntity>,
    tenantSecret: string,
  ): ResumptionDecision {
    if (!steps || steps.length === 0) {
      return Object.freeze({
        action: "RESTART_FROM_STEP_1",
        resumeAtStepIndex: 1,
        verifiedStepsCount: 0,
        reason: "No prior ledger records found for workflow execution.",
      });
    }

    const verification = WorkflowIntegrityGuard.verifyLedgerChain(steps, tenantSecret);
    if (!verification.isValid) {
      return Object.freeze({
        action: "RESTART_FROM_STEP_1",
        resumeAtStepIndex: 1,
        verifiedStepsCount: verification.verifiedUpToStep,
        brokenAtStep: verification.brokenAtStep,
        reason: verification.reason || "Cryptographic integrity failure in workflow state chain.",
      });
    }

    const nextStepIndex = verification.verifiedUpToStep + 1;
    return Object.freeze({
      action: "RESUME",
      resumeAtStepIndex: nextStepIndex,
      verifiedStepsCount: verification.verifiedUpToStep,
      reason: `Ledger cryptographically intact across ${verification.verifiedUpToStep} steps. Resuming at step ${nextStepIndex}.`,
    });
  }
}
