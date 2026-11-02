import { environment } from "@model-box/model-connector-core";
import type { ISimulationPolicy } from "@/domain/policies/ISimulationPolicy.js";
import type { IEnvironmentSpecification } from "@/domain/policies/IEnvironmentSpecification.js";

/**
 * Simulation policy for Test Cases and Builder environments.
 * Active strictly during unit testcase runs or builder container jobs.
 */
export class BuilderTestSimulationPolicy implements ISimulationPolicy {
  public isSimulationAllowed(): boolean {
    return true;
  }
}

/**
 * Specification identifying automated unit test runners and builder containers.
 * Invariant: Prohibited across development, test, acceptance, and production environments.
 */
export class BuilderTestEnvironmentSpecification implements IEnvironmentSpecification {
  public isSatisfied(): boolean {
    const isExplicitlyDisabled =
      environment.getProperty("allow.mock.fallback", "") === "false" ||
      environment.getProperty("enable.simulation.fallback", "") === "false" ||
      environment.getProperty("container.role", "") === "runner";
    if (isExplicitlyDisabled) {
      return false;
    }

    const nodeEnv = environment.getProperty("node.env", "development").toLowerCase();
    const runtimeEnv = environment.getProperty(
      "runtime.env",
      environment.getProperty("app.env", environment.getProperty("environment", "")),
    ).toLowerCase();

    // STRICT INVARIANT: Prohibited in development, test, acceptance, or production deployment environments
    if (
      runtimeEnv === "development" ||
      runtimeEnv === "dev" ||
      runtimeEnv === "acceptance" ||
      runtimeEnv === "acc" ||
      runtimeEnv === "uat" ||
      runtimeEnv === "production" ||
      runtimeEnv === "prod" ||
      runtimeEnv === "test"
    ) {
      return false;
    }

    // Permitted strictly during unit test execution or explicit builder container role
    const isUnitTestRunner = nodeEnv === "test" && (!runtimeEnv || runtimeEnv === "");
    const isBuilderContainer =
      environment.getProperty("container.role", "") === "builder" ||
      environment.getPropertyAsBoolean("is.builder", false);

    return isUnitTestRunner || isBuilderContainer;
  }

  public createPolicy(): ISimulationPolicy {
    return new BuilderTestSimulationPolicy();
  }
}
