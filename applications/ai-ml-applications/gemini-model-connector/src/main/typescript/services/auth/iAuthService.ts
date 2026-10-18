import type { ModelAuth, AuthStatusResponse } from '@/domain/index.js';
import type { InitiateAuthResult } from '@/core/adapters/auth/authProvider.js';

/**
 * Port contract for Authentication Application Service.
 */
export interface IAuthService {
  initiateAuth(model?: string, launchBrowser?: boolean, redirectUriOverride?: string): Promise<InitiateAuthResult>;
  initiateGoogleAuth(model?: string, launchBrowser?: boolean, redirectUriOverride?: string): Promise<InitiateAuthResult>;
  handleOAuthCallback(code: string, state: string): Promise<ModelAuth>;
  saveApiKey(model: string, apiKey: string): Promise<ModelAuth>;
  getStatus(): Promise<AuthStatusResponse>;
  logout(model?: string): Promise<{ success: boolean; message: string }>;
  logoutAll(): Promise<{ success: boolean; message: string }>;
}
