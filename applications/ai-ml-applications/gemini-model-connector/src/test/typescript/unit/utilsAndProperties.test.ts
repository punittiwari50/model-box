import { describe, it } from "node:test";
import assert from "node:assert";
import {
  sysOs,
  sysFs,
  sysProcess,
  sysCrypto,
} from "@/core/utils/system/systemFacade.js";
import { pathResolver } from "@/core/utils/io/pathUtils.js";
import { hostBrowserLauncher } from "@/core/utils/browser/browserLauncher.js";
import {
  databaseProperties,
  transactionProperties,
  restClientProperties,
  queueProperties,
  securityProperties,
  modelProperties,
  resilienceProperties,
} from "@/core/config/index.js";

describe("Modular System Utilities (src/main/utils/)", () => {
  it("should verify OS utility methods", () => {
    assert.ok(sysOs.platform());
    assert.ok(sysOs.homedir());
    assert.ok(sysOs.tmpdir());
    assert.ok(sysOs.totalmem() > 0);
    assert.ok(sysOs.freemem() > 0);
  });

  it("should verify FS utility methods", () => {
    assert.strictEqual(typeof sysFs.existsSync, "function");
    assert.strictEqual(typeof sysFs.readFileSync, "function");
    assert.strictEqual(typeof sysFs.writeFileSync, "function");
    assert.strictEqual(typeof sysFs.mkdirSync, "function");
  });

  it("should verify Process utility methods", () => {
    assert.strictEqual(typeof sysProcess.cwd, "function");
    assert.strictEqual(typeof sysProcess.getEnv, "function");
    assert.ok(sysProcess.cwd());
  });

  it("should verify Crypto utility methods", () => {
    const uuid = sysCrypto.randomUUID();
    assert.ok(uuid.length > 0);
    const hex = sysCrypto.randomHex(16);
    assert.strictEqual(hex.length, 32);
    const hash = sysCrypto.sha256Hex("test");
    assert.strictEqual(hash.length, 64);
  });

  it("should verify Path and Browser launcher utilities", () => {
    assert.ok(pathResolver.getDataDir());
    assert.ok(pathResolver.getArtifactsDir());
    assert.ok(pathResolver.getAgentsDir());
    assert.ok(pathResolver.resolveAgentsPath("my-project"));
    assert.ok(hostBrowserLauncher);
  });
});

describe("Modular Configuration Properties (src/main/config/properties/)", () => {
  it("should verify DatabaseProperties instance", () => {
    assert.ok(databaseProperties.poolMin >= 1);
    assert.ok(databaseProperties.poolMax >= databaseProperties.poolMin);
    assert.ok(databaseProperties.poolAcquireTimeoutMs > 0);
    assert.ok(databaseProperties.databaseName);
  });

  it("should verify TransactionProperties instance", () => {
    assert.ok(transactionProperties.defaultTimeoutMs > 0);
    assert.ok(transactionProperties.maxRetryAttempts >= 0);
    assert.ok(transactionProperties.retryBackoffMs >= 0);
  });

  it("should verify RestClientProperties instance", () => {
    assert.ok(restClientProperties.connectTimeoutMs > 0);
    assert.ok(restClientProperties.readTimeoutMs > 0);
    assert.ok(restClientProperties.maxRetries >= 0);
  });

  it("should verify QueueProperties instance", () => {
    assert.ok(queueProperties.maxCapacity > 0);
    assert.ok(queueProperties.ttlMs > 0);
    assert.ok(queueProperties.partitionKeyPattern);
  });

  it("should verify SecurityProperties instance", () => {
    assert.strictEqual(typeof securityProperties.tokenAuthEnabled, "boolean");
    assert.strictEqual(typeof securityProperties.rateLimitEnabled, "boolean");
  });

  it("should verify ModelProperties instance", () => {
    assert.ok(modelProperties.defaultModel);
    assert.ok(modelProperties.cliCommand);
    assert.ok(modelProperties.cliTimeoutMs > 0);
    assert.strictEqual(modelProperties.fallbackModel, "tinyllama");
    assert.strictEqual(modelProperties.fallbackThresholdPercentage, 90);
    assert.ok(modelProperties.getApiBaseUrl("ollama"));
    assert.ok(modelProperties.getCliCommand("ollama"));
    assert.ok(modelProperties.getMaxTokens("gemini") > 0);
  });

  it("should verify ResilienceProperties instance", () => {
    assert.ok(resilienceProperties.failureRateThreshold > 0);
    assert.ok(resilienceProperties.waitDurationInOpenStateMs > 0);
    assert.ok(resilienceProperties.ringBufferSize > 0);
  });
});
