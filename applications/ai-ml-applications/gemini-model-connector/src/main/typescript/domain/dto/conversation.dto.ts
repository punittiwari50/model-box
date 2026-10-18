import type { ConversationEntity } from "@/domain/entities/conversation.entity.js";

export interface CreateConversationRequest {
  readonly title: string;
  readonly model?: string;
  readonly system_instruction?: string;
  readonly tags?: readonly string[];
  readonly initial_resume?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly session_id?: string;
}

export interface ResumeConversationRequest {
  readonly content?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly additional_context?: string;
  readonly api_key?: string;
  readonly mode?: "auto" | "api" | "cli" | "mock";
}

export interface ChatConversationRequest {
  readonly conversation_id?: string;
  readonly session_id?: string;
  readonly content: string;
  readonly title?: string;
  readonly model?: string;
  readonly system_instruction?: string;
  readonly temperature?: number;
  readonly additional_context?: string;
  readonly api_key?: string;
  readonly mode?: "auto" | "api" | "cli" | "mock";
  readonly resume?: boolean;
}

export type ConversationResponse = ConversationEntity;
