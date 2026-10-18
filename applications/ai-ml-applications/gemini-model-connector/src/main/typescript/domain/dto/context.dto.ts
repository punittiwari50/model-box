import type { ContextItemType, ContextItemEntity } from '@/domain/entities/contextItem.entity.js';

export interface AttachContextRequest {
  readonly context_type: ContextItemType;
  readonly title: string;
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type ContextResponse = ContextItemEntity;
