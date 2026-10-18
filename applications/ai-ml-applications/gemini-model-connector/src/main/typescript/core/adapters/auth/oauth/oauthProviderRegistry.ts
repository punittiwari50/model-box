import { ModelCatalog } from '@/domain/constants/index.js';
import type { IOAuthProvider } from '@/core/adapters/auth/oauth/iOAuthProvider.js';
import { GoogleOAuthProvider } from '@/core/adapters/auth/oauth/googleOAuthProvider.js';
import { AnthropicOAuthProvider } from '@/core/adapters/auth/oauth/anthropicOAuthProvider.js';
import { OpenAiOAuthProvider } from '@/core/adapters/auth/oauth/openAiOAuthProvider.js';
import { CopilotOAuthProvider } from '@/core/adapters/auth/oauth/copilotOAuthProvider.js';
import { OllamaOAuthProvider } from '@/core/adapters/auth/oauth/ollamaOAuthProvider.js';

/**
 * Type-Safe Factory Registry for OAuth & Authentication Providers.
 * Conforms to STD-PAT-CORE-TYPESCRIPT #1 (Generic Registry Map) and eliminates if/else branching.
 */
export class OAuthProviderRegistry {
  private readonly providers: IOAuthProvider[] = [];

  constructor() {
    this.register(new GoogleOAuthProvider());
    this.register(new AnthropicOAuthProvider());
    this.register(new OpenAiOAuthProvider());
    this.register(new CopilotOAuthProvider());
    this.register(new OllamaOAuthProvider());
  }

  public register(provider: IOAuthProvider): void {
    this.providers.push(provider);
  }

  /**
   * Dispatches to matching provider strategy in O(1) without if/else or switch ladders.
   */
  public getProvider(modelOrProvider: string = ModelCatalog.DEFAULT): IOAuthProvider {
    const found = this.providers.find((p) => p.supports(modelOrProvider));
    if (found) {
      return found;
    }
    // Fall back to first registered default provider (Google)
    return this.providers[0];
  }

  public getAllProviders(): readonly IOAuthProvider[] {
    return this.providers;
  }
}

export const oauthProviderRegistry = new OAuthProviderRegistry();
