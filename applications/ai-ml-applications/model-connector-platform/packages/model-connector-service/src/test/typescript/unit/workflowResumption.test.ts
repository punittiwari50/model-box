import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowResumptionController } from "@/services/WorkflowResumptionController";
import {
  WorkflowIntegrityGuard,
  GENESIS_HMAC_SEED,
  type WorkflowStepLedgerEntity,
} from "@model-box/model-connector-core";

test("WorkflowResumptionController - rejects resumption for empty steps", () => {
  const result = WorkflowResumptionController.evaluateResumption([], "test-secret");
  assert.equal(result.action, "RESTART_FROM_STEP_1");
  assert.equal(result.resumeAtStepIndex, 1);
  assert.equal(result.verifiedStepsCount, 0);
  assert.ok(result.reason.includes("No prior ledger records found"));
});

test("WorkflowResumptionController - approves resumption for verified sequential HMAC ledger", () => {
  const secret = "resumption-secret-salt-32bytes";
  const hmac1 = WorkflowIntegrityGuard.computeStepHmac(secret, GENESIS_HMAC_SEED, 1, "in1", "out1");
  const hmac2 = WorkflowIntegrityGuard.computeStepHmac(secret, hmac1, 2, "in2", "out2");

  const step1: WorkflowStepLedgerEntity = {
    LEDGER_ID: "L-01",
    WORKFLOW_EXECUTION_ID: "WF-100",
    TENANT_ID: "TENANT-A",
    STEP_INDEX: 1,
    STEP_NAME: "DATA_INGESTION",
    INPUT_HASH: "in1",
    OUTPUT_HASH: "out1",
    CUMULATIVE_HMAC: hmac1,
    STATUS: "EXECUTED",
    EXECUTION_TIMESTAMP: new Date().toISOString(),
  };

  const step2: WorkflowStepLedgerEntity = {
    LEDGER_ID: "L-02",
    WORKFLOW_EXECUTION_ID: "WF-100",
    TENANT_ID: "TENANT-A",
    STEP_INDEX: 2,
    STEP_NAME: "TOKEN_COMPACTION",
    INPUT_HASH: "in2",
    OUTPUT_HASH: "out2",
    CUMULATIVE_HMAC: hmac2,
    STATUS: "EXECUTED",
    EXECUTION_TIMESTAMP: new Date().toISOString(),
  };

  const decision = WorkflowResumptionController.evaluateResumption([step1, step2], secret);

  assert.equal(decision.action, "RESUME");
  assert.equal(decision.resumeAtStepIndex, 3);
  assert.equal(decision.verifiedStepsCount, 2);
  assert.ok(decision.reason.includes("Ledger cryptographically intact"));
});

test("WorkflowResumptionController - flags tampering when ledger HMAC is corrupted", () => {
  const secret = "resumption-secret-salt-32bytes";
  const hmac1 = WorkflowIntegrityGuard.computeStepHmac(secret, GENESIS_HMAC_SEED, 1, "in1", "out1");

  const step1: WorkflowStepLedgerEntity = {
    LEDGER_ID: "L-01",
    WORKFLOW_EXECUTION_ID: "WF-100",
    TENANT_ID: "TENANT-A",
    STEP_INDEX: 1,
    STEP_NAME: "DATA_INGESTION",
    INPUT_HASH: "in1",
    OUTPUT_HASH: "out1",
    CUMULATIVE_HMAC: hmac1,
    STATUS: "EXECUTED",
    EXECUTION_TIMESTAMP: new Date().toISOString(),
  };

  // Corrupted step 2 with invalid HMAC
  const corruptedStep2: WorkflowStepLedgerEntity = {
    LEDGER_ID: "L-02",
    WORKFLOW_EXECUTION_ID: "WF-100",
    TENANT_ID: "TENANT-A",
    STEP_INDEX: 2,
    STEP_NAME: "TRANSFORMATION",
    INPUT_HASH: "in2",
    OUTPUT_HASH: "out2",
    CUMULATIVE_HMAC: "corrupted_bad_hmac_hex",
    STATUS: "EXECUTED",
    EXECUTION_TIMESTAMP: new Date().toISOString(),
  };

  const decision = WorkflowResumptionController.evaluateResumption([step1, corruptedStep2], secret);

  assert.equal(decision.action, "RESTART_FROM_STEP_1");
  assert.equal(decision.resumeAtStepIndex, 1);
  assert.equal(decision.brokenAtStep, 2);
  assert.equal(decision.verifiedStepsCount, 1);
  assert.ok(decision.reason.includes("Cryptographic tamper detected at step index 2"));
});
