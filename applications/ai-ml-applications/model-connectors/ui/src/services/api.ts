/**
 * Enterprise API client layer communicating with ModelBox Backend Services.
 */

import { envConfig } from '@/config/env.config';
import { HttpConstants } from '@/config/constants';
import type { SearchExecutionPayload } from '@/types/automation';
import {
  routingRegistry,
  ContainerServiceTarget,
  ExecutionRoutingMode,
} from '@/services/routing';

const resolveEndpoint = (target: ContainerServiceTarget, path: string): string => {
  return routingRegistry.resolveEndpoint(target, path);
};

const resolveHeaders = (target: ContainerServiceTarget, custom?: Record<string, string>): Record<string, string> => {
  return routingRegistry.resolveHeaders(target, custom);
};

export interface ModelConnection {
  connection_id: string;
  name: string;
  protocol: 'REST' | 'WEBSOCKET' | 'GRPC' | 'KAFKA' | 'COOKIE_SESSION';
  endpoint_url: string;
  model_name: string;
  token_capacity: number;
  token_refill_rate_per_sec: number;
  storage_backend: string;
}

export interface Project {
  project_id: string;
  name: string;
  description: string;
  tags: string[];
  assigned_users: string[];
  system_prompt: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface ChatMessage {
  message_id: string;
  session_id: string;
  project_id?: string;
  user_tag?: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | string;
  content: string;
  token_count: number;
  timestamp: string;
  model_name: string;
  connector_protocol: string;
  metadata?: Record<string, any>;
}

export interface EnvironmentInfo {
  active_profiles: string[];
  default_profiles: string[];
  property_sources: Array<{
    name: string;
    properties_count: number;
    sample: Record<string, any>;
  }>;
}

export interface InferenceResponse {
  response_id: string;
  session_id: string;
  content: string;
  token_metrics: {
    tokens_consumed_total: number;
    tokens_consumed_request: number;
    tokens_available: number;
    bucket_capacity: number;
    refill_rate_per_second: number;
  };
  execution_duration_ms: number;
  raw_payload?: Record<string, any>;
}

export interface PortalJobRequirement {
  job_id: string;
  job_title: string;
  company_name: string;
  location?: string;
  workplace_type?: string;
  experience_level?: string;
  linkedin_url?: string;
  official_apply_url?: string;
  first_listed_at?: string;
  salary_insights?: string;
  tech_stack_json?: string[];
  markdown_file_path?: string;
  extracted_at: string;
}

export interface AuthCookieState {
  exists: boolean;
  cookieCount: number;
  originCount?: number;
  domains: string[];
  lastModified?: string;
  storageStatePath?: string;
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
  }>;
}

const BASE_URL = envConfig.backendBaseUrl;

export const apiClient = {
  async getHealth(): Promise<any> {
    const res = await fetch('/health');
    return res.json();
  },

  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${BASE_URL}/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  },

  async getProjectMessages(projectId: string): Promise<ChatMessage[]> {
    const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectId)}/messages`);
    if (!res.ok) throw new Error('Failed to fetch project messages');
    return res.json();
  },

  async getConnections(): Promise<ModelConnection[]> {
    const res = await fetch(`${BASE_URL}/connections`);
    if (!res.ok) throw new Error('Failed to fetch connections');
    return res.json();
  },

  async getEnvironment(): Promise<EnvironmentInfo> {
    const res = await fetch(`${BASE_URL}/env`);
    if (!res.ok) throw new Error('Failed to fetch environment configuration');
    return res.json();
  },

  async executeInference(data: {
    session_id: string;
    prompt: string;
    connection_id: string;
    user_id?: string;
    cookie_id?: string;
    model_name?: string;
    project_id?: string;
    user_tag?: string;
    parameters?: Record<string, any>;
  }): Promise<InferenceResponse> {
    const res = await fetch(`${BASE_URL}/inference`, {
      method: 'POST',
      headers: { [HttpConstants.HEADER_CONTENT_TYPE]: HttpConstants.CONTENT_TYPE_JSON },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Inference failed' }));
      throw new Error(err.detail || 'Inference execution failed');
    }
    return res.json();
  },

  async getTokenMetrics(connectionId: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/tokens/${connectionId}`);
    if (!res.ok) throw new Error('Failed to fetch token status');
    return res.json();
  },

  getImageUrl(serviceOrFilename: string, filename?: string): string {
    const file = filename || serviceOrFilename;
    return `${BASE_URL}/media/images/${encodeURIComponent(file)}`;
  },

  getVideoStreamUrl(serviceOrFilename: string, filename?: string): string {
    const file = filename || serviceOrFilename;
    return `${BASE_URL}/media/videos/${encodeURIComponent(file)}`;
  },

  async getPlaywrightSchema(): Promise<any> {
    const res = await fetch(`${BASE_URL}/mcp/playwright/schema`);
    if (!res.ok) throw new Error('Failed to fetch Playwright testing JSON schema');
    return res.json();
  },

  async getPlaywrightTemplates(): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/mcp/playwright/templates`);
    if (!res.ok) throw new Error('Failed to fetch Playwright testing templates');
    return res.json();
  },

  async executePlaywrightTest(workflow: any): Promise<any> {
    const res = await fetch(`${BASE_URL}/mcp/playwright/test`, {
      method: 'POST',
      headers: { [HttpConstants.HEADER_CONTENT_TYPE]: HttpConstants.CONTENT_TYPE_JSON },
      body: JSON.stringify(workflow),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Test execution failed' }));
      throw new Error(err.detail || 'Test execution failed');
    }
    return res.json();
  },

  async getPlaywrightTools(): Promise<any> {
    const res = await fetch(`${BASE_URL}/mcp/playwright/tools`);
    if (!res.ok) throw new Error('Failed to fetch Playwright MCP tools');
    return res.json();
  },

  async getTrustedPortals(): Promise<any> {
    const res = await fetch(`${BASE_URL}/mcp/playwright/portals`);
    const statusHandler = new Map<boolean, () => void>([
      [false, () => { throw new Error('Failed to fetch official trusted portals'); }],
      [true, () => {}],
    ]);
    (statusHandler.get(res.ok) ?? (() => {}))();
    return res.json();
  },

  async generatePlaywrightFlow(req: {
    flow_id?: string;
    purpose: string;
    target_role_or_query: string;
    user_query?: string;
    sort_by?: string;
    audio_transcript?: string;
    image_url?: string;
    base_url?: string;
    data_source?: {
      source_type: string;
      path_or_table?: string;
      sheet_name?: string;
      row_or_key?: string;
      query_params?: Record<string, any>;
    };
    existing_flow_changes?: Record<string, any>;
    dry_run?: boolean;
    model_name?: string;
    use_google_xray?: boolean;
  }): Promise<any> {
    const res = await fetch(`${BASE_URL}/mcp/playwright/flow/generate`, {
      method: 'POST',
      headers: { [HttpConstants.HEADER_CONTENT_TYPE]: HttpConstants.CONTENT_TYPE_JSON },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Flow generation failed' }));
      throw new Error(err.detail || 'Flow generation failed');
    }
    return res.json();
  },

  async listPlaywrightFlows(purpose?: string): Promise<any[]> {
    const query = purpose ? `?purpose=${encodeURIComponent(purpose)}` : '';
    const res = await fetch(`${BASE_URL}/mcp/playwright/flows${query}`);
    if (!res.ok) throw new Error('Failed to fetch Playwright test flows');
    return res.json();
  },

  async getXRayPractices(category?: string): Promise<any> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const res = await fetch(`${BASE_URL}/xray/practices${query}`);
    if (!res.ok) throw new Error('Failed to fetch X-Ray best practices');
    return res.json();
  },

  async executeEnterpriseSearch(data: SearchExecutionPayload): Promise<any> {
    const res = await fetch(`${BASE_URL}/xray/search`, {
      method: 'POST',
      headers: { [HttpConstants.HEADER_CONTENT_TYPE]: HttpConstants.CONTENT_TYPE_JSON },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Search execution failed' }));
      throw new Error(err.detail || 'Enterprise search execution failed');
    }
    return res.json();
  },

  async getCurrentGeography(): Promise<any> {
    const res = await fetch(`${BASE_URL}/geography/current`);
    if (!res.ok) throw new Error('Failed to fetch user geography');
    return res.json();
  },

  async getPlaywrightFlow(flowId: string): Promise<any> {
    const url = resolveEndpoint(ContainerServiceTarget.GATEWAY_SERVICE, `/mcp/playwright/flow/${encodeURIComponent(flowId)}`);
    const res = await fetch(url, { headers: resolveHeaders(ContainerServiceTarget.GATEWAY_SERVICE) });
    if (!res.ok) throw new Error('Failed to fetch Playwright flow');
    return res.json();
  },

  async createPlaywrightFlow(record: any): Promise<any> {
    const url = resolveEndpoint(ContainerServiceTarget.GATEWAY_SERVICE, '/mcp/playwright/flow');
    const res = await fetch(url, {
      method: 'POST',
      headers: resolveHeaders(ContainerServiceTarget.GATEWAY_SERVICE, {
        [HttpConstants.HEADER_CONTENT_TYPE]: HttpConstants.CONTENT_TYPE_JSON,
      }),
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Create flow failed' }));
      throw new Error(err.detail || 'Failed to create flow');
    }
    return res.json();
  },

  async updatePlaywrightFlow(flowId: string, record: any): Promise<any> {
    const url = resolveEndpoint(ContainerServiceTarget.GATEWAY_SERVICE, `/mcp/playwright/flow/${encodeURIComponent(flowId)}`);
    const res = await fetch(url, {
      method: 'PUT',
      headers: resolveHeaders(ContainerServiceTarget.GATEWAY_SERVICE, {
        [HttpConstants.HEADER_CONTENT_TYPE]: HttpConstants.CONTENT_TYPE_JSON,
      }),
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Update flow failed' }));
      throw new Error(err.detail || 'Failed to update flow');
    }
    return res.json();
  },

  async deletePlaywrightFlow(flowId: string): Promise<any> {
    const url = resolveEndpoint(ContainerServiceTarget.GATEWAY_SERVICE, `/mcp/playwright/flow/${encodeURIComponent(flowId)}`);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: resolveHeaders(ContainerServiceTarget.GATEWAY_SERVICE),
    });
    if (!res.ok) throw new Error(`Failed to delete flow '${flowId}'`);
    return res.json();
  },

  // Strategy Pattern Routing Controls
  getRoutingMode(): ExecutionRoutingMode {
    return routingRegistry.getMode();
  },

  setRoutingMode(mode: ExecutionRoutingMode): void {
    routingRegistry.setMode(mode);
  },

  toggleRoutingMode(): ExecutionRoutingMode {
    return routingRegistry.toggle();
  },

  isDirectMeshActive(): boolean {
    return routingRegistry.isDirectMeshActive();
  },

  subscribeRoutingMode(listener: (mode: ExecutionRoutingMode) => void): () => void {
    return routingRegistry.subscribe(listener);
  },

  async probeContainerDirect(target: ContainerServiceTarget, path = ''): Promise<{ target: string; url: string; status: number; ok: boolean }> {
    const url = routingRegistry.resolveEndpoint(target, path);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: routingRegistry.resolveHeaders(target),
      });
      return { target, url, status: res.status, ok: res.ok };
    } catch {
      return { target, url, status: 0, ok: false };
    }
  },

  async getPortalJobs(limit = 50, offset = 0): Promise<{ jobs: PortalJobRequirement[]; count: number; sorted_by: string }> {
    const res = await fetch(`${BASE_URL}/jobs?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error('Failed to fetch portal job requirements');
    return res.json();
  },

  async getAuthCookies(): Promise<AuthCookieState> {
    const res = await fetch(`${BASE_URL}/jobs/cookies`);
    if (!res.ok) throw new Error('Failed to fetch browser authentication cookies');
    return res.json();
  },

  async importAuthCookies(cookies: any[], origins: any[] = []): Promise<any> {
    const res = await fetch(`${BASE_URL}/jobs/cookies`, {
      method: 'POST',
      headers: { [HttpConstants.HEADER_CONTENT_TYPE]: HttpConstants.CONTENT_TYPE_JSON },
      body: JSON.stringify({ cookies, origins }),
    });
    if (!res.ok) throw new Error('Failed to import authentication cookies');
    return res.json();
  },

  async exportAuthCookies(): Promise<any> {
    const res = await fetch(`${BASE_URL}/jobs/cookies/export`);
    if (!res.ok) throw new Error('Failed to export authentication cookies');
    return res.json();
  },

  async clearAuthCookies(): Promise<any> {
    const res = await fetch(`${BASE_URL}/jobs/cookies`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to clear authentication cookies');
    return res.json();
  },
};


