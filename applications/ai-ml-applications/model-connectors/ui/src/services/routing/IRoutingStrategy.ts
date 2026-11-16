import { ContainerServiceTarget, ExecutionRoutingMode, RoutingEndpointConfig } from './types';

/**
 * Strategy interface adhering to Open/Closed and Single Responsibility principles.
 * Defines polymorphic execution resolution without any if/else or switch statements.
 */
export interface IRoutingStrategy {
  readonly mode: ExecutionRoutingMode;
  readonly isMeshDirect: boolean;
  resolveEndpoint(target: ContainerServiceTarget, path: string): string;
  resolveHeaders(target: ContainerServiceTarget, customHeaders?: Record<string, string>): Record<string, string>;
  getConfig(target: ContainerServiceTarget): RoutingEndpointConfig;
}
