import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WorkflowIntegrityGuard,
  GENESIS_HMAC_SEED,
} from "@/resilience/WorkflowIntegrityGuard.js";
import type { WorkflowStepLedgerEntity } from "@/entities/workflowStepLedger.entity.js";

describe("WorkflowIntegrityGuard Cryptographic Ledger Tests", () => {
  const tenantSecret = "tenant-test-secret-salt-32bytes-long";

  it("computes reproducible step HMAC signatures", () => {
    const hmac1 = WorkflowIntegrityGuard.computeStepHmac(
      tenantSecret,
      GENESIS_HMAC_SEED,
      1,
      "hash-in-1",
      "hash-out-1",
    );
    const hmac2 = WorkflowIntegrityGuard.computeStepHmac(
      tenantSecret,
      GENESIS_HMAC_SEED,
      1,
      "hash-in-1",
      "hash-out-1",
    );
    assert.strictEqual(hmac1, hmac2);
    assert.strictEqual(hmac1.length, 64);
  });

  it("verifies an intact 3-step ledger successfully", () => {
    const hmac1 = WorkflowIntegrityGuard.computeStepHmac(tenantSecret, GENESIS_HMAC_SEED, 1, "in1", "out1");
    const hmac2 = WorkflowIntegrityGuard.computeStepHmac(tenantSecret, hmac1, 2, "in2", "out2");
    const hmac3 = WorkflowIntegrityGuard.computeStepHmac(tenantSecret, hmac2, 3, "in3", "out3");

    const steps: WorkflowStepLedgerEntity[] = [
      {
        LEDGER_ID: "LEDGER-01",
        WORKFLOW_EXECUTION_ID: "WF-100",
        TENANT_ID: "TENANT-A",
        STEP_INDEX: 1,
        STEP_NAME: "fetch-resume",
        INPUT_HASH: "in1",
        OUTPUT_HASH: "out1",
        CUMULATIVE_HMAC: hmac1,
        STATUS: "EXECUTED",
        EXECUTION_TIMESTAMP: new Date().toISOString(),
      },
      {
        LEDGER_ID: "LEDGER-02",
        WORKFLOW_EXECUTION_ID: "WF-100",
        TENANT_ID: "TENANT-A",
        STEP_INDEX: 2,
        STEP_NAME: "parse-ast",
        INPUT_HASH: "in2",
        OUTPUT_HASH: "out2",
        CUMULATIVE_HMAC: hmac2,
        STATUS: "EXECUTED",
        EXECUTION_TIMESTAMP: new Date().toISOString(),
      },
      {
        LEDGER_ID: "LEDGER-03",
        WORKFLOW_EXECUTION_ID: "WF-100",
        TENANT_ID: "TENANT-A",
        STEP_INDEX: 3,
        STEP_NAME: "scorecard-eval",
        INPUT_HASH: "in3",
        OUTPUT_HASH: "out3",
        CUMULATIVE_HMAC: hmac3,
        STATUS: "EXECUTED",
        EXECUTION_TIMESTAMP: new Date().toISOString(),
      },
    ];

    const result = WorkflowIntegrityGuard.verifyLedgerChain(steps, tenantSecret);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.verifiedUpToStep, 3);
  });

  it("detects tampering when an intermediate step payload is altered", () => {
    const hmac1 = WorkflowIntegrityGuard.computeStepHmac(tenantSecret, GENESIS_HMAC_SEED, 1, "in1", "out1");
    const hmac2 = WorkflowIntegrityGuard.computeStepHmac(tenantSecret, hmac1, 2, "in2", "out2");

    const steps: WorkflowStepLedgerEntity[] = [
      {
        LEDGER_ID: "LEDGER-01",
        WORKFLOW_EXECUTION_ID: "WF-101",
        TENANT_ID: "TENANT-A",
        STEP_INDEX: 1,
        STEP_NAME: "step-1",
        INPUT_HASH: "in1",
        OUTPUT_HASH: "out1",
        CUMULATIVE_HMAC: hmac1,
        STATUS: "EXECUTED",
        EXECUTION_TIMESTAMP: new Date().toISOString(),
      },
      {
        LEDGER_ID: "LEDGER-02",
        WORKFLOW_EXECUTION_ID: "WF-101",
        TENANT_ID: "TENANT-A",
        STEP_INDEX: 2,
        STEP_NAME: "step-2",
        INPUT_HASH: "in2-TAMPERED",
        OUTPUT_HASH: "out2",
        CUMULATIVE_HMAC: hmac2,
        STATUS: "EXECUTED",
        EXECUTION_TIMESTAMP: new Date().toISOString(),
      },
    ];

    const result = WorkflowIntegrityGuard.verifyLedgerChain(steps, tenantSecret);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.brokenAtStep, 2);
    assert.strictEqual(result.verifiedUpToStep, 1);
  });
});
