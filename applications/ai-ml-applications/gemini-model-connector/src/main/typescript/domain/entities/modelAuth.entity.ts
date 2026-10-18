import { AuthStatusConstant, AuthType } from '@/domain/constants/index.js';

export type AuthStatus = (typeof AuthStatusConstant)[keyof typeof AuthStatusConstant];
export type AuthTypeValue = (typeof AuthType)[keyof typeof AuthType];

/**
 * Domain Database Entity: MODEL_AUTH table.
 */
export interface ModelAuthEntity {
  readonly id: string;
  readonly model: string;
  readonly auth_type: AuthTypeValue;
  readonly account_email?: string;
  readonly account_name?: string;
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_at?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly status: AuthStatus;
  readonly is_active?: number | boolean;
  readonly login_date_time?: string;
  readonly created_timestamp?: string;
  readonly update_timestamp?: string;
  readonly created_at: string;
  readonly updated_at: string;
}
