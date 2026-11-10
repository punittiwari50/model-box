import { HttpTransport } from "@/strategies/api/HttpTransport.js";
import { DefaultEndpoint } from "@/domain/constants/index.js";
import type { ModelDescriptor } from "@/domain/models/model.types.js";
import { ModelCatalog, ModelFamily } from "@model-box/model-connector-core";

/**
 * Model Catalog Discovery Adapter.
 * Functionality: Discovers available model capabilities across all registered
 * cloud providers and local inference endpoints.
 */
export class ModelCatalogDiscoveryAdapter {
  private readonly baseUrl: string;

  constructor(baseUrl: string = DefaultEndpoint.GEMINI_CONNECTOR_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  public async discoverAllModels(correlationId?: string): Promise<readonly ModelDescriptor[]> {
    try {
      const res = await HttpTransport.request<any>(`${this.baseUrl}/api/v1/models`, {
        correlationId,
      });
      const rawList = Array.isArray(res.data) ? res.data : res.data?.models || [];
      return rawList.map((m: any) => ({
        id: m.id || m.name,
        name: m.name || m.id,
        family: m.family || ModelFamily.GEMINI,
        tier: m.tier || "freeware",
        supportedStrategies: m.supportedStrategies || ["api", "cli", "cookie"],
        status: m.status || "ACTIVE",
        description: m.description || "",
      }));
    } catch {
      return this.getStaticFallbackCatalog();
    }
  }

  public async getModelsByFamily(
    family: string,
    correlationId?: string
  ): Promise<readonly ModelDescriptor[]> {
    const all = await this.discoverAllModels(correlationId);
    return all.filter((m) => m.family.toLowerCase() === family.toLowerCase());
  }

  public getStaticFallbackCatalog(): readonly ModelDescriptor[] {
    return Object.freeze([
      {
        id: ModelCatalog.GEMINI_3_8_FLASH,
        name: "Google Gemini 3.8 Flash",
        family: ModelFamily.GEMINI,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Google DeepMind High-Speed Multimodal Intelligence",
      },
      {
        id: "gemini-3.5-flash",
        name: "Google Gemini 3.5 Flash",
        family: ModelFamily.GEMINI,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Google DeepMind Frontier Multimodal Reasoning",
      },
      {
        id: "grok-3",
        name: "xAI Grok-3",
        family: ModelFamily.GROK,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "xAI Frontier Reasoning & Code Intelligence",
      },
      {
        id: "copilot-gpt-4o",
        name: "GitHub Copilot (GPT-4o)",
        family: ModelFamily.COPILOT,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Microsoft GitHub Copilot Developer Assistant",
      },
      {
        id: "gpt-4o",
        name: "OpenAI ChatGPT-4o",
        family: ModelFamily.CHATGPT,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "OpenAI Flagship Multimodal Model",
      },
      {
        id: "claude-3-7-sonnet",
        name: "Anthropic Claude 3.7 Sonnet",
        family: ModelFamily.CLAUDE,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Anthropic Hybrid Reasoning & Coding Flagship",
      },
      {
        id: "claude-3-5-sonnet",
        name: "Anthropic Claude 3.5 Sonnet",
        family: ModelFamily.CLAUDE,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Anthropic Frontier Reasoning Intelligence",
      },
      {
        id: "llama3.2",
        name: "Ollama LLaMA 3.2",
        family: ModelFamily.OLLAMA,
        tier: "freeware",
        supportedStrategies: ["cli", "api"],
        status: "ACTIVE",
        description: "Private Local On-Device LLM Runner",
      },
      {
        id: "tinyllama",
        name: "TinyLlama 1.1B",
        family: ModelFamily.OLLAMA,
        tier: "freeware",
        supportedStrategies: ["cli", "api"],
        status: "ACTIVE",
        description: "Local Offline Fallback Runner",
      },
    ]);
  }
}
