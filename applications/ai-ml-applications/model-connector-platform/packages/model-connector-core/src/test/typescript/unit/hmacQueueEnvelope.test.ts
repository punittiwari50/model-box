import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HmacQueueSigner } from "@/queue/HmacQueueEnvelope.js";

describe("HmacQueueEnvelope Multi-Tenant Queue Signing Tests", () => {
  const secretKey = "super-secret-tenant-encryption-key-01";
  const payload = { action: "AUTONOMOUS_JOB_APPLY", jobId: "WD-991" };

  it("signs and verifies an envelope with matching secret key", () => {
    const envelope = HmacQueueSigner.signEnvelope(payload, "TENANT-42", "CORR-100", secretKey);

    assert.strictEqual(envelope.tenantId, "TENANT-42");
    assert.strictEqual(envelope.correlationId, "CORR-100");
    assert.strictEqual(envelope.signatureSha256.length, 64);

    const isValid = HmacQueueSigner.verifyEnvelope(envelope, secretKey);
    assert.strictEqual(isValid, true);
  });

  it("fails verification if the secret key differs", () => {
    const envelope = HmacQueueSigner.signEnvelope(payload, "TENANT-42", "CORR-100", secretKey);
    const isValid = HmacQueueSigner.verifyEnvelope(envelope, "wrong-tenant-secret");
    assert.strictEqual(isValid, false);
  });

  it("fails verification if envelope payload is tampered", () => {
    const envelope = HmacQueueSigner.signEnvelope(payload, "TENANT-42", "CORR-100", secretKey);
    const tamperedEnvelope = {
      ...envelope,
      payload: { ...payload, jobId: "WD-TAMPERED-999" },
    };
    const isValid = HmacQueueSigner.verifyEnvelope(tamperedEnvelope, secretKey);
    assert.strictEqual(isValid, false);
  });

  it("fails verification if tenantId is altered", () => {
    const envelope = HmacQueueSigner.signEnvelope(payload, "TENANT-42", "CORR-100", secretKey);
    const crossTenantEnvelope = {
      ...envelope,
      tenantId: "TENANT-INTRUDER-99",
    };
    const isValid = HmacQueueSigner.verifyEnvelope(crossTenantEnvelope, secretKey);
    assert.strictEqual(isValid, false);
  });
});
