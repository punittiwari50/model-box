import type { IOAuthTokenExchangeResult, ITokenValidationResult, OAuthExchangeRequest } from "@/services/oauth/types";

/**
 * Strategy interface for OAuth token operations.
 * Conforms to:
 * - STD-COD-005: Strategy & Factory Pattern
 * - STD-COD-007: Resilient Error Contracts & No Null Returns
 */
export interface IOAuthExecutor {
  exchangeCode(request: OAuthExchangeRequest): Promise<IOAuthTokenExchangeResult>;
  validateToken(token: string, modelId: string, prompt?: string): Promise<ITokenValidationResult>;
}
