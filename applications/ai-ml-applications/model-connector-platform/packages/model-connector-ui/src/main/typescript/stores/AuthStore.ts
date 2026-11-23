/**
 * In-Memory Authentication & Tenant Context Store.
 * Conforms to UI-LLD Section 1 & STEP-16 security invariants:
 * - Access tokens stored strictly in-memory (zero localStorage/sessionStorage persistence).
 * - CSRF token synchronization and HttpOnly cookie refresh compatibility.
 */

export type AuthMode = "GOOGLE_GIS" | "ENTERPRISE_SSO" | "API_KEY" | "DEVELOPER_MOCK";
export type TenantScope = "JOB_PORTAL" | "APPS_BUILDER" | "STORYTELLER" | "CUSTOM_PLATFORM";

export interface AuthState {
  readonly isAuthenticated: boolean;
  readonly authMode: AuthMode | null;
  readonly accessToken: string | null;
  readonly csrfToken: string | null;
  readonly tenantId: string;
  readonly userId: string;
  readonly userEmail: string | null;
  readonly tenantScope: TenantScope;
  readonly capabilities: readonly string[];
}

type AuthListener = (state: AuthState) => void;

class AuthStoreImpl {
  private state: AuthState = {
    isAuthenticated: false,
    authMode: null,
    accessToken: null,
    csrfToken: null,
    tenantId: "default-tenant",
    userId: "default-user",
    userEmail: null,
    tenantScope: "CUSTOM_PLATFORM",
    capabilities: ["inference", "workflows"],
  };

  private readonly listeners = new Set<AuthListener>();

  public getState(): AuthState {
    return this.state;
  }

  public subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setAuthenticated(
    token: string,
    authMode: AuthMode,
    userId: string,
    userEmail?: string,
    tenantId: string = "default-tenant",
    tenantScope: TenantScope = "CUSTOM_PLATFORM",
  ): void {
    this.state = {
      ...this.state,
      isAuthenticated: true,
      authMode,
      accessToken: token,
      userId,
      userEmail: userEmail ?? null,
      tenantId,
      tenantScope,
    };
    this.notify();
  }

  public setCsrfToken(csrfToken: string): void {
    this.state = {
      ...this.state,
      csrfToken,
    };
    this.notify();
  }

  public setTenantScope(tenantScope: TenantScope): void {
    this.state = {
      ...this.state,
      tenantScope,
    };
    this.notify();
  }

  public logout(): void {
    this.state = {
      isAuthenticated: false,
      authMode: null,
      accessToken: null,
      csrfToken: null,
      tenantId: "default-tenant",
      userId: "default-user",
      userEmail: null,
      tenantScope: "CUSTOM_PLATFORM",
      capabilities: ["inference", "workflows"],
    };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const authStore = new AuthStoreImpl();
