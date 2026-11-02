import {
  UnifiedModelExecutionAdapter,
  type ModelConnectorHealth,
} from "@/adapters/UnifiedModelExecutionAdapter.js";
import { ModelFamily, ModelCatalogDefaults } from "@/domain/constants/index.js";

export type GrokConnectorHealth = ModelConnectorHealth;

/**
 * Dedicated enterprise connector adapter for xAI Grok family models (Grok-3, Grok-2).
 */
export class GrokConnectorAdapter extends UnifiedModelExecutionAdapter {
  public readonly family = ModelFamily.GROK;
  public readonly defaultModel = ModelCatalogDefaults.DEFAULT_GROK_MODEL;
}
