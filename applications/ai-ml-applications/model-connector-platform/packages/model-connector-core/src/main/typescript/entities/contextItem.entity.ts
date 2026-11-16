/**
 * Relational Entity for CONTEXT_ITEMS table (migrated from gemini-model-connector).
 * Conforms to:
 * - Avoid generic ID: Uses CONTEXT_ID and SESSION_ID
 * - All table and column names strictly in UPPER CASE
 */
export interface ContextItemEntity {
  CONTEXT_ID: string;
  SESSION_ID: string;
  CONTEXT_TYPE: "resume" | "job_posting" | "document" | "code_snippet";
  CONTEXT_NAME: string;
  CONTEXT_CONTENT: string;
  TOKEN_COUNT: number;
  CREATED_TIMESTAMP: string;

  // Compatibility aliases
  readonly contextId?: string;
  readonly sessionId?: string;
  readonly contextType?: string;
}
