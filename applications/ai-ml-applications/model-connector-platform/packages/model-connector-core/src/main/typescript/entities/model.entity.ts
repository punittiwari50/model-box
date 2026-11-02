/**
 * Relational Entity for MODELS table.
 * Conforms to:
 * - Avoid generic ID: Uses MODEL_ID
 * - All table and column names strictly in UPPER CASE
 */
export interface ModelEntity {
  MODEL_ID: string;
  MODEL_NAME: string;
  MODEL_FAMILY: string;
  PROVIDER_NAME: string;
  CONTEXT_WINDOW_SIZE: number;
  SUPPORTED_STRATEGIES: string;
  LIFECYCLE_STATUS: "ACTIVE" | "INACTIVE" | "DEPRECATED";
  DESCRIPTION_TEXT?: string;
  CREATED_TIMESTAMP: string;
  UPDATED_TIMESTAMP: string;

  // Compatibility aliases
  readonly modelId?: string;
  readonly name?: string;
  readonly family?: string;
  readonly provider?: string;
}
