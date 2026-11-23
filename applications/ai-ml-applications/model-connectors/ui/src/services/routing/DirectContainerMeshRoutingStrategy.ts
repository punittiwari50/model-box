import { IRoutingStrategy } from './IRoutingStrategy';
import { ContainerServiceTarget, ExecutionRoutingMode, RoutingEndpointConfig } from './types';
import { HttpConstants } from '@/config/constants';

/**
 * Direct Container Mesh Strategy (Feature Flag ON):
 * Bypasses the gateway and connects directly to individual container services
 * (Vault :8200, Postgres metadata :5432, Ollama :11434, ComfyUI :8188, MCP :8931).
 *
 * Implemented using pure GoF Strategy Pattern and Polymorphic Map Lookups.
 * Strictly avoids if / if..else / switch statements.
 */
export class DirectContainerMeshRoutingStrategy implements IRoutingStrategy {
  public readonly mode = ExecutionRoutingMode.DIRECT_CONTAINER_MESH;
  public readonly isMeshDirect = true;

  // Polymorphic endpoint map (Registry pattern avoiding if/else or switch)
  private readonly endpointRegistry: ReadonlyMap<ContainerServiceTarget, string>;

  // Path prefixer dispatched via boolean map lookup
  private static readonly pathPrefixer = new Map<boolean, (p: string) => string>([
    [true, (p) => p],
    [false, (p) => `/${p}`],
  ]);

  constructor(customEndpoints?: Partial<Record<ContainerServiceTarget, string>>) {
    const customEntries = Object.entries(customEndpoints ?? {});
    this.endpointRegistry = new Map<ContainerServiceTarget, string>([
      [ContainerServiceTarget.GATEWAY_SERVICE, 'http://model-connectors-service:8000/api/v1'],
      [ContainerServiceTarget.VAULT, 'http://model-connectors-vault:8200'],
      [ContainerServiceTarget.DATABASE, 'http://model-connectors-postgres:5432'],
      [ContainerServiceTarget.OLLAMA, 'http://ollama-model-service-gpu:11434'],
      [ContainerServiceTarget.COMFYUI, 'http://comfyui-model-service-gpu:8188'],
      [ContainerServiceTarget.PLAYWRIGHT_MCP, 'http://playwright-mcp:8931'],
      ...(customEntries as [ContainerServiceTarget, string][]),
    ]);
  }

  public resolveEndpoint(target: ContainerServiceTarget, path: string): string {
    const base = this.endpointRegistry.get(target) ?? 'http://model-connectors-service:8000/api/v1';
    const formatter = DirectContainerMeshRoutingStrategy.pathPrefixer.get(path.startsWith('/'))
      ?? DirectContainerMeshRoutingStrategy.pathPrefixer.get(false)!;
    const cleanPath = formatter(path);
    return `${base.replace(/\/+$/, '')}${cleanPath}`;
  }

  public resolveHeaders(target: ContainerServiceTarget, customHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      [HttpConstants.HEADER_CONTENT_TYPE]: HttpConstants.CONTENT_TYPE_JSON,
      [HttpConstants.HEADER_ACCEPT]: HttpConstants.CONTENT_TYPE_JSON,
      'X-Execution-Route': this.mode,
      'X-Container-Target': target,
      ...customHeaders,
    };
  }

  public getConfig(target: ContainerServiceTarget): RoutingEndpointConfig {
    const base = this.endpointRegistry.get(target) ?? 'http://model-connectors-service:8000/api/v1';
    return {
      baseUrl: base,
      defaultHeaders: this.resolveHeaders(target),
      isDirectMesh: true,
    };
  }
}
