import type {
  IOAuthTokenExchangeResult,
  ITokenValidationResult,
  OAuthExchangeRequest,
} from "@/auth/oauth/types.js";

export interface IOAuthExecutor {
  exchangeCode(request: OAuthExchangeRequest): Promise<IOAuthTokenExchangeResult>;
  validateToken(token: string, modelId: string, prompt?: string): Promise<ITokenValidationResult>;
}
