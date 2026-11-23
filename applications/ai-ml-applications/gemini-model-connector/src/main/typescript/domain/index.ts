export * from "@/domain/constants/index.js";
export * from "@/domain/entities/index.js";
export * from "@/domain/dto/index.js";

// Backward-compatibility Aliases
import type { ConversationEntity } from "@/domain/entities/conversation.entity.js";
import type { MessageEntity } from "@/domain/entities/message.entity.js";
import type { ContextItemEntity } from "@/domain/entities/contextItem.entity.js";
import type { AuditLogEntity } from "@/domain/entities/auditLog.entity.js";
import type { ModelAuthEntity } from "@/domain/entities/modelAuth.entity.js";
import type {
  CreateConversationRequest,
  ResumeConversationRequest,
  ChatConversationRequest,
} from "@/domain/dto/conversation.dto.js";
import type { SendMessageRequest } from "@/domain/dto/message.dto.js";
import type { AttachContextRequest } from "@/domain/dto/context.dto.js";

export type Conversation = ConversationEntity;
export type Message = MessageEntity;
export type ContextItem = ContextItemEntity;
export type AuditLog = AuditLogEntity;
export type ModelAuth = ModelAuthEntity;
export type CreateConversationDTO = CreateConversationRequest;
export type ResumeConversationDTO = ResumeConversationRequest;
export type ChatConversationDTO = ChatConversationRequest;
export type SendMessageDTO = SendMessageRequest;
export type AttachContextDTO = AttachContextRequest;

import * as Constants from "@/domain/constants/index.js";
import * as Entities from "@/domain/entities/index.js";
import * as DTOs from "@/domain/dto/index.js";

export { Constants, Entities, DTOs };

export const Domain = Object.freeze({
  Constants,
  Entities,
  DTOs,
});
