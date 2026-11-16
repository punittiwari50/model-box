import type { MessageEntity } from "@/domain/entities/message.entity.js";

export interface SendMessageRequest {
  readonly content: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly additional_context?: string;
  readonly api_key?: string;
  readonly mode?: "auto" | "api" | "cli" | "mock";
  readonly idempotency_key?: string;
  readonly resume?: boolean;
  readonly session_id?: string;
}

export type MessageResponse = MessageEntity;
