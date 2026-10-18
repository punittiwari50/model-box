import type { AuthStatus } from '@/domain/entities/modelAuth.entity.js';

export interface AuthStatusResponse {
  readonly overall_authenticated: boolean;
  readonly global_authenticated?: boolean;
  readonly models: Readonly<Record<string, {
    readonly authenticated: boolean;
    readonly auth_type?: string;
    readonly account_email?: string;
    readonly expires_at?: string;
    readonly status: AuthStatus;
  }>>;
}

export interface LoginRequest {
  readonly model?: string;
  readonly api_key?: string;
  readonly launch_browser?: boolean;
  readonly redirect_uri?: string;
}

export interface LogoutRequest {
  readonly model?: string;
  readonly all?: boolean;
}
