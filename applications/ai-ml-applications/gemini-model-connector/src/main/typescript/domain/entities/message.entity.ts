export type Role = 'user' | 'assistant' | 'system';

/**
 * Domain Database Entity: MESSAGES table.
 */
export interface MessageEntity {
  readonly id: string;
  readonly conversation_id: string;
  readonly role: Role;
  readonly content: string;
  readonly model?: string;
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
  readonly latency_ms?: number;
  readonly cli_exit_code?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly created_timestamp?: string;
  readonly update_timestamp?: string;
  readonly created_at: string;
}
