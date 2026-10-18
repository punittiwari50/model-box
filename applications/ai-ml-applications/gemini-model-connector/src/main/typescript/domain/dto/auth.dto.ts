import type { AuthStatus } from '@/domain/entities/modelAuth.entity.js';

export interface ActiveAuthSession {
  readonly id: string;
  readonly model: string;
  readonly original_model?: string;
  readonly display_name?: string;
  readonly display_model?: string;
  readonly family: string;
  readonly auth_type: string;
  readonly account_email?: string;
  readonly account_name?: string;
  readonly status: AuthStatus;
  readonly is_active?: boolean;
  readonly is_current_active?: boolean;
  readonly login_state?: string;
  readonly login_date_time?: string;
  readonly created_timestamp?: string;
}

export interface AuthStatusResponse {
  readonly overall_authenticated: boolean;
  readonly global_authenticated?: boolean;
  readonly models: Readonly<Record<string, {
    readonly authenticated: boolean;
    readonly family?: string;
    readonly auth_type?: string;
    readonly account_email?: string;
    readonly expires_at?: string;
    readonly status: AuthStatus;
    readonly active_sessions?: readonly ActiveAuthSession[];
  }>>;
  readonly active_sessions?: readonly ActiveAuthSession[];
}

export interface LoginRequest {
  readonly model?: string;
  readonly api_key?: string;
  readonly token?: string;
  readonly account_id?: string;
  readonly id?: string;
  readonly email?: string;
  readonly account_email?: string;
  readonly launch_browser?: boolean;
  readonly redirect_uri?: string;
}

export interface LogoutRequest {
  readonly model?: string;
  readonly id?: string;
  readonly account_email?: string;
  readonly all?: boolean;
}

export interface SwitchSessionRequest {
  readonly sessionId?: string;
  readonly id?: string;
  readonly model?: string;
}

