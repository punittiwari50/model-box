/**
 * Authentication Provider Architecture Facade.
 * Delegates to the decoupled OOP OAuth strategy providers in @/core/adapters/auth/oauth/index.js.
 *
 * Conforms to:
 * - STD-COD-005: Decoupled OOP Strategy Pattern & Open/Closed Principle
 * - Requirement #4 & #7: Loosely coupled from application.yml and database
 */

export * from "@/core/adapters/auth/oauth/index.js";

import {
  type IOAuthProvider,
  GoogleOAuthProvider,
  AnthropicOAuthProvider,
  OpenAiOAuthProvider,
  OAuthProviderRegistry,
  oauthProviderRegistry,
} from "@/core/adapters/auth/oauth/index.js";

// Backward compatibility type and value exports
export type AuthProvider = IOAuthProvider;
export type AuthProviderRegistry = OAuthProviderRegistry;

export {
  GoogleOAuthProvider as GoogleAuthProvider,
  AnthropicOAuthProvider as AnthropicAuthProvider,
  OpenAiOAuthProvider as OpenAiAuthProvider,
  OAuthProviderRegistry as AuthProviderRegistryClass,
  oauthProviderRegistry as authProviderRegistry,
};

export const AuthProviderRegistry = OAuthProviderRegistry;
