import {
  sessionRepository,
  type StoredSession,
  type StoredMessage,
} from "@/repositories/sessionRepository";

export class SessionService {
  public listSessions(limit?: number, offset?: number): StoredSession[] {
    return sessionRepository.listSessions(limit, offset);
  }

  public getSession(sessionId: string): StoredSession | undefined {
    return sessionRepository.getSession(sessionId);
  }

  public createSession(
    sessionId?: string,
    modelId = "gemini-3.8-flash",
    strategy = "api",
  ): StoredSession {
    return sessionRepository.getOrCreateSession(sessionId, modelId, strategy);
  }

  public getSessionMessages(
    sessionId: string,
    limit?: number,
    offset?: number,
  ): StoredMessage[] {
    return sessionRepository.getSessionMessages(sessionId, limit, offset);
  }

  public deleteSession(sessionId: string): boolean {
    return sessionRepository.deleteSession(sessionId);
  }

  public cleanupTestSessions(): number {
    return sessionRepository.cleanupTestSessions();
  }
}

export const sessionService = new SessionService();
