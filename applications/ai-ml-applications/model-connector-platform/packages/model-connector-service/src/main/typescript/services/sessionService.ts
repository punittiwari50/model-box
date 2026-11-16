import {
  sessionRepository,
  type StoredSession,
  type StoredMessage,
} from "@/repositories/sessionRepository";

export class SessionService {
  public async listSessions(limit?: number, offset?: number): Promise<StoredSession[]> {
    return sessionRepository.listSessions(limit, offset);
  }

  public async getSession(sessionId: string): Promise<StoredSession | undefined> {
    return sessionRepository.getSession(sessionId);
  }

  public createSession(
    sessionId?: string,
    modelId = "gemini-3.8-flash",
    strategy = "api",
  ): StoredSession {
    return sessionRepository.getOrCreateSession(sessionId, modelId, strategy);
  }

  public async getSessionMessages(
    sessionId: string,
    limit?: number,
    offset?: number,
  ): Promise<StoredMessage[]> {
    return sessionRepository.getSessionMessages(sessionId, limit, offset);
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    return sessionRepository.deleteSession(sessionId);
  }

  public async cleanupTestSessions(): Promise<number> {
    return sessionRepository.cleanupTestSessions();
  }
}

export const sessionService = new SessionService();
