import { describe, it } from "node:test";
import assert from "node:assert";
import { StandardEnvironment } from "@/core/config/environment.js";

describe("StandardEnvironment (4-Tier Precedence & Relaxed Aliasing)", () => {
  it("should load base application.yml properties (Tier A)", () => {
    const env = new StandardEnvironment({}, "linux", []);
    const port = env.getPropertyAsNumber("server.port");
    assert.strictEqual(port, 8090);
  });

  it("should override Tier A with environment variables (Tier B)", () => {
    const env = new StandardEnvironment({ "server.port": "9099" }, "linux", []);
    const port = env.getPropertyAsNumber("server.port");
    assert.strictEqual(port, 9099);
  });

  it("should override Tier B with explicit CLI startup arguments (Tier C)", () => {
    const env = new StandardEnvironment({ "server.port": "9099" }, "linux", [
      "node",
      "dist/index.js",
      "--server.port=7070",
    ]);
    const port = env.getPropertyAsNumber("server.port");
    assert.strictEqual(port, 7070);
  });

  it("should resolve model.gemini.cli from GEMINI_CLI_COMMAND alias bidirectionally", () => {
    const env = new StandardEnvironment(
      { GEMINI_CLI_COMMAND: "custom-gemini-bin" },
      "linux",
      [],
    );
    const fromModelProp = env.getProperty("model.gemini.cli");
    const fromCliCommand = env.getProperty("GEMINI_CLI_COMMAND");
    assert.strictEqual(fromModelProp, "custom-gemini-bin");
    assert.strictEqual(fromCliCommand, "custom-gemini-bin");
  });

  it("should resolve uppercase underscore relaxed bindings", () => {
    const env = new StandardEnvironment({ SERVER_PORT: "8888" }, "linux", []);
    assert.strictEqual(env.getProperty("server.port"), "8888");
  });

  it("should resolve GEMINI_DEFAULT_MODEL as gemini-3.8-flash by default", () => {
    const env = new StandardEnvironment({}, "linux", []);
    const defaultModel = env.getProperty("GEMINI_DEFAULT_MODEL");
    assert.strictEqual(defaultModel, "gemini-3.8-flash");
  });

  it("should resolve models.gemini.apiKey and model.apiKey from application.yml", () => {
    const env = new StandardEnvironment({}, "linux", []);
    const yamlApiKey = env.getProperty("models.gemini.apiKey");
    assert.ok(yamlApiKey && yamlApiKey.length > 0);
    const modelApiKey = env.getProperty("model.apiKey");
    assert.ok(modelApiKey && modelApiKey.length > 0);
  });
});
