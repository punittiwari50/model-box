/**
 * Environment configuration for ModelBox Connectors UI.
 * Categorized and centralized within config/environment/.
 */

export interface UIEnvironmentConfig {
  backendBaseUrl: string;
  defaultPollIntervalMs: number;
  maxStreamBufferSize: number;
  enableDebugLogs: boolean;
}

export const envConfig: UIEnvironmentConfig = {
  backendBaseUrl: (typeof window !== "undefined" && (window as any).__MODELBOX_BACKEND_URL__) || "/api/v1",
  defaultPollIntervalMs: 3000,
  maxStreamBufferSize: 10 * 1024 * 1024,
  enableDebugLogs: false,
};
