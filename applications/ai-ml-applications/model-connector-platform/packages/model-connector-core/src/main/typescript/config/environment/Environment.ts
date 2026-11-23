/**
 * Standard Application Environment Interface (Spring-inspired).
 *
 * Provides a single centralized abstraction over runtime environment variables,
 * profile management, and property conversion. Eliminates direct 'process.env' reads
 * scattered across business domain logic and infrastructure services.
 *
 * Conforms to:
 * - STD-COD-002: Enterprise Centralized Configuration & Governance
 * - STD-COD-004: Acyclic Dependencies & Leaf Modules
 * - STD-COD-007: Clean Code & Fail-Fast Error Resiliency
 * - STD-COD-007.5: Immutability by Default
 */
export interface Environment {
  getActiveProfiles(): readonly string[];
  getDefaultProfiles(): readonly string[];
  acceptsProfiles(...profiles: string[]): boolean;
  containsProperty(key: string): boolean;
  getProperty(key: string): string | undefined;
  getProperty(key: string, defaultValue: string): string;
  getPropertyAsNumber(key: string, defaultValue?: number): number;
  getPropertyAsBoolean(key: string, defaultValue?: boolean): boolean;
  getRequiredProperty(key: string): string;
  getAllProperties(): Readonly<Record<string, string | undefined>>;
  getPlatform(): string;
  isWindows(): boolean;
}
