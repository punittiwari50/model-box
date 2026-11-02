export interface ApiRequestSpec {
  readonly endpoint: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface CliCommandSpec {
  readonly binary: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * Strategy interface for model-specific property and protocol resolution.
 * Conforms to:
 * - STD-COD-005: OOP Patterns, Polymorphic Dispatch & Strategy Pattern
 * - SOLID Principles: Single Responsibility, Open/Closed, Dependency Inversion
 */
export interface IModelPropertyResolver {
  readonly family: string;
  supports(model: string): boolean;
  resolveApiKey(model: string): string | undefined;
  resolveBaseUrl(): string;
  buildApiRequest(model: string, apiKey: string, prompt: string): ApiRequestSpec;
  resolveCliCommand(model: string, sessionId?: string, credentialValue?: string): CliCommandSpec;
}
