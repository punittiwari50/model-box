import type {
  Conversation,
  Message,
  CreateConversationDTO,
  SendMessageDTO,
  AttachContextDTO,
  CliExecutionResult,
} from "@/domain/index.js";

/**
 * Port contract for Conversation Application Service.
 */
export interface IConversationService {
  createConversation(
    dto: CreateConversationDTO,
    clientIp?: string,
  ): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  listConversations(limit?: number, offset?: number): Promise<Conversation[]>;
  deleteConversation(id: string, clientIp?: string): Promise<boolean>;
  attachContext(
    conversationId: string,
    dto: AttachContextDTO,
    clientIp?: string,
  ): Promise<any>;
  sendMessage(
    conversationId: string,
    dto: SendMessageDTO,
    clientIp?: string,
  ): Promise<{
    userMessage: Message;
    assistantMessage: Message;
    cliResult: CliExecutionResult;
  }>;
  resumeConversation(
    conversationId: string,
    dto?: import("@/domain/index.js").ResumeConversationDTO,
    clientIp?: string,
  ): Promise<{
    conversation: Conversation;
    turnResult?: {
      userMessage: Message;
      assistantMessage: Message;
      cliResult: CliExecutionResult;
    };
  }>;
  chat(
    dto: import("@/domain/index.js").ChatConversationDTO,
    clientIp?: string,
  ): Promise<{
    conversation: Conversation;
    userMessage: Message;
    assistantMessage: Message;
    cliResult: CliExecutionResult;
  }>;
}
