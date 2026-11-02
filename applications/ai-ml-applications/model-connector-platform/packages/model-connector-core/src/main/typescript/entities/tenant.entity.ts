/**
 * Relational Entity for TENANTS table.
 * Conforms to:
 * - HLD §6.2: Multi-Tenant Zero-Cross-Contamination
 * - Invariant: Avoid generic ID: Uses TENANT_ID
 * - Invariant: Table and column names strictly in UPPER CASE
 */
export interface TenantEntity {
  TENANT_ID: string;
  TENANT_NAME: string;
  SUBSCRIPTION_TIER: "FREE" | "PRO" | "ENTERPRISE";
  STATUS: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  CREATED_TIMESTAMP: string;
  UPDATED_TIMESTAMP: string;

  // Compatibility aliases
  readonly tenantId?: string;
  readonly name?: string;
}
