import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StandardEnvironment } from "@/config/environment.js";

describe("Spring-Style StandardEnvironment Tests", () => {
  it("resolves active profiles correctly", () => {
    const env = new StandardEnvironment({
      SPRING_PROFILES_ACTIVE: "production,cloud",
    });
    assert.deepStrictEqual(env.getActiveProfiles(), ["production", "cloud"]);
    assert.strictEqual(env.acceptsProfiles("production"), true);
    assert.strictEqual(env.acceptsProfiles("staging"), false);
  });

  it("resolves relaxed binding for dot and underscore keys", () => {
    const env = new StandardEnvironment({
      SERVER_PORT: "8088",
      "app.name": "ModelBoxCore",
    });
    assert.strictEqual(env.getProperty("server.port"), "8088");
    assert.strictEqual(env.getPropertyAsNumber("server.port"), 8088);
    assert.strictEqual(env.getProperty("app.name"), "ModelBoxCore");
  });

  it("loads application.yml default values including task lifecycle timeouts", () => {
    const env = new StandardEnvironment({});
    assert.strictEqual(env.getPropertyAsNumber("tasks.lifecycle.heartbeatTimeoutSeconds", 30), 30);
    assert.strictEqual(env.getPropertyAsNumber("tasks.lifecycle.maxStalledTimeoutSeconds", 90), 90);
  });

  it("casts boolean properties accurately", () => {
    const env = new StandardEnvironment({
      "feature.enabled": "true",
      "feature.disabled": "0",
    });
    assert.strictEqual(env.getPropertyAsBoolean("feature.enabled"), true);
    assert.strictEqual(env.getPropertyAsBoolean("feature.disabled"), false);
    assert.strictEqual(env.getPropertyAsBoolean("non.existent", true), true);
  });

  it("throws fail-fast exception on missing required property", () => {
    const env = new StandardEnvironment({});
    assert.throws(
      () => env.getRequiredProperty("mandatory.secret"),
      /Mandatory property 'mandatory.secret' is missing/
    );
  });
});
