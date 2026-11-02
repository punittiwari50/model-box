import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { DatabaseCleanUpGuard } from "@/runner/DatabaseCleanUpGuard.js";

/**
 * UC-10: Local Ollama Docker Container Execution & Verification
 * Directly verifies live communication with the running Ollama Docker container.
 * Invariant: Never executes mocks in Playwright E2E; validates real container responses.
 */
export class UC10_RealOllamaDockerExecution extends AbstractUsecaseTest {
  private static readonly OLLAMA_CANDIDATES = Object.freeze([
    "http://host.docker.internal:11435",
    "http://127.0.0.1:11435",
    "http://localhost:11435",
    "http://ollama:11434",
  ]);

  public constructor() {
    super(
      "UC-10",
      "Local Ollama Docker Container Execution & Verification",
      "Local AI & Fallback Runtime",
      "Directly validates real-time communication, model inventory, and non-mock AI generation from local Ollama Docker container",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    let resolvedBaseUrl = "";
    let availableModels: string[] = [];
    let selectedModel = "";

    await recordStep("Discover Live Ollama Docker Endpoint", async () => {
      for (const candidate of UC10_RealOllamaDockerExecution.OLLAMA_CANDIDATES) {
        try {
          const res = await fetch(`${candidate}/api/tags`);
          if (res.ok) {
            const data = await res.json();
            availableModels = (data.models || []).map((m: any) => m.name || m.model);
            if (availableModels.length > 0) {
              resolvedBaseUrl = candidate;
              break;
            }
          }
        } catch {
          // Probe next candidate
        }
      }
      if (!resolvedBaseUrl) {
        throw new Error("Unable to connect to live local Ollama Docker container on candidate ports.");
      }
      return `Connected to live Ollama container at ${resolvedBaseUrl} with ${availableModels.length} models.`;
    });

    await recordStep("Select Operational Model from Inventory", async () => {
      const preferred = ["tinyllama:latest", "lfm3-omni:latest", "qwen3:8b", "llama3.2:latest"];
      const matched = preferred.find((p) => availableModels.includes(p));
      selectedModel = matched || availableModels[0];
      return `Selected model '${selectedModel}' for real inference execution.`;
    });

    await recordStep("Execute Live Non-Mock Completion on Ollama", async () => {
      const prompt = "State whether you are operational. Reply concisely.";
      const res = await fetch(`${resolvedBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          prompt,
          stream: false,
        }),
      });
      if (!res.ok) {
        throw new Error(`Ollama generation failed with status ${res.status}`);
      }
      const data = await res.json();
      const answer = (data.response || "").trim();

      if (!answer || answer.length === 0) {
        throw new Error("Ollama returned empty response string");
      }
      if (answer === prompt) {
        throw new Error("Ollama illegally echoed the input request as response");
      }
      if (answer.includes("[CLI Simulation Mode") || answer.includes("[Fallback Response from")) {
        throw new Error("Ollama returned an illegal mock response instead of real neural inference");
      }
      return `Real AI response verified (${answer.length} chars, ${data.eval_count || 0} tokens generated).`;
    });

    await recordStep("Ensure Clean Database State", async () => {
      const targetUrl = new URL(page.url()).origin;
      const count = await DatabaseCleanUpGuard.cleanupTestSessions(targetUrl);
      return `Database teardown complete. Zero dummy test records left in table (purged: ${count}).`;
    });
  }
}

