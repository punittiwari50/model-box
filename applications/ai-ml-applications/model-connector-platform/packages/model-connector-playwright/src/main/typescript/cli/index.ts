#!/usr/bin/env node
/**
 * CLI Runner for @model-box/model-connector-playwright
 * Conforms to STD-COD-010 (Runtime Isolation) and STD-COD-011 (Process Encapsulation)
 */
import { processUtils } from "@model-box/model-connector-core";
import { SanityFactory } from "@/factory/SanityFactory.js";

export async function runCli(): Promise<void> {
  const suite = SanityFactory.createDefaultSuite();

  try {
    await suite.run();
    console.log("[PASS] All UI Menus and Tabs Verified Successfully.");
    processUtils.exit(0);
  } catch (err: any) {
    console.error("[FAIL] Sanity Verification Failed:", err.message ?? err);
    processUtils.exit(1);
  }
}

runCli();
