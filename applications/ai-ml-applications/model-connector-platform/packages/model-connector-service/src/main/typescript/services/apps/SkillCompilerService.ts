import { randomUUID } from "@model-box/model-connector-core";

export interface CompiledSkillManifest {
  readonly skillId: string;
  readonly skillName: string;
  readonly description: string;
  readonly toolsCount: number;
  readonly declaredTools: readonly string[];
  readonly validationErrors: readonly string[];
  readonly isValid: boolean;
}

/**
 * Enterprise Skill.md Compiler & App Builder Service.
 * Conforms to:
 * - Roadmap STEP-13, LLD §4.5 & UC-02: Apps Builder Studio & SKILL.md Ingestion
 * - STD-COD-007: Resilient Validation & Immutability by Default
 */
export class SkillCompilerService {
  public static compileSkillMarkdown(rawMarkdown: string): CompiledSkillManifest {
    const lines = rawMarkdown.split("\n");
    let skillName = "Unnamed Skill";
    let description = "";
    const declaredTools: string[] = [];
    const validationErrors: string[] = [];

    for (const line of lines) {
      if (line.startsWith("# ")) {
        skillName = line.slice(2).trim();
      } else if (line.startsWith("> Description:")) {
        description = line.replace("> Description:", "").trim();
      } else if (line.trim().startsWith("- tool:") || line.trim().startsWith("- name:")) {
        const toolName = line.split(":")[1]?.trim();
        if (toolName) declaredTools.push(toolName);
      }
    }

    if (declaredTools.length === 0) {
      validationErrors.push("SKILL.md must declare at least one executable tool.");
    }

    return Object.freeze({
      skillId: `SKILL-${randomUUID()}`,
      skillName,
      description: description || "Autonomous agent skill definition",
      toolsCount: declaredTools.length,
      declaredTools: Object.freeze(declaredTools),
      validationErrors: Object.freeze(validationErrors),
      isValid: validationErrors.length === 0,
    });
  }
}
