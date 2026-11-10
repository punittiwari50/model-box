/**
 * Session, Cookie, and Upstream Integration types.
 * Conforms to STD-COD-007.5: Immutability by Default.
 */

export interface SessionCookie {
  readonly name: string;
  readonly value: string;
  readonly domain?: string;
  readonly path?: string;
  readonly expires?: string;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
}

export interface ModelSession {
  readonly sessionId: string;
  readonly model: string;
  readonly strategy: string;
  readonly cookies: readonly SessionCookie[];
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly turnCount: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UpstreamAuthStatus {
  readonly authenticated: boolean;
  readonly activeModel: string;
  readonly activeSessions: readonly string[];
  readonly authType?: string;
  readonly email?: string | null;
  readonly activeSession?: boolean;
  readonly expiresAt?: string | null;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface UpstreamAuditLog {
  readonly id: string;
  readonly action: string;
  readonly modelUsed: string;
  readonly status: string;
  readonly latencyMs: number;
  readonly timestamp: string;
  readonly clientIp?: string;
  readonly message?: string;
  readonly sessionId?: string;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
}
