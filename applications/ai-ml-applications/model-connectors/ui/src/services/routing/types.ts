/**
 * Routing targets across microservices and container mesh.
 * Centralized enumerations for polymorphic execution dispatching.
 */

export enum ContainerServiceTarget {
  GATEWAY_SERVICE = 'GATEWAY_SERVICE',
  VAULT = 'VAULT',
  DATABASE = 'DATABASE',
  OLLAMA = 'OLLAMA',
  COMFYUI = 'COMFYUI',
  PLAYWRIGHT_MCP = 'PLAYWRIGHT_MCP',
}

export enum ExecutionRoutingMode {
  SERVICE_GATEWAY = 'SERVICE_GATEWAY',             // Default secure BFF flow (least privilege)
  DIRECT_CONTAINER_MESH = 'DIRECT_CONTAINER_MESH', // Direct mesh access when feature flag is ON
}

export interface RoutingEndpointConfig {
  baseUrl: string;
  defaultHeaders: Record<string, string>;
  isDirectMesh: boolean;
}
