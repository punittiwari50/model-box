import {
  UnifiedModelExecutionAdapter,
  type ModelConnectorHealth,
} from "@/adapters/UnifiedModelExecutionAdapter.js";
import { ModelFamily, ModelCatalogDefaults } from "@/domain/constants/index.js";

export type CopilotConnectorHealth = ModelConnectorHealth;

/**
 * Dedicated enterprise connector adapter for Microsoft/GitHub Copilot models.
 */
export class CopilotConnectorAdapter extends UnifiedModelExecutionAdapter {
  public readonly family = ModelFamily.COPILOT;
  public readonly defaultModel = ModelCatalogDefaults.DEFAULT_COPILOT_MODEL;
}
