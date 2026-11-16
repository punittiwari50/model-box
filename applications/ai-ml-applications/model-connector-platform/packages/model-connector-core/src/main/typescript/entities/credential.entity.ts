/**
 * Relational Entity for MODEL_CREDENTIALS table.
 * Conforms to:
 * - Avoid generic ID: Uses CREDENTIAL_ID
 * - All table and column names strictly in UPPER CASE
 */
export interface ModelCredentialEntity {
  CREDENTIAL_ID: string;
  MODEL_FAMILY: string;
  KEY_NAME: string;
  KEY_HASH: string;
  IS_ACTIVE: boolean;
  CREATED_TIMESTAMP: string;

  // Compatibility aliases
  readonly credentialId?: string;
  readonly modelFamily?: string;
}
