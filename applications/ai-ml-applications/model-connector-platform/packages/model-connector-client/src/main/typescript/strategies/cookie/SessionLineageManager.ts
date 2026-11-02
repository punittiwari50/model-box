import { randomUUID } from "@model-box/model-connector-core";
import type { ModelSession, SessionCookie } from "@/domain/models/session.types.js";

export class SessionLineageManager {
  private readonly sessions = new Map<string, ModelSession>();

  public getOrCreateSession(sessionId?: string, model = "default"): ModelSession {
    const id = sessionId || randomUUID();
    const existing = this.sessions.get(id);
    if (existing) {
      const updated: ModelSession = {
        ...existing,
        turnCount: existing.turnCount + 1,
        lastActiveAt: new Date().toISOString(),
      };
      this.sessions.set(id, updated);
      return updated;
    }

    const newSession: ModelSession = {
      sessionId: id,
      model,
      strategy: "cookie",
      cookies: [
        {
          name: "mb_session_id",
          value: id,
          httpOnly: true,
          secure: false,
        },
      ],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      turnCount: 1,
    };
    this.sessions.set(id, newSession);
    return newSession;
  }

  public getSession(sessionId: string): ModelSession | undefined {
    return this.sessions.get(sessionId);
  }

  public listSessions(): readonly ModelSession[] {
    return Array.from(this.sessions.values());
  }

  public attachCookies(sessionId: string, newCookies: readonly SessionCookie[]): ModelSession {
    const session = this.getOrCreateSession(sessionId);
    const existingCookieNames = new Set(newCookies.map((c) => c.name));
    const retainedCookies = session.cookies.filter((c) => !existingCookieNames.has(c.name));

    const updated: ModelSession = {
      ...session,
      cookies: [...retainedCookies, ...newCookies],
      lastActiveAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  public formatCookieHeader(session: ModelSession): string {
    return session.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }
}
