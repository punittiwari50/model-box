/**
 * Relational Entity for SESSIONS table.
 * Conforms to:
 * - Avoid generic ID: Uses SESSION_ID
 * - All table and column names strictly in UPPER CASE
 */
export interface SessionEntity {
  SESSION_ID: string;
  SESSION_TITLE: string;
  ACTIVE_MODEL_ID: string;
  STRATEGY_MODE: "api" | "cli" | "cookie";
  TURN_COUNT: number;
  SESSION_METADATA_JSON?: string;
  CREATED_TIMESTAMP: string;
  UPDATED_TIMESTAMP: string;

  // Compatibility aliases
  readonly sessionId?: string;
  readonly title?: string;
  readonly activeModelId?: string;
}
