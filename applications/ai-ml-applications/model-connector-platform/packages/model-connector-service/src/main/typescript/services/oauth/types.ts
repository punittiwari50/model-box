export interface IOAuthTokenExchangeResult {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly tokenType: string;
  readonly expiresInSeconds: number;
  readonly scopes: readonly string[];
  readonly userEmail: string;
  readonly userName?: string;
  readonly provider: string;
  readonly authorizedTimestamp: string;
}

export interface ITokenValidationResult {
  readonly status: "VERIFIED" | "FAILED" | "DEGRADED";
  readonly protocol: string;
  readonly message: string;
  readonly latencyMs: number;
  readonly email?: string;
  readonly scopes?: readonly string[];
  readonly expiresInSeconds?: number;
  readonly modelOutput?: string;
  readonly errorMessage?: string;
  readonly details: Record<string, unknown>;
}

export interface OAuthExchangeRequest {
  readonly code: string;
  readonly modelId: string;
  readonly provider: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly redirectUri?: string;
  readonly userEmail?: string;
  readonly pkceCodeVerifier?: string;
}
