/**
 * Relational Entity for USERS table.
 * Conforms to:
 * - HLD §6.2 & §8.1: Multi-Tenant Identity & RBAC
 * - Invariant: Avoid generic ID: Uses USER_ID
 * - Invariant: Table and column names strictly in UPPER CASE
 */
export interface UserEntity {
  USER_ID: string;
  TENANT_ID: string;
  EMAIL: string;
  FULL_NAME: string;
  USER_ROLE: "ADMIN" | "OPERATOR" | "DEVELOPER" | "VIEWER";
  STATUS: "ACTIVE" | "INVITED" | "SUSPENDED";
  CREATED_TIMESTAMP: string;
  UPDATED_TIMESTAMP: string;

  // Compatibility aliases
  readonly userId?: string;
  readonly tenantId?: string;
  readonly email?: string;
}
