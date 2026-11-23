import {
  UnifiedModelExecutionAdapter,
  type ModelConnectorHealth,
} from "@/adapters/UnifiedModelExecutionAdapter.js";

export type GeminiConnectorHealth = ModelConnectorHealth;

/**
 * Backwards compatibility adapter mapping to UnifiedModelExecutionAdapter.
 * @deprecated Prefer using UnifiedModelExecutionAdapter for full multi-model support.
 */
export class GeminiConnectorAdapter extends UnifiedModelExecutionAdapter { }
