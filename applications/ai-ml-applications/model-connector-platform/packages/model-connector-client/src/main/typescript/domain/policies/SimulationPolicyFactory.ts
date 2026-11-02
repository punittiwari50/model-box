import type { ISimulationPolicy } from "@/domain/policies/ISimulationPolicy.js";
import type { IEnvironmentSpecification } from "@/domain/policies/IEnvironmentSpecification.js";
import { BuilderTestEnvironmentSpecification } from "@/domain/policies/BuilderTestEnvironmentSpecification.js";
import {
  StandardRuntimeEnvironmentSpecification,
  StandardRuntimeSimulationPolicy,
} from "@/domain/policies/StandardRuntimeEnvironmentSpecification.js";

/**
 * Factory for creating ISimulationPolicy via Polymorphic Specification Matching.
 * Eliminates procedural if-else chains across connector strategies (STD-COD-005).
 */
export class SimulationPolicyFactory {
  private static readonly specifications: readonly IEnvironmentSpecification[] = [
    new BuilderTestEnvironmentSpecification(),
    new StandardRuntimeEnvironmentSpecification(),
  ];

  public static createPolicy(): ISimulationPolicy {
    const matched = this.specifications.find((spec) => spec.isSatisfied());
    if (matched) {
      return matched.createPolicy();
    }
    return new StandardRuntimeSimulationPolicy();
  }
}
