import type { IModelPropertyResolver } from "@/domain/resolvers/IModelPropertyResolver.js";
import { GeminiModelPropertyResolver } from "@/domain/resolvers/GeminiModelPropertyResolver.js";
import { OpenAiModelPropertyResolver } from "@/domain/resolvers/OpenAiModelPropertyResolver.js";
import { ClaudeModelPropertyResolver } from "@/domain/resolvers/ClaudeModelPropertyResolver.js";
import { GrokModelPropertyResolver } from "@/domain/resolvers/GrokModelPropertyResolver.js";
import { CopilotModelPropertyResolver } from "@/domain/resolvers/CopilotModelPropertyResolver.js";
import { OllamaModelPropertyResolver } from "@/domain/resolvers/OllamaModelPropertyResolver.js";
import { GenericFallbackModelPropertyResolver } from "@/domain/resolvers/GenericFallbackModelPropertyResolver.js";

export interface IModelPropertyResolverRegistry {
  resolve(model: string): IModelPropertyResolver;
  register(resolver: IModelPropertyResolver): void;
}

/**
 * Registry & DI Container for Model Property Resolvers.
 * Implements Polymorphic Dispatch to eliminate procedural if/else chains (STD-COD-005).
 */
export class ModelPropertyResolverRegistry implements IModelPropertyResolverRegistry {
  private static instance: ModelPropertyResolverRegistry | null = null;
  private readonly resolvers: IModelPropertyResolver[] = [];
  private readonly fallbackResolver: IModelPropertyResolver;

  constructor(customResolvers?: IModelPropertyResolver[]) {
    this.fallbackResolver = new GenericFallbackModelPropertyResolver();
    const defaults: IModelPropertyResolver[] = [
      new CopilotModelPropertyResolver(),
      new GeminiModelPropertyResolver(),
      new OpenAiModelPropertyResolver(),
      new ClaudeModelPropertyResolver(),
      new GrokModelPropertyResolver(),
      new OllamaModelPropertyResolver(),
    ];
    this.resolvers = customResolvers ?? defaults;
  }

  public static getInstance(): ModelPropertyResolverRegistry {
    if (!this.instance) {
      this.instance = new ModelPropertyResolverRegistry();
    }
    return this.instance;
  }

  public register(resolver: IModelPropertyResolver): void {
    this.resolvers.unshift(resolver);
  }

  public resolve(model: string): IModelPropertyResolver {
    const matched = this.resolvers.find((r) => r.supports(model));
    if (matched) {
      return matched;
    }
    return this.fallbackResolver;
  }
}
