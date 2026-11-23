import { platformDatabase } from "@/database/platformDatabase";
import { PaginationQueryGuard } from "@/database/PaginationQueryGuard";

export interface ModelCategoryRecord {
  readonly categoryId: string;
  readonly label: string;
  readonly icon: string;
  readonly accentColor: string;
  readonly description: string;
  readonly sortOrder: number;
  readonly createdTimestamp: string;
}

const DEFAULT_SYSTEM_CATEGORIES: readonly ModelCategoryRecord[] = Object.freeze([
  {
    categoryId: "google",
    label: "Google Gemini",
    icon: "✨",
    accentColor: "#4285F4",
    description: "Google DeepMind Gemini 3.8 & 3.5 multimodal reasoning models",
    sortOrder: 1,
    createdTimestamp: "2026-01-01T00:00:00.000Z",
  },
  {
    categoryId: "anthropic",
    label: "Anthropic Claude",
    icon: "🎭",
    accentColor: "#D97757",
    description: "Anthropic Claude 3.7 & 3.5 Sonnet / Haiku models",
    sortOrder: 2,
    createdTimestamp: "2026-01-01T00:00:00.000Z",
  },
  {
    categoryId: "microsoft",
    label: "GitHub Copilot",
    icon: "🐙",
    accentColor: "#6E40C9",
    description: "GitHub Copilot & Microsoft enterprise coding models",
    sortOrder: 3,
    createdTimestamp: "2026-01-01T00:00:00.000Z",
  },
  {
    categoryId: "openai",
    label: "OpenAI GPT",
    icon: "🧠",
    accentColor: "#10A37F",
    description: "OpenAI GPT-4o, o3-mini, and Codex models",
    sortOrder: 4,
    createdTimestamp: "2026-01-01T00:00:00.000Z",
  },
  {
    categoryId: "xai",
    label: "xAI Grok",
    icon: "🚀",
    accentColor: "#1DA1F2",
    description: "xAI Grok-3 and Grok-2 real-time reasoning models",
    sortOrder: 5,
    createdTimestamp: "2026-01-01T00:00:00.000Z",
  },
  {
    categoryId: "ollama",
    label: "Local Ollama",
    icon: "🦙",
    accentColor: "#F59E0B",
    description: "Local open-weights models (lfm3-omni, LLaMA 3.2, Qwen, Phi-4, Gemma)",
    sortOrder: 6,
    createdTimestamp: "2026-01-01T00:00:00.000Z",
  },
]);

export class CategoryRepository {
  public listCategories(limit?: number, offset?: number): ModelCategoryRecord[] {
    const { limit: safeLimit, offset: safeOffset } = PaginationQueryGuard.resolveCriteria(
      limit,
      offset,
    );
    const db = platformDatabase.getDatabase();
    const rows = db
      .prepare(
        `SELECT 
          CATEGORY_ID as categoryId,
          LABEL as label,
          ICON as icon,
          ACCENT_COLOR as accentColor,
          DESCRIPTION as description,
          SORT_ORDER as sortOrder,
          CREATED_TIMESTAMP as createdTimestamp
        FROM MODEL_CATEGORIES
        ORDER BY SORT_ORDER ASC, CATEGORY_ID ASC
        LIMIT ? OFFSET ?`,
      )
      .all(safeLimit, safeOffset) as unknown as ModelCategoryRecord[];

    if (rows.length > 0) {
      return rows;
    }
    return DEFAULT_SYSTEM_CATEGORIES.slice(safeOffset, safeOffset + safeLimit);
  }

  public getCategory(categoryId: string): ModelCategoryRecord | null {
    const db = platformDatabase.getDatabase();
    const row = db
      .prepare(
        `SELECT 
          CATEGORY_ID as categoryId,
          LABEL as label,
          ICON as icon,
          ACCENT_COLOR as accentColor,
          DESCRIPTION as description,
          SORT_ORDER as sortOrder,
          CREATED_TIMESTAMP as createdTimestamp
        FROM MODEL_CATEGORIES
        WHERE CATEGORY_ID = ?`,
      )
      .get(categoryId) as unknown as ModelCategoryRecord | undefined;

    if (row) {
      return row;
    }
    return DEFAULT_SYSTEM_CATEGORIES.find((c) => c.categoryId === categoryId) ?? null;
  }
}

export const categoryRepository = new CategoryRepository();
