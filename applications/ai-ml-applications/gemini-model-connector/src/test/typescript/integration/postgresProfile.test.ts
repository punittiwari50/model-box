import { describe, it } from "node:test";
import assert from "node:assert";
import { StandardEnvironment } from "@/core/config/environment.js";

describe("Postgres Profile & Testcontainer Configuration (Requirement #17)", () => {
  it("should load postgres-test profile configuration from application-postgres-test.yml", () => {
    const env = new StandardEnvironment(
      { APP_PROFILE: "postgres-test" },
      "linux",
      [],
    );

    assert.strictEqual(env.getActiveProfiles()[0], "postgres-test");
    assert.strictEqual(env.getProperty("storage.type"), "postgres");
    assert.strictEqual(env.getProperty("storage.host"), "localhost");
    assert.strictEqual(env.getPropertyAsNumber("storage.port"), 5432);
    assert.strictEqual(
      env.getProperty("storage.database"),
      "model_connector_test",
    );
    assert.strictEqual(env.getProperty("storage.username"), "test_user");
    assert.strictEqual(
      env.getPropertyAsNumber("storage.pool.maxConnections"),
      10,
    );
    assert.strictEqual(
      env.getProperty("auth.defaultAccount.email"),
      "postgres-test-user@internal.modelbox",
    );
  });

  it("should allow loading custom postgres settings via environment variables and profile", () => {
    const env = new StandardEnvironment(
      { APP_PROFILE: "postgres-test" },
      "linux",
      [],
    );

    assert.strictEqual(env.getProperty("storage.host"), "localhost");
    assert.strictEqual(env.getPropertyAsNumber("storage.port"), 5432);
    assert.strictEqual(
      env.getProperty("storage.database"),
      "model_connector_test",
    );
  });
});
