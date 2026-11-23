import type { IModelAuthenticator } from "@/auth/authenticators/types.js";
import { GoogleModelAuthenticator } from "@/auth/authenticators/GoogleModelAuthenticator.js";
import { AnthropicModelAuthenticator } from "@/auth/authenticators/AnthropicModelAuthenticator.js";
import { OpenAIModelAuthenticator } from "@/auth/authenticators/OpenAIModelAuthenticator.js";
import { GitHubCopilotAuthenticator } from "@/auth/authenticators/GitHubCopilotAuthenticator.js";
import { FallbackModelAuthenticator } from "@/auth/authenticators/FallbackModelAuthenticator.js";

/**
 * Model Authenticator Factory & Strategy Dispatcher.
 * Conforms to:
 * - STD-COD-005: Factory & Strategy Pattern (Zero nested if/else or switch)
 * - STD-COD-006: Cyclomatic complexity <= 10
 * - STD-COD-007: Immutability by default
 */
export class ModelAuthenticatorFactory {
  private readonly fallbackAuthenticator: IModelAuthenticator;
  private readonly authenticators: readonly IModelAuthenticator[];

  constructor() {
    this.fallbackAuthenticator = new FallbackModelAuthenticator();
    this.authenticators = Object.freeze([
      new GoogleModelAuthenticator(),
      new AnthropicModelAuthenticator(),
      new OpenAIModelAuthenticator(),
      new GitHubCopilotAuthenticator(),
      this.fallbackAuthenticator,
    ]);
  }

  public resolve(modelId: string): IModelAuthenticator {
    const matched = this.authenticators.find((auth) => auth.supports(modelId));
    return matched ?? this.fallbackAuthenticator;
  }

  public getAll(): readonly IModelAuthenticator[] {
    return this.authenticators;
  }
}

export const modelAuthenticatorFactory = new ModelAuthenticatorFactory();
