import type { ISimulationPolicy } from "@/domain/policies/ISimulationPolicy.js";

/**
 * Specification pattern for classifying runtime execution environment.
 * Conforms to STD-COD-005 (OOP Patterns & Polymorphic Dispatch).
 */
export interface IEnvironmentSpecification {
  isSatisfied(): boolean;
  createPolicy(): ISimulationPolicy;
}
