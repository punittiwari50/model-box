export type AuthType =
  | 'bearer_token'
  | 'basic_auth'
  | 'cookie_session'
  | 'api_key_header'
  | 'api_key_query'
  | 'oauth2_flow'
  | 'custom_auth'
  | 'none';

export type AuthLocation = 'header' | 'cookie' | 'query' | 'body' | 'status_redirect' | 'none';

export type AuthConfidence = 'high' | 'medium' | 'low';

export interface AuthEvidence {
  type: AuthType;
  location: AuthLocation;
  indicator: string;
  confidence: AuthConfidence;
  description: string;
}

export interface EndpointAuthClassification {
  requiresAuth: boolean;
  primaryAuthType: AuthType;
  authTypes: AuthType[];
  evidence: AuthEvidence[];
  tokenNames: string[];
  isForbiddenOrUnauthorized: boolean;
  authHeaderName?: string;
  cookieNames?: string[];
  recommendation: string;
}

export interface InterceptedRequest {
  id: string;
  url: string;
  pathname: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType: string;
  timestamp: number;
}

export interface InterceptedResponse {
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType: string;
  bodyPreview?: string;
  contentLength: number;
  timestamp: number;
  durationMs: number;
}

export interface EndpointRecord {
  endpointKey: string; // e.g. "POST /api/v1/auth/login"
  method: string;
  url: string;
  origin: string;
  pathname: string;
  requestCount: number;
  responseCount: number;
  sampleStatus: number;
  statusCodes: number[];
  authClassification: EndpointAuthClassification;
  sampleRequest: {
    headers: Record<string, string>;
    bodySnippet?: string;
  };
  sampleResponse?: {
    status: number;
    headers: Record<string, string>;
    bodySnippet?: string;
    mimeType: string;
  };
  firstSeen: string;
  lastSeen: string;
}

export interface EndpointCatalogSummary {
  baseUrl: string;
  totalUniqueEndpoints: number;
  totalRequestsCaptured: number;
  totalResponsesCaptured: number;
  authRequiredEndpointsCount: number;
  publicEndpointsCount: number;
  authBreakdown: Record<AuthType, number>;
  endpoints: EndpointRecord[];
}
