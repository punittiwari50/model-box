import type { MessageEntity } from '@/domain/entities/message.entity.js';
import type { ContextItemEntity } from '@/domain/entities/contextItem.entity.js';

/**
 * Domain Database Entity: CONVERSATIONS table.
 * Includes VERSION field for Optimistic Locking (Requirement #1).
 */
export interface ConversationEntity {
  readonly id: string;
  readonly session_id?: string;
  readonly title: string;
  readonly model: string;
  readonly system_instruction?: string;
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly created_timestamp?: string;
  readonly update_timestamp?: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly messages?: readonly MessageEntity[];
  readonly contexts?: readonly ContextItemEntity[];
}
