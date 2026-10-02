/**
 * Enterprise API client layer communicating with ModelBox Backend Services.
 */

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

import { envConfig } from '@/config/env.config';

const BASE_URL = envConfig.backendBaseUrl;

export const apiClient = {
  async getHealth(): Promise<any> {
    const res = await fetch('/health');
    return res.json();
  },

  async getConnections(): Promise<ModelConnection[]> {
    const res = await fetch(`${BASE_URL}/connections`);
    if (!res.ok) throw new Error('Failed to fetch connections');
    return res.json();
  },

  async getEnvironment(): Promise<EnvironmentInfo> {
    const res = await fetch(`${BASE_URL}/environment`);
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

  getImageUrl(connectionId: string, filename: string): string {
    return `${BASE_URL}/media/image?connection_id=${encodeURIComponent(connectionId)}&filename=${encodeURIComponent(filename)}`;
  },

  getVideoStreamUrl(connectionId: string, videoId: string): string {
    return `${BASE_URL}/media/video?connection_id=${encodeURIComponent(connectionId)}&video_id=${encodeURIComponent(videoId)}`;
  }
};
