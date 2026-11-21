#!/usr/bin/env node
/**
 * CLI Entrypoint for Playwright Use-Case Testing
 * Conforms to STD-COD-010 (Runtime Isolation) and STD-COD-011 (Process & Path Encapsulation)
 */
import { processUtils, pathUtils } from "@model-box/model-connector-core";
import { SanityFactory } from "@/factory/SanityFactory.js";
import { UsecaseRunner } from "@/usecases/UsecaseRunner.js";
import { UC01_ChatOmniChannelExecution } from "@/usecases/impl/UC01_ChatOmniChannelExecution.js";
import { UC02_ModelDiscoveryAndFilter } from "@/usecases/impl/UC02_ModelDiscoveryAndFilter.js";
import { UC03_MultiProtocolAuthConfig } from "@/usecases/impl/UC03_MultiProtocolAuthConfig.js";
import { UC04_DistributedSessionLineage } from "@/usecases/impl/UC04_DistributedSessionLineage.js";
import { UC05_ResilientDAGWorkflowIntegrity } from "@/usecases/impl/UC05_ResilientDAGWorkflowIntegrity.js";
import { UC06_DomainApplicationOnboarding } from "@/usecases/impl/UC06_DomainApplicationOnboarding.js";
import { UC07_TenantRbacGovernanceMatrix } from "@/usecases/impl/UC07_TenantRbacGovernanceMatrix.js";
import { UC08_TelemetryAndAuditTrail } from "@/usecases/impl/UC08_TelemetryAndAuditTrail.js";
import { UC09_ResponsiveMultiDeviceContinuity } from "@/usecases/impl/UC09_ResponsiveMultiDeviceContinuity.js";
import { UC10_RealOllamaDockerExecution } from "@/usecases/impl/UC10_RealOllamaDockerExecution.js";
import { UC11_UxViewsAndThemeSuite } from "@/usecases/impl/UC11_UxViewsAndThemeSuite.js";
import { UC12_ResponsiveMenuButtonFunctionalSuite } from "@/usecases/impl/UC12_ResponsiveMenuButtonFunctionalSuite.js";
import { UC13_ChatResponsivenessAndSettingsSuite } from "@/usecases/impl/UC13_ChatResponsivenessAndSettingsSuite.js";

export function createDefaultUsecases() {
  return Object.freeze([
    new UC01_ChatOmniChannelExecution(),
    new UC02_ModelDiscoveryAndFilter(),
    new UC03_MultiProtocolAuthConfig(),
    new UC04_DistributedSessionLineage(),
    new UC05_ResilientDAGWorkflowIntegrity(),
    new UC06_DomainApplicationOnboarding(),
    new UC07_TenantRbacGovernanceMatrix(),
    new UC08_TelemetryAndAuditTrail(),
    new UC09_ResponsiveMultiDeviceContinuity(),
    new UC10_RealOllamaDockerExecution(),
    new UC11_UxViewsAndThemeSuite(),
    new UC12_ResponsiveMenuButtonFunctionalSuite(),
    new UC13_ChatResponsivenessAndSettingsSuite(),
  ]);
}

export async function runUsecasesCli(): Promise<void> {
  const config = SanityFactory.resolveConfig();
  const defaultDir = pathUtils.resolve(processUtils.cwd(), "reports");
  const outputDir = processUtils.getEnv("REPORT_OUTPUT_DIR", defaultDir);

  const filterArg = process.argv.slice(2).find((arg) => arg.startsWith("--usecase="))?.split("=")[1]
    || processUtils.getEnv("USECASE_FILTER", "");
  const allCases = createDefaultUsecases();
  const casesToRun = filterArg
    ? allCases.filter((u) => u.usecaseId.toLowerCase() === filterArg.toLowerCase())
    : allCases;

  const runner = new UsecaseRunner(casesToRun, config, outputDir);
  try {
    const summary = await runner.run();
    if (summary.failedUsecases > 0) {
      console.error(`[FAIL] ${summary.failedUsecases} Use Cases Failed.`);
      processUtils.exit(1);
    }
    console.log("[PASS] All Platform Use Cases Executed Successfully.");
    processUtils.exit(0);
  } catch (err: any) {
    console.error("[FATAL] Use Case Runner Exception:", err.message ?? err);
    processUtils.exit(1);
  }
}

runUsecasesCli();

