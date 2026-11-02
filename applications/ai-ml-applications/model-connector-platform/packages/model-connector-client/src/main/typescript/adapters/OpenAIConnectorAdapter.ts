import {
  UnifiedModelExecutionAdapter,
  type ModelConnectorHealth,
} from "@/adapters/UnifiedModelExecutionAdapter.js";
import { ModelFamily, ModelCatalogDefaults } from "@/domain/constants/index.js";

export type OpenAIConnectorHealth = ModelConnectorHealth;

/**
 * Dedicated enterprise connector adapter for OpenAI ChatGPT models (GPT-4o, GPT-4o Mini).
 */
export class OpenAIConnectorAdapter extends UnifiedModelExecutionAdapter {
  public readonly family = ModelFamily.OPENAI;
  public readonly defaultModel = ModelCatalogDefaults.DEFAULT_OPENAI_MODEL;
}
