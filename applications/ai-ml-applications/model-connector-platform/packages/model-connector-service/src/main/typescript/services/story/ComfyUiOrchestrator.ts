import { randomUUID } from "@model-box/model-connector-core";

export interface ComfyUiWorkflowDag {
  readonly projectId: string;
  readonly promptId: string;
  readonly nodeCount: number;
  readonly steps: ReadonlyArray<{
    readonly nodeId: string;
    readonly nodeType: string;
    readonly title: string;
  }>;
  readonly executionStatus: "QUEUED" | "PROCESSING" | "COMPLETED";
}

/**
 * Enterprise ComfyUI Storyteller Diffusion DAG Orchestrator.
 * Conforms to:
 * - Roadmap STEP-14, LLD §4.4 & UC-03: Storyteller Video Generation Pipeline
 * - STD-COD-007: Immutability by Default
 */
export class ComfyUiOrchestrator {
  public static generateWorkflowDag(
    narrativePrompt: string,
    keyframeCount = 4,
  ): ComfyUiWorkflowDag {
    const steps = [
      { nodeId: "1", nodeType: "CLIPTextEncode", title: `Prompt: ${narrativePrompt.slice(0, 30)}` },
      { nodeId: "2", nodeType: "KSampler", title: "Diffusion Sampler (Euler Ancestral)" },
      { nodeId: "3", nodeType: "VAEDecode", title: "Latent to Pixel Space Decoder" },
      { nodeId: "4", nodeType: "SaveImage", title: `Render Output (${keyframeCount} Keyframes)` },
    ];

    return Object.freeze({
      projectId: `STORY-${randomUUID()}`,
      promptId: `PROMPT-${randomUUID()}`,
      nodeCount: steps.length,
      steps: Object.freeze(steps),
      executionStatus: "QUEUED",
    });
  }
}
