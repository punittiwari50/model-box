/**
 * Enterprise API client layer communicating with ModelBox Backend Services.
 */

import { envConfig } from '@/config/env.config';

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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
};
