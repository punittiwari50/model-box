export type ContextItemType = 'resume' | 'job_posting' | 'reference_document' | 'system_prompt' | 'custom';

/**
 * Domain Database Entity: CONTEXT_ITEMS table.
 */
export interface ContextItemEntity {
  readonly id: string;
  readonly conversation_id: string;
  readonly context_type: ContextItemType;
  readonly title: string;
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly created_timestamp?: string;
  readonly update_timestamp?: string;
  readonly created_at: string;
}
