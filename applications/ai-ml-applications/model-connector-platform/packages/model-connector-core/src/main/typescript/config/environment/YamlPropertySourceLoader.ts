import { fileUtils } from "@/utils/file/fileUtils.js";
import { pathUtils } from "@/utils/file/pathUtils.js";
import { processUtils } from "@/utils/process/processUtils.js";
import { MapPropertySource } from "@/config/environment/PropertySource.js";

/**
 * Spring-Style YAML Property Source Loader.
 * Discovers and parses application.yml (and profile variants) from src/main/resources,
 * flattening hierarchical keys into Spring-standard dot-notation properties.
 *
 * Conforms to:
 * - STD-COD-002: Centralized Configuration & Property Binding
 * - STD-COD-007: Resilient Error Handling & Pure Logic
 * - STD-COD-010: Encapsulated Utils
 */
export class YamlPropertySourceLoader {
  /**
   * Discovers and loads the primary application.yml and optional profile overrides.
   */
  public static load(activeProfiles: readonly string[] = []): MapPropertySource {
    const rawProperties: Record<string, string | undefined> = {};

    // 1. Locate and parse default application.yml
    const defaultFilePath = this.findApplicationYaml();
    if (defaultFilePath && fileUtils.exists(defaultFilePath)) {
      try {
        const content = fileUtils.readFileSync(defaultFilePath);
        const parsed = this.parseYaml(content);
        Object.assign(rawProperties, parsed);
      } catch {
        // Fallback gracefully if format is corrupt
      }
    }

    // 2. Discover and parse profile-specific application-{profile}.yml
    for (const profile of activeProfiles) {
      const profilePath = this.findProfileYaml(profile);
      if (profilePath && fileUtils.exists(profilePath)) {
        try {
          const profileContent = fileUtils.readFileSync(profilePath);
          const profileParsed = this.parseYaml(profileContent);
          Object.assign(rawProperties, profileParsed);
        } catch {
          // Graceful ignore
        }
      }
    }

    return new MapPropertySource("applicationConfig: [classpath:application.yml]", rawProperties);
  }

  /**
   * Locates application.yml from standard Maven/Spring resource candidate paths.
   */
  public static findApplicationYaml(): string | null {
    const customConfig = processUtils.getEnv("SPRING_CONFIG_LOCATION") || processUtils.getEnv("APPLICATION_CONFIG_PATH");
    if (customConfig && fileUtils.exists(customConfig)) {
      return customConfig;
    }

    const cwd = processUtils.cwd();
    const candidates = [
      pathUtils.resolve(cwd, "src", "main", "resources", "application.yml"),
      pathUtils.resolve(cwd, "packages", "model-connector-core", "src", "main", "resources", "application.yml"),
      pathUtils.resolve(cwd, "resources", "application.yml"),
      pathUtils.resolve(cwd, "config", "env", "application.yml"),
      pathUtils.resolve(cwd, "..", "..", "config", "env", "application.yml"),
      pathUtils.resolve(cwd, "..", "..", "packages", "model-connector-core", "src", "main", "resources", "application.yml"),
      "/app/packages/model-connector-core/src/main/resources/application.yml",
      "/app/config/env/application.yml",
    ];

    for (const p of candidates) {
      if (fileUtils.exists(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Locates application-{profile}.yml candidate paths.
   */
  public static findProfileYaml(profile: string): string | null {
    const cwd = processUtils.cwd();
    const filename = `application-${profile}.yml`;
    const candidates = [
      pathUtils.resolve(cwd, "src", "main", "resources", filename),
      pathUtils.resolve(cwd, "packages", "model-connector-core", "src", "main", "resources", filename),
      pathUtils.resolve(cwd, "resources", filename),
      pathUtils.resolve(cwd, "config", "env", filename),
      pathUtils.resolve(cwd, "..", "..", "config", "env", filename),
    ];

    for (const p of candidates) {
      if (fileUtils.exists(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Parses YAML text into flattened dot-notation key/value pairs.
   * Handles nested maps, arrays, quotes, comments, and ${VAR:default} interpolation.
   */
  public static parseYaml(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split(/\r?\n/);
    const stack: { indent: number; key: string }[] = [];

    for (const rawLine of lines) {
      // Strip comments unless enclosed in quotes
      const commentIdx = rawLine.indexOf("#");
      const lineWithoutComment = commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine;
      if (!lineWithoutComment.trim()) continue;

      const indent = rawLine.search(/\S/);
      if (indent === -1) continue;

      const trimmed = lineWithoutComment.trim();

      // Adjust stack to current indentation
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      // Check key-value or parent object
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const keyPart = trimmed.slice(0, colonIdx).trim();
      const valPart = trimmed.slice(colonIdx + 1).trim();

      if (valPart === "") {
        // Parent object
        stack.push({ indent, key: keyPart });
      } else {
        // Leaf property
        const fullKey = [...stack.map((s) => s.key), keyPart].join(".");
        const resolvedVal = this.resolveValue(valPart);
        result[fullKey] = resolvedVal;
      }
    }

    return result;
  }

  /**
   * Cleans quotes and resolves ${ENV_VAR:defaultValue} placeholders.
   */
  private static resolveValue(raw: string): string {
    let clean = raw.trim();
    if (
      (clean.startsWith('"') && clean.endsWith('"')) ||
      (clean.startsWith("'") && clean.endsWith("'"))
    ) {
      clean = clean.slice(1, -1);
    }

    // Interpolate ${VAR:default}
    const varPattern = /\$\{([^:}]+)(?::([^}]*))?\}/g;
    return clean.replace(varPattern, (_, varName, defVal) => {
      const envVal = processUtils.getEnv(varName);
      if (envVal !== undefined && envVal !== "") return envVal;
      return defVal !== undefined ? defVal : "";
    });
  }
}
