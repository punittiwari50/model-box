import { randomUUID } from "@model-box/model-connector-core";

export type RestrictionScope = "PLATFORM" | "MODEL" | "TENANT";

export interface RestrictionAuditRecord {
  readonly restrictionId: string;
  readonly scope: RestrictionScope;
  readonly entityId: string;
  readonly restrictionType: "TOKEN_LIMIT" | "RATE_LIMIT" | "COMPANY_POLICY" | "ACCESS_REVOCATION";
  readonly reason: string;
  readonly triggeredByCorrelationId: string;
  readonly timestamp: string;
}

/**
 * Enterprise 3-Scope Restriction Audit Service.
 * Conforms to:
 * - Roadmap STEP-15 & LLD §16: Comprehensive Flow Restriction Audit Logging
 * - STD-COD-007: Immutability by Default
 */
export class RestrictionAuditService {
  private static readonly auditTrail: RestrictionAuditRecord[] = [];

  public static logRestriction(
    scope: RestrictionScope,
    entityId: string,
    restrictionType: RestrictionAuditRecord["restrictionType"],
    reason: string,
    correlationId: string,
  ): RestrictionAuditRecord {
    const record: RestrictionAuditRecord = Object.freeze({
      restrictionId: `RESTRICT-${randomUUID()}`,
      scope,
      entityId,
      restrictionType,
      reason,
      triggeredByCorrelationId: correlationId,
      timestamp: new Date().toISOString(),
    });

    this.auditTrail.push(record);
    return record;
  }

  public static queryAuditTrail(
    scope?: RestrictionScope,
    entityId?: string,
  ): ReadonlyArray<RestrictionAuditRecord> {
    return Object.freeze(
      this.auditTrail.filter((r) => {
        if (scope && r.scope !== scope) return false;
        if (entityId && r.entityId !== entityId) return false;
        return true;
      }),
    );
  }

  public static clear(): void {
    this.auditTrail.length = 0;
  }
}
