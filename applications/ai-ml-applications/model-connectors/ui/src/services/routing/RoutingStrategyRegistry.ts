import { IRoutingStrategy } from './IRoutingStrategy';
import { ServiceGatewayRoutingStrategy } from './ServiceGatewayRoutingStrategy';
import { DirectContainerMeshRoutingStrategy } from './DirectContainerMeshRoutingStrategy';
import { ContainerServiceTarget, ExecutionRoutingMode } from './types';

/**
 * Strategy Registry implementing GoF Registry & State patterns.
 * Resolves routing purely through polymorphic Map lookups.
 * Strictly eliminates if / if..else / switch statements.
 */
export class RoutingStrategyRegistry {
  private readonly strategyMap: ReadonlyMap<ExecutionRoutingMode, IRoutingStrategy>;
  private activeMode: ExecutionRoutingMode;
  private readonly listeners: Set<(mode: ExecutionRoutingMode) => void> = new Set();

  constructor(
    defaultMode: ExecutionRoutingMode = ExecutionRoutingMode.SERVICE_GATEWAY,
    gatewayBaseUrl?: string,
  ) {
    this.activeMode = defaultMode;
    // Map-based polymorphic registry
    this.strategyMap = new Map<ExecutionRoutingMode, IRoutingStrategy>([
      [ExecutionRoutingMode.SERVICE_GATEWAY, new ServiceGatewayRoutingStrategy(gatewayBaseUrl)],
      [ExecutionRoutingMode.DIRECT_CONTAINER_MESH, new DirectContainerMeshRoutingStrategy()],
    ]);
  }

  public getActiveStrategy(): IRoutingStrategy {
    return this.strategyMap.get(this.activeMode)!;
  }

  public getMode(): ExecutionRoutingMode {
    return this.activeMode;
  }

  public isDirectMeshActive(): boolean {
    return this.getActiveStrategy().isMeshDirect;
  }

  public setMode(mode: ExecutionRoutingMode): void {
    const isValid = this.strategyMap.has(mode);
    const transitionHandlers = new Map<boolean, () => void>([
      [true, () => {
        this.activeMode = mode;
        this.listeners.forEach((cb) => cb(this.activeMode));
      }],
      [false, () => {}],
    ]);
    (transitionHandlers.get(isValid) ?? (() => {}))();
  }

  public toggle(): ExecutionRoutingMode {
    // Mode toggle mapped without if-else via complementary map lookup
    const toggleMap = new Map<ExecutionRoutingMode, ExecutionRoutingMode>([
      [ExecutionRoutingMode.SERVICE_GATEWAY, ExecutionRoutingMode.DIRECT_CONTAINER_MESH],
      [ExecutionRoutingMode.DIRECT_CONTAINER_MESH, ExecutionRoutingMode.SERVICE_GATEWAY],
    ]);
    const nextMode = toggleMap.get(this.activeMode) ?? ExecutionRoutingMode.SERVICE_GATEWAY;
    this.setMode(nextMode);
    return nextMode;
  }

  public subscribe(listener: (mode: ExecutionRoutingMode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public resolveEndpoint(target: ContainerServiceTarget, path: string): string {
    return this.getActiveStrategy().resolveEndpoint(target, path);
  }

  public resolveHeaders(target: ContainerServiceTarget, customHeaders?: Record<string, string>): Record<string, string> {
    return this.getActiveStrategy().resolveHeaders(target, customHeaders);
  }
}

// Global default singleton coordinating routing across the UI application
export const routingRegistry = new RoutingStrategyRegistry();
