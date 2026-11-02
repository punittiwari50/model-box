import type { UiModel } from "@/types/ui.types";

export interface IModelFilterCriteria {
  readonly searchQuery?: string;
  readonly family?: string;
}

export interface IModelFilterStrategy {
  filter(models: readonly UiModel[], criteria: IModelFilterCriteria): UiModel[];
  matches(model: UiModel, criteria: IModelFilterCriteria): boolean;
}

export class DefaultModelFilterStrategy implements IModelFilterStrategy {
  private static readonly ALL_FILTER = "all";
  private static readonly CHATGPT_ALIAS = "chatgpt";
  private static readonly OPENAI_ALIAS = "openai";

  public filter(models: readonly UiModel[], criteria: IModelFilterCriteria): UiModel[] {
    return models.filter((model) => this.matches(model, criteria));
  }

  public matches(model: UiModel, criteria: IModelFilterCriteria): boolean {
    return this.matchesFamily(model, criteria.family) && this.matchesSearch(model, criteria.searchQuery);
  }

  private matchesFamily(model: UiModel, familyFilter?: string): boolean {
    if (!familyFilter || familyFilter.toLowerCase() === DefaultModelFilterStrategy.ALL_FILTER) {
      return true;
    }
    const modelFamily = model.family.toLowerCase();
    const targetFilter = familyFilter.toLowerCase();

    if (modelFamily === targetFilter) {
      return true;
    }
    if (targetFilter === DefaultModelFilterStrategy.CHATGPT_ALIAS && modelFamily === DefaultModelFilterStrategy.OPENAI_ALIAS) {
      return true;
    }
    return false;
  }

  private matchesSearch(model: UiModel, query?: string): boolean {
    if (!query || query.trim() === "") {
      return true;
    }
    const normalized = query.toLowerCase().trim();
    const nameMatches = model.name.toLowerCase().includes(normalized);
    const idMatches = model.id.toLowerCase().includes(normalized);
    const descMatches = model.description ? model.description.toLowerCase().includes(normalized) : false;

    return nameMatches || idMatches || descMatches;
  }
}

export const modelFilterStrategy = new DefaultModelFilterStrategy();
