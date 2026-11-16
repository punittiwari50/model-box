import { processUtils } from "@/utils/process/processUtils.js";
import type { Environment } from "@/config/environment/Environment.js";
import {
  CompositePropertySource,
  MapPropertySource,
  PropertySource,
} from "@/config/environment/PropertySource.js";
import { YamlPropertySourceLoader } from "@/config/environment/YamlPropertySourceLoader.js";

class SystemEnvironmentPropertySource extends PropertySource<Readonly<Record<string, string | undefined>>> {
  constructor() {
    super("systemEnvironment", processUtils.env);
  }

  public getProperty(name: string): string | undefined {
    return processUtils.getEnv(name);
  }

  public containsProperty(name: string): boolean {
    return processUtils.hasEnv(name);
  }

  public getPropertyNames(): readonly string[] {
    return Object.freeze(Object.keys(processUtils.env));
  }
}

/**
 * Spring-Style StandardEnvironment.
 *
 * Implements property source hierarchy:
 * 1. Custom constructor properties (Highest priority)
 * 2. Operating System & Container environment variables (process.env)
 * 3. Profile-specific application-{profile}.yml properties
 * 4. Default application.yml properties (Lowest priority)
 *
 * Conforms to:
 * - STD-COD-002: Centralized Configuration & Property Binding
 * - STD-COD-004: Acyclic Leaf Dependencies
 * - STD-COD-007: Resilient Error Handling & Fail-Fast Validation
 * - STD-COD-007.5: Immutability by Default
 */
export class StandardEnvironment implements Environment {
  private readonly compositePropertySource = new CompositePropertySource();
  private readonly customProperties?: Readonly<Record<string, string | undefined>>;
  private readonly activeProfiles: readonly string[];
  private readonly defaultProfiles: readonly string[] = Object.freeze(["development"]);

  constructor(customProperties?: Record<string, string | undefined>) {
    this.customProperties = customProperties ? Object.freeze({ ...customProperties }) : undefined;

    // 1. Resolve active profiles
    const rawProfiles =
      (this.customProperties && this.customProperties["SPRING_PROFILES_ACTIVE"]) ||
      (this.customProperties && this.customProperties["ACTIVE_PROFILES"]) ||
      processUtils.getEnv("SPRING_PROFILES_ACTIVE") ||
      processUtils.getEnv("ACTIVE_PROFILES") ||
      processUtils.getEnv("NODE_ENV") ||
      "development";

    this.activeProfiles = Object.freeze(
      rawProfiles
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean)
    );

    // 2. Load YAML defaults from src/main/resources/application.yml
    const yamlSource = YamlPropertySourceLoader.load(this.activeProfiles);
    this.compositePropertySource.addLast(yamlSource);

    // 3. Add system environment variables
    const envSource = new SystemEnvironmentPropertySource();
    this.compositePropertySource.addFirst(envSource);

    // 4. Add custom properties if provided
    if (this.customProperties) {
      const customSource = new MapPropertySource("customProperties", this.customProperties);
      this.compositePropertySource.addFirst(customSource);
    }
  }

  public getActiveProfiles(): readonly string[] {
    return this.activeProfiles;
  }

  public getDefaultProfiles(): readonly string[] {
    return this.defaultProfiles;
  }

  public acceptsProfiles(...profiles: string[]): boolean {
    const targets = profiles.map((p) => p.trim().toLowerCase());
    return this.activeProfiles.some((active) => targets.includes(active));
  }

  public containsProperty(key: string): boolean {
    return this.resolveValue(key) !== undefined;
  }

  public getProperty(key: string): string | undefined;
  public getProperty(key: string, defaultValue: string): string;
  public getProperty(key: string, defaultValue?: string): string | undefined {
    return this.resolveValue(key) ?? defaultValue;
  }

  public getPropertyAsNumber(key: string, defaultValue?: number): number {
    const val = this.resolveValue(key);
    if (val === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      throw new Error(`[Environment] Number property '${key}' is undefined and has no default.`);
    }
    const num = Number(val);
    if (Number.isNaN(num)) {
      if (defaultValue !== undefined) return defaultValue;
      throw new Error(`[Environment] Property '${key}' with value '${val}' is not a valid number.`);
    }
    return num;
  }

  public getPropertyAsBoolean(key: string, defaultValue = false): boolean {
    const val = this.resolveValue(key);
    if (val === undefined) return defaultValue;
    const lower = val.toLowerCase().trim();
    return lower === "true" || lower === "1" || lower === "yes" || lower === "on";
  }

  public getRequiredProperty(key: string): string {
    const val = this.resolveValue(key);
    if (val === undefined || val.trim() === "") {
      throw new Error(`[Environment] Mandatory property '${key}' is missing or blank.`);
    }
    return val;
  }

  public getAllProperties(): Readonly<Record<string, string | undefined>> {
    return this.compositePropertySource.getAllProperties();
  }

  public getPlatform(): string {
    return processUtils.platform;
  }

  public isWindows(): boolean {
    return processUtils.platform === "win32";
  }

  /**
   * Relaxed property binding resolver.
   * Resolves exact key, upper snake_case, dot notation, and kebab-case.
   */
  private resolveValue(key: string): string | undefined {
    // 1. Direct key check
    const direct = this.compositePropertySource.getProperty(key);
    if (direct !== undefined) return direct;

    // 2. Upper snake_case: tasks.lifecycle.heartbeatTimeoutSeconds -> TASKS_LIFECYCLE_HEARTBEATTIMEOUTSECONDS or TASKS_LIFECYCLE_HEARTBEAT_TIMEOUT_SECONDS
    const envKey = key.toUpperCase().replace(/[\.\-]/g, "_");
    const fromEnvKey = this.compositePropertySource.getProperty(envKey);
    if (fromEnvKey !== undefined) return fromEnvKey;

    // 3. CamelCase to SNAKE_CASE relaxed match: heartbeatTimeoutSeconds -> HEARTBEAT_TIMEOUT_SECONDS
    const camelToSnake = key
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toUpperCase()
      .replace(/[\.\-]/g, "_");
    const fromCamelSnake = this.compositePropertySource.getProperty(camelToSnake);
    if (fromCamelSnake !== undefined) return fromCamelSnake;

    // 4. Dot notation lowercase match
    const lowerKey = key.toLowerCase();
    const fromLower = this.compositePropertySource.getProperty(lowerKey);
    if (fromLower !== undefined) return fromLower;

    return undefined;
  }
}

export const environment: Environment = new StandardEnvironment();
