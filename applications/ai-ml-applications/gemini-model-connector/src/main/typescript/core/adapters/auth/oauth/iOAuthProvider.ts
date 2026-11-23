import type { ModelAuth } from "@/domain/index.js";
import type { IAuthRepository } from "@/repositories/authRepository.js";

export interface InitiateAuthRequest {
  readonly model: string;
  readonly launchBrowser: boolean;
  readonly redirectUriOverride?: string;
  readonly clientIp?: string;
}

export interface InitiateAuthResult {
  readonly auth_url: string;
  readonly oauth_url?: string;
  readonly state: string;
  readonly model: string;
  readonly browser_launched: boolean;
  readonly message: string;
  readonly code_verifier?: string;
  readonly provider: string;
}

export interface AuthCallbackRequest {
  readonly code: string;
  readonly state?: string;
  readonly clientIp?: string;
  readonly redirectUriOverride?: string;
  readonly manualCodeVerifier?: string;
  readonly model?: string;
}

export interface OAuthTokenResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accountEmail: string;
  readonly accountName: string;
}

/**
 * Strategy Interface for Decoupled OAuth & Authentication Providers.
 * Conforms to:
 * - STD-COD-005: Strategy Pattern & Polymorphic Dispatch
 * - Directive #7: Loosely coupled from application.yml or database
 */
export interface IOAuthProvider {
  readonly providerId: string;
  supports(modelOrProvider: string): boolean;
  initiateAuth(request: InitiateAuthRequest): Promise<InitiateAuthResult>;
  handleCallback(
    request: AuthCallbackRequest,
    authRepository: IAuthRepository,
  ): Promise<ModelAuth>;
  syncCredentials(auth: ModelAuth): Promise<void>;
  clearCredentials(): Promise<void>;
}
