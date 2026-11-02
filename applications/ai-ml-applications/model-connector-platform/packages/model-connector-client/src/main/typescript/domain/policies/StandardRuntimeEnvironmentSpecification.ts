import type { ISimulationPolicy } from "@/domain/policies/ISimulationPolicy.js";
import type { IEnvironmentSpecification } from "@/domain/policies/IEnvironmentSpecification.js";

/**
 * Standard runtime simulation policy for development, test, acceptance, and production.
 * Invariant: Simulation mock implementation is strictly prohibited (returns false).
 */
export class StandardRuntimeSimulationPolicy implements ISimulationPolicy {
  public isSimulationAllowed(): boolean {
    return false;
  }
}

/**
 * Default specification matching standard runtime environments.
 */
export class StandardRuntimeEnvironmentSpecification implements IEnvironmentSpecification {
  public isSatisfied(): boolean {
    return true;
  }

  public createPolicy(): ISimulationPolicy {
    return new StandardRuntimeSimulationPolicy();
  }
}
