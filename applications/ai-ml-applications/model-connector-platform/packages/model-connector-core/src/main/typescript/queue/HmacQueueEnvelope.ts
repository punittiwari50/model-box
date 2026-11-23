import { cryptoUtils } from "@/utils/index.js";

export interface HmacSignedMessageEnvelope<T = unknown> {
  readonly payload: T;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly signatureSha256: string;
}

/**
 * Enterprise Cryptographic Queue Message Envelope Signer & Verifier.
 * Conforms to:
 * - Roadmap STEP-05, HLD §3.4 & LLD §8.3: Zero-Leakage Multi-Tenant Queue Isolation
 * - STD-COD-011: Encapsulated node:crypto access via cryptoUtils
 * - STD-COD-007: Immutability by Default & Resilient Error Contracts
 */
export class HmacQueueSigner {
  public static signEnvelope<T>(
    payload: T,
    tenantId: string,
    correlationId: string,
    secretKey: string,
  ): HmacSignedMessageEnvelope<T> {
    const timestamp = new Date().toISOString();
    const nonce = cryptoUtils.randomUuid();
    const canonicalString = this.serializeCanonical(payload, tenantId, correlationId, timestamp, nonce);
    const signatureSha256 = cryptoUtils
      .createHmac("sha256", secretKey)
      .update(canonicalString)
      .digest("hex");

    return Object.freeze({
      payload,
      tenantId,
      correlationId,
      timestamp,
      nonce,
      signatureSha256,
    });
  }

  public static verifyEnvelope<T>(
    envelope: HmacSignedMessageEnvelope<T>,
    secretKey: string,
  ): boolean {
    const canonicalString = this.serializeCanonical(
      envelope.payload,
      envelope.tenantId,
      envelope.correlationId,
      envelope.timestamp,
      envelope.nonce,
    );
    const expectedSignature = cryptoUtils
      .createHmac("sha256", secretKey)
      .update(canonicalString)
      .digest("hex");

    return this.constantTimeCompare(expectedSignature, envelope.signatureSha256);
  }

  private static serializeCanonical(
    payload: unknown,
    tenantId: string,
    correlationId: string,
    timestamp: string,
    nonce: string,
  ): string {
    const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
    return `${tenantId}|${correlationId}|${timestamp}|${nonce}|${payloadStr}`;
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
