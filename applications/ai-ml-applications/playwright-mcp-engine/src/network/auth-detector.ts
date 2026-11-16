import type {
  AuthEvidence,
  AuthType,
  EndpointAuthClassification,
  InterceptedRequest,
  InterceptedResponse,
} from '@/types/network.js';
import { AUTH_DETECTION, HTTP_HEADERS, HTTP_STATUS } from '@/constants/index.js';

// ============================================================================
// Auth Detection Strategy Interfaces (SOLID: SRP, OCP, LSP, ISP, DIP)
// ============================================================================

export interface IAuthInspectionContext {
  readonly request: InterceptedRequest;
  readonly response?: InterceptedResponse;
  evidence: AuthEvidence[];
  discoveredTypes: Set<AuthType>;
  tokenNames: string[];
  detectedCookies: string[];
  detectedAuthHeader?: string;
  isForbiddenOrUnauthorized: boolean;
}

export interface IAuthInspectionStrategy {
  inspect(context: IAuthInspectionContext): void;
}

export class HeaderAuthInspectionStrategy implements IAuthInspectionStrategy {
  inspect(context: IAuthInspectionContext): void {
    for (const [headerKey, headerVal] of Object.entries(context.request.headers)) {
      const lowerKey = headerKey.toLowerCase();
      const isAuthHeader = (AUTH_DETECTION.HEADER_NAMES as readonly string[]).includes(lowerKey);

      const headerActions: Record<string, () => void> = {
        true: () => {
          context.detectedAuthHeader = headerKey;
          const isAuthorizationHeader = lowerKey === 'authorization';

          const authSchemeHandlers: Record<string, () => void> = {
            true: () => {
              const valLower = headerVal.toLowerCase();
              const isBearer = valLower.startsWith('bearer ');
              const isBasic = valLower.startsWith('basic ');

              const schemeHandlers: Record<string, () => void> = {
                bearer: () => {
                  context.discoveredTypes.add('bearer_token');
                  context.evidence.push({
                    type: 'bearer_token',
                    location: 'header',
                    indicator: `Header '${headerKey}' begins with 'Bearer '`,
                    confidence: 'high',
                    description: 'Bearer JWT or OAuth access token supplied in Authorization header',
                  });
                },
                basic: () => {
                  context.discoveredTypes.add('basic_auth');
                  context.evidence.push({
                    type: 'basic_auth',
                    location: 'header',
                    indicator: `Header '${headerKey}' begins with 'Basic '`,
                    confidence: 'high',
                    description: 'HTTP Basic authentication credentials in Authorization header',
                  });
                },
                custom: () => {
                  context.discoveredTypes.add('custom_auth');
                  context.evidence.push({
                    type: 'custom_auth',
                    location: 'header',
                    indicator: `Header '${headerKey}': ${headerVal.substring(0, 15)}...`,
                    confidence: 'medium',
                    description: 'Custom scheme in Authorization header',
                  });
                },
              };

              const resolvedScheme = isBearer ? 'bearer' : isBasic ? 'basic' : 'custom';
              schemeHandlers[resolvedScheme]();
            },
            false: () => {
              const isApiKeyHeader = lowerKey.includes('api-key') || lowerKey.includes('apikey');
              const customHeaderHandlers: Record<string, () => void> = {
                true: () => {
                  context.discoveredTypes.add('api_key_header');
                  context.tokenNames.push(headerKey);
                  context.evidence.push({
                    type: 'api_key_header',
                    location: 'header',
                    indicator: `Header '${headerKey}' present`,
                    confidence: 'high',
                    description: 'API Key supplied via custom HTTP header',
                  });
                },
                false: () => {
                  context.discoveredTypes.add('custom_auth');
                  context.tokenNames.push(headerKey);
                  context.evidence.push({
                    type: 'custom_auth',
                    location: 'header',
                    indicator: `Auth token header '${headerKey}' present`,
                    confidence: 'medium',
                    description: 'Security or session token detected in header',
                  });
                },
              };
              customHeaderHandlers[String(isApiKeyHeader)]();
            },
          };

          authSchemeHandlers[String(isAuthorizationHeader)]();
        },
        false: () => {},
      };

      headerActions[String(isAuthHeader)]();

      const isCookieHeader = lowerKey === 'cookie';
      const cookieActions: Record<string, () => void> = {
        true: () => {
          const cookies = headerVal.split(';');
          for (const cookie of cookies) {
            const [cName] = cookie.trim().split('=');
            const isAuthCookie =
              Boolean(cName) && AUTH_DETECTION.COOKIE_PATTERNS.some((p) => p.test(cName));

            const cookieRecordActions: Record<string, () => void> = {
              true: () => {
                context.detectedCookies.push(cName);
                context.discoveredTypes.add('cookie_session');
                context.evidence.push({
                  type: 'cookie_session',
                  location: 'cookie',
                  indicator: `Cookie name matches session/auth signature: '${cName}'`,
                  confidence: 'medium',
                  description: 'Session cookie or auth state maintained via cookies',
                });
              },
              false: () => {},
            };
            cookieRecordActions[String(isAuthCookie)]();
          }
        },
        false: () => {},
      };
      cookieActions[String(isCookieHeader)]();
    }
  }
}

export class QueryParamAuthInspectionStrategy implements IAuthInspectionStrategy {
  inspect(context: IAuthInspectionContext): void {
    try {
      const parsedUrl = new URL(context.request.url);
      for (const param of AUTH_DETECTION.QUERY_PARAMS) {
        const hasParam = parsedUrl.searchParams.has(param);
        const paramActions: Record<string, () => void> = {
          true: () => {
            context.discoveredTypes.add('api_key_query');
            context.tokenNames.push(param);
            context.evidence.push({
              type: 'api_key_query',
              location: 'query',
              indicator: `Query parameter '${param}' found in URL`,
              confidence: 'high',
              description: 'API key or access token passed in query string',
            });
          },
          false: () => {},
        };
        paramActions[String(hasParam)]();
      }
    } catch {
      // Ignored
    }
  }
}

export class ResponseAuthInspectionStrategy implements IAuthInspectionStrategy {
  inspect(context: IAuthInspectionContext): void {
    const hasResponse = Boolean(context.response);
    const responseInspectors: Record<string, () => void> = {
      true: () => {
        const res = context.response!;
        const statusMap: Record<number, () => void> = {
          [HTTP_STATUS.UNAUTHORIZED]: () => {
            context.isForbiddenOrUnauthorized = true;
            context.discoveredTypes.add('bearer_token');
            context.evidence.push({
              type: 'bearer_token',
              location: 'status_redirect',
              indicator: 'HTTP 401 Unauthorized response returned',
              confidence: 'high',
              description: 'Endpoint strictly requires authentication credentials to access',
            });
          },
          [HTTP_STATUS.FORBIDDEN]: () => {
            context.isForbiddenOrUnauthorized = true;
            context.discoveredTypes.add('custom_auth');
            context.evidence.push({
              type: 'custom_auth',
              location: 'status_redirect',
              indicator: 'HTTP 403 Forbidden response returned',
              confidence: 'high',
              description: 'Endpoint requires specific authorization or permission scope',
            });
          },
          [HTTP_STATUS.FOUND]: () => this.handleRedirect(res, context),
          [HTTP_STATUS.TEMPORARY_REDIRECT]: () => this.handleRedirect(res, context),
        };

        const handler = statusMap[res.status];
        const statusActions: Record<string, () => void> = {
          true: () => handler!(),
          false: () => {},
        };
        statusActions[String(Boolean(handler))]();

        const hasBody = Boolean(res.bodyPreview);
        const bodyActions: Record<string, () => void> = {
          true: () => {
            const lowerBody = res.bodyPreview!.toLowerCase();
            const hasAuthExpiration = (AUTH_DETECTION.TOKEN_EXPIRED_MESSAGES as readonly string[]).some(
              (msg) => lowerBody.includes(msg)
            );

            const authBodyActions: Record<string, () => void> = {
              true: () => {
                context.isForbiddenOrUnauthorized = true;
                context.evidence.push({
                  type: 'bearer_token',
                  location: 'body',
                  indicator: 'Response body contains token expiration or unauthorized message',
                  confidence: 'high',
                  description: 'API response body confirms JWT/token authorization required',
                });
              },
              false: () => {},
            };
            authBodyActions[String(hasAuthExpiration)]();
          },
          false: () => {},
        };
        bodyActions[String(hasBody)]();
      },
      false: () => {},
    };

    responseInspectors[String(hasResponse)]();
  }

  private handleRedirect(res: InterceptedResponse, context: IAuthInspectionContext): void {
    const location = res.headers[HTTP_HEADERS.LOCATION_LOWER] || res.headers[HTTP_HEADERS.LOCATION];
    const isAuthRedirect =
      Boolean(location) && AUTH_DETECTION.URL_PATTERNS.some((p) => p.test(location));

    const redirectActions: Record<string, () => void> = {
      true: () => {
        context.discoveredTypes.add('oauth2_flow');
        context.evidence.push({
          type: 'oauth2_flow',
          location: 'status_redirect',
          indicator: `Redirects (HTTP ${res.status}) to authentication URL: ${location}`,
          confidence: 'high',
          description: 'Redirect to SSO or OAuth2 login provider detected',
        });
      },
      false: () => {},
    };
    redirectActions[String(isAuthRedirect)]();
  }
}

// ============================================================================
// Auth Detector Pipeline (SOLID: Facade / Orchestrator)
// ============================================================================

export class AuthDetector {
  private static readonly INSPECTION_PIPELINE: IAuthInspectionStrategy[] = [
    new HeaderAuthInspectionStrategy(),
    new QueryParamAuthInspectionStrategy(),
    new ResponseAuthInspectionStrategy(),
  ];

  private static readonly PRIORITY_ORDER: AuthType[] = [
    'bearer_token',
    'api_key_header',
    'oauth2_flow',
    'cookie_session',
    'basic_auth',
    'api_key_query',
    'custom_auth',
  ];

  static classify(
    request: InterceptedRequest,
    response?: InterceptedResponse
  ): EndpointAuthClassification {
    const context: IAuthInspectionContext = {
      request,
      response,
      evidence: [],
      discoveredTypes: new Set<AuthType>(),
      tokenNames: [],
      detectedCookies: [],
      isForbiddenOrUnauthorized: false,
    };

    for (const strategy of this.INSPECTION_PIPELINE) {
      strategy.inspect(context);
    }

    const typeList = Array.from(context.discoveredTypes);
    const primaryType = this.PRIORITY_ORDER.find((t) => typeList.includes(t)) ?? 'none';
    const requiresAuth = primaryType !== 'none' || context.isForbiddenOrUnauthorized;

    const recommendationGenerators: Record<string, () => string> = {
      true: () => {
        const specificRecommendations: Record<string, string> = {
          bearer_token: 'Attach Authorization header with valid Bearer token.',
          api_key_header: `Provide API Key in header '${context.detectedAuthHeader || 'X-API-Key'}'.`,
          cookie_session: `Ensure authenticated session cookies (${context.detectedCookies.join(', ') || 'session'}) are included.`,
        };

        const defaultAuthRecommendation =
          context.isForbiddenOrUnauthorized
            ? 'Authentication credentials or elevated role permissions required.'
            : 'Authentication credentials required.';

        return specificRecommendations[primaryType] ?? defaultAuthRecommendation;
      },
      false: () => 'Public endpoint - accessible without credentials.',
    };

    const recommendation = recommendationGenerators[String(requiresAuth)]();

    return {
      requiresAuth,
      primaryAuthType: primaryType,
      authTypes: typeList,
      evidence: context.evidence,
      tokenNames: context.tokenNames,
      isForbiddenOrUnauthorized: context.isForbiddenOrUnauthorized,
      authHeaderName: context.detectedAuthHeader,
      cookieNames: context.detectedCookies.length > 0 ? context.detectedCookies : undefined,
      recommendation,
    };
  }
}
