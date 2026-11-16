import type {
  AuthType,
  EndpointCatalogSummary,
  EndpointRecord,
  InterceptedRequest,
  InterceptedResponse,
} from '@/types/network.js';
import { AuthDetector } from '@/network/auth-detector.js';

export class EndpointCatalog {
  private baseUrl: string;
  private endpoints = new Map<string, EndpointRecord>();
  private totalRequests = 0;
  private totalResponses = 0;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  private getEndpointKey(method: string, url: string): { key: string; origin: string; pathname: string } {
    try {
      const parsed = new URL(url);
      const origin = parsed.origin;
      const pathname = parsed.pathname;
      const key = `${method.toUpperCase()} ${origin}${pathname}`;
      return { key, origin, pathname };
    } catch {
      return { key: `${method.toUpperCase()} ${url}`, origin: '', pathname: url };
    }
  }

  recordRequest(req: InterceptedRequest): void {
    this.totalRequests++;
    const { key, origin, pathname } = this.getEndpointKey(req.method, req.url);

    const existing = this.endpoints.get(key);
    const hasExisting = Boolean(existing);

    const recordActions: Record<string, () => void> = {
      false: () => {
        const authClassification = AuthDetector.classify(req);
        const record: EndpointRecord = {
          endpointKey: key,
          method: req.method.toUpperCase(),
          url: req.url,
          origin,
          pathname,
          requestCount: 1,
          responseCount: 0,
          sampleStatus: 0,
          statusCodes: [],
          authClassification,
          sampleRequest: {
            headers: req.headers,
            bodySnippet: req.postData?.substring(0, 1000),
          },
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        };
        this.endpoints.set(key, record);
      },
      true: () => {
        existing!.requestCount++;
        existing!.lastSeen = new Date().toISOString();

        const newAuth = AuthDetector.classify(req);
        const shouldUpgradeAuth = newAuth.requiresAuth && !existing!.authClassification.requiresAuth;

        const upgradeActions: Record<string, () => void> = {
          true: () => {
            existing!.authClassification = newAuth;
          },
          false: () => {},
        };
        upgradeActions[String(shouldUpgradeAuth)]();
      },
    };

    recordActions[String(hasExisting)]();
  }

  recordResponse(req: InterceptedRequest | undefined, res: InterceptedResponse): void {
    this.totalResponses++;
    const method = req?.method || 'GET';
    const { key } = this.getEndpointKey(method, res.url);

    const existing = this.endpoints.get(key);
    const hasExisting = Boolean(existing);

    const responseActions: Record<string, () => void> = {
      true: () => {
        existing!.responseCount++;
        existing!.sampleStatus = res.status;

        const hasStatusCode = existing!.statusCodes.includes(res.status);
        const statusActions: Record<string, () => void> = {
          false: () => existing!.statusCodes.push(res.status),
          true: () => {},
        };
        statusActions[String(hasStatusCode)]();

        existing!.lastSeen = new Date().toISOString();

        const hasSampleResponse = Boolean(existing!.sampleResponse);
        const sampleResponseActions: Record<string, () => void> = {
          false: () => {
            existing!.sampleResponse = {
              status: res.status,
              headers: res.headers,
              bodySnippet: res.bodyPreview,
              mimeType: res.mimeType,
            };
          },
          true: () => {},
        };
        sampleResponseActions[String(hasSampleResponse)]();

        const hasReq = Boolean(req);
        const enrichActions: Record<string, () => void> = {
          true: () => {
            const enrichedAuth = AuthDetector.classify(req!, res);
            const shouldEnrich =
              enrichedAuth.requiresAuth || enrichedAuth.isForbiddenOrUnauthorized;
            const applyEnrichActions: Record<string, () => void> = {
              true: () => {
                existing!.authClassification = enrichedAuth;
              },
              false: () => {},
            };
            applyEnrichActions[String(shouldEnrich)]();
          },
          false: () => {},
        };
        enrichActions[String(hasReq)]();
      },
      false: () => {},
    };

    responseActions[String(hasExisting)]();
  }

  getSummary(): EndpointCatalogSummary {
    const records = Array.from(this.endpoints.values());
    const authBreakdown: Record<AuthType, number> = {
      bearer_token: 0,
      basic_auth: 0,
      cookie_session: 0,
      api_key_header: 0,
      api_key_query: 0,
      oauth2_flow: 0,
      custom_auth: 0,
      none: 0,
    };

    let authRequiredCount = 0;
    let publicCount = 0;

    for (const record of records) {
      const isAuthReq = record.authClassification.requiresAuth;
      const countActions: Record<string, () => void> = {
        true: () => {
          authRequiredCount++;
          authBreakdown[record.authClassification.primaryAuthType] =
            (authBreakdown[record.authClassification.primaryAuthType] || 0) + 1;
        },
        false: () => {
          publicCount++;
          authBreakdown.none = (authBreakdown.none || 0) + 1;
        },
      };
      countActions[String(isAuthReq)]();
    }

    return {
      baseUrl: this.baseUrl,
      totalUniqueEndpoints: records.length,
      totalRequestsCaptured: this.totalRequests,
      totalResponsesCaptured: this.totalResponses,
      authRequiredEndpointsCount: authRequiredCount,
      publicEndpointsCount: publicCount,
      authBreakdown,
      endpoints: records,
    };
  }

  getAuthProtectedEndpoints(): EndpointRecord[] {
    return Array.from(this.endpoints.values()).filter((e) => e.authClassification.requiresAuth);
  }

  reset(): void {
    this.endpoints.clear();
    this.totalRequests = 0;
    this.totalResponses = 0;
  }
}
