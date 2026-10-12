import type { GOOGLE_XRAY_CONSTANTS } from '@/constants/index.js';

export type XRayTargetPlatform =
  (typeof GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS)[keyof typeof GOOGLE_XRAY_CONSTANTS.TARGET_PLATFORMS];

export interface XRayQueryParams {
  platform: XRayTargetPlatform;
  role?: string;
  skills?: string[];
  location?: string;
  company?: string;
  seniority?: string;
  fileType?: string;
  mustInclude?: string[];
  anyOf?: string[];
  exclude?: string[];
  customSite?: string;
  customRawQuery?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface XRayProfileMetadata {
  name?: string;
  headline?: string;
  location?: string;
  company?: string;
  skillsFound?: string[];
  handle?: string;
}

export interface XRaySearchResultItem {
  id: string;
  rank: number;
  platform: XRayTargetPlatform;
  title: string;
  url: string;
  snippet: string;
  metadata: XRayProfileMetadata;
  timestamp: string;
}

export interface XRaySearchResponse {
  searchId: string;
  platform: XRayTargetPlatform;
  computedQuery: string;
  googleSearchUrl: string;
  totalResultsFound: number;
  durationMs: number;
  circuitBreakerStatus: string;
  workerSlotId: number;
  items: XRaySearchResultItem[];
  error?: string;
}

export interface XRayTemplate {
  id: string;
  name: string;
  platform: XRayTargetPlatform;
  description: string;
  sampleParams: Partial<XRayQueryParams>;
}
