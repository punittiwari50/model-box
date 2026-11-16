/**
 * Relational Entity for MESSAGES table.
 * Conforms to:
 * - Avoid generic ID: Uses MESSAGE_ID and SESSION_ID
 * - All table and column names strictly in UPPER CASE
 */
export interface MessageEntity {
  MESSAGE_ID: string;
  SESSION_ID: string;
  MESSAGE_ROLE: "user" | "assistant" | "system";
  MESSAGE_CONTENT: string;
  STRATEGY_MODE: "api" | "cli" | "cookie";
  TOKEN_COUNT: number;
  LATENCY_MS: number;
  CREATED_TIMESTAMP: string;

  // Compatibility aliases
  readonly messageId?: string;
  readonly sessionId?: string;
  readonly role?: string;
  readonly content?: string;
}
