/**
 * Model metadata and catalog types.
 * Conforms to STD-COD-007.5: Immutability by Default.
 */

export interface ModelDescriptor {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly tier: "paid" | "freeware";
  readonly supportedStrategies: readonly string[];
  readonly maxContextTokens?: number;
  readonly defaultHyperparameters?: {
    readonly temperature: number;
    readonly topP: number;
    readonly maxOutputTokens: number;
  };
  readonly description?: string;
  readonly status: "ACTIVE" | "DEPRECATED" | "SHUTDOWN";
}

export interface ModelDiscoveryFilter {
  readonly family?: string;
  readonly tier?: "paid" | "freeware";
  readonly strategy?: string;
}
