import { IRoutingStrategy } from './IRoutingStrategy';
import { ContainerServiceTarget, ExecutionRoutingMode, RoutingEndpointConfig } from './types';
import { HttpConstants } from '@/config/constants';

/**
 * Default Secure Strategy: Directs all traffic through the backend API gateway service.
 * Enforces the BFF Security pattern: keeping internal infrastructure tokens, direct database,
 * and container ports hidden behind the authenticated gateway service.
 *
 * Implemented using pure GoF Strategy Pattern and Map dispatching without if/switch.
 */
export class ServiceGatewayRoutingStrategy implements IRoutingStrategy {
  public readonly mode = ExecutionRoutingMode.SERVICE_GATEWAY;
  public readonly isMeshDirect = false;
  private readonly gatewayBaseUrl: string;

  private static readonly pathPrefixer = new Map<boolean, (p: string) => string>([
    [true, (p) => p],
    [false, (p) => `/${p}`],
  ]);

  constructor(gatewayBaseUrl: string = '/api/v1') {
    this.gatewayBaseUrl = gatewayBaseUrl.replace(/\/+$/, '');
  }

  public resolveEndpoint(_target: ContainerServiceTarget, path: string): string {
    const formatter = ServiceGatewayRoutingStrategy.pathPrefixer.get(path.startsWith('/'))
      ?? ServiceGatewayRoutingStrategy.pathPrefixer.get(false)!;
    const cleanPath = formatter(path);
    return `${this.gatewayBaseUrl}${cleanPath}`;
  }

  public resolveHeaders(_target: ContainerServiceTarget, customHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      [HttpConstants.HEADER_CONTENT_TYPE]: HttpConstants.CONTENT_TYPE_JSON,
      [HttpConstants.HEADER_ACCEPT]: HttpConstants.CONTENT_TYPE_JSON,
      'X-Execution-Route': this.mode,
      ...customHeaders,
    };
  }

  public getConfig(target: ContainerServiceTarget): RoutingEndpointConfig {
    return {
      baseUrl: this.gatewayBaseUrl,
      defaultHeaders: this.resolveHeaders(target),
      isDirectMesh: false,
    };
  }
}
