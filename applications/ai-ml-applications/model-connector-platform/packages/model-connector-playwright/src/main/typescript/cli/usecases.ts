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
  ]);
}

export async function runUsecasesCli(): Promise<void> {
  const config = SanityFactory.resolveConfig();
  const defaultDir = pathUtils.resolve(processUtils.cwd(), "reports");
  const outputDir = processUtils.getEnv("REPORT_OUTPUT_DIR", defaultDir);

  const runner = new UsecaseRunner(createDefaultUsecases(), config, outputDir);
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

