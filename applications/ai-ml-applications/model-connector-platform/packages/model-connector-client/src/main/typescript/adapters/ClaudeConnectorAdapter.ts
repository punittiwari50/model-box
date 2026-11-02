import {
  UnifiedModelExecutionAdapter,
  type ModelConnectorHealth,
} from "@/adapters/UnifiedModelExecutionAdapter.js";
import { ModelFamily, ModelCatalogDefaults } from "@/domain/constants/index.js";

export type ClaudeConnectorHealth = ModelConnectorHealth;

/**
 * Dedicated enterprise connector adapter for Anthropic Claude family models (Claude 3.7 Sonnet, 3.5 Haiku).
 */
export class ClaudeConnectorAdapter extends UnifiedModelExecutionAdapter {
  public readonly family = ModelFamily.CLAUDE;
  public readonly defaultModel = ModelCatalogDefaults.DEFAULT_CLAUDE_MODEL;
}
