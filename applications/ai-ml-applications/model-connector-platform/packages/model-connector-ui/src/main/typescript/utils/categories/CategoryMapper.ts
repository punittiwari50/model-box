import type { UiCategory } from "@/types/ui.types";

export interface ICategoryMetadata {
  readonly label: string;
  readonly icon: string;
  readonly accentColor?: string;
  readonly description?: string;
}

export class CategoryMapper {
  private static readonly DEFAULT_CATEGORIES = [
    "all",
    "gemini",
    "grok",
    "claude",
    "chatgpt",
    "copilot",
    "ollama",
    "codex",
    "cursor",
  ];

  public static buildMetadataMap(
    categories: readonly UiCategory[],
  ): Record<string, ICategoryMetadata> {
    const map: Record<string, ICategoryMetadata> = {};
    for (const c of categories) {
      map[c.categoryId.toLowerCase()] = {
        label: c.label,
        icon: c.icon,
        accentColor: c.accentColor,
        description: c.description,
      };
    }
    // Harmonize provider aliases and missing providers
    if (map.chatgpt && !map.openai) {
      map.openai = map.chatgpt;
    }
    if (map.ollama && !map.fallback) {
      map.fallback = map.ollama;
    }
    if (!map.codex) {
      map.codex = {
        label: "CODEX",
        icon: "❖",
        accentColor: "#94a3b8",
        description: "OpenAI Codex Series",
      };
    }
    if (!map.cursor) {
      map.cursor = {
        label: "Cursor",
        icon: "⚡",
        accentColor: "#38bdf8",
        description: "Cursor AI Agent",
      };
    }
    return map;
  }

  public static extractFilterList(categories: readonly UiCategory[]): string[] {
    const list = ["all"];
    for (const c of categories) {
      const key = c.categoryId.toLowerCase();
      if (!list.includes(key)) {
        list.push(key);
      }
    }
    if (list.length === 1) {
      return [...this.DEFAULT_CATEGORIES];
    }
    return list;
  }
}
