import { AuthType, isCopilotModel } from "@/domain/constants/index.js";

export type ModelAuthTypeValue = (typeof AuthType)[keyof typeof AuthType];

/**
 * Context object for resolving the effective authentication type.
 */
export interface AuthTypeResolutionContext {
  readonly model: string;
  readonly token: string;
  readonly explicitAuthType?: string;
}

/**
 * Strategy interface for polymorphic authentication type resolution.
 * Conforms to STD-COD-005 (Strategy Pattern, eliminating multi-conditional ternaries).
 */
export interface IAuthTypeResolutionStrategy {
  readonly priority: number;
  supports(context: AuthTypeResolutionContext): boolean;
  resolve(context: AuthTypeResolutionContext): ModelAuthTypeValue;
}

/**
 * Strategy for explicit user-supplied authentication type.
 */
export class ExplicitAuthTypeStrategy implements IAuthTypeResolutionStrategy {
  public readonly priority = 10;

  public supports(context: AuthTypeResolutionContext): boolean {
    return Boolean(
      context.explicitAuthType && context.explicitAuthType.trim().length > 0,
    );
  }

  public resolve(context: AuthTypeResolutionContext): ModelAuthTypeValue {
    return context.explicitAuthType!.trim() as ModelAuthTypeValue;
  }
}

/**
 * Strategy for Google OAuth Bearer tokens (typically prefixed with 'ya29.').
 */
export class GoogleOAuthTokenStrategy implements IAuthTypeResolutionStrategy {
  public readonly priority = 20;
  private static readonly GOOGLE_OAUTH_PREFIX = "ya29.";

  public supports(context: AuthTypeResolutionContext): boolean {
    return context.token.startsWith(
      GoogleOAuthTokenStrategy.GOOGLE_OAUTH_PREFIX,
    );
  }

  public resolve(): ModelAuthTypeValue {
    return AuthType.OAUTH_GOOGLE;
  }
}

/**
 * Strategy for GitHub Copilot models and tokens (ghp_, gho_, ghu_, github_pat_, copilot_).
 */
export class CopilotAuthStrategy implements IAuthTypeResolutionStrategy {
  public readonly priority = 30;
  private static readonly COPILOT_PREFIXES = [
    "gh",
    "github_",
    "copilot_",
  ] as const;

  public supports(context: AuthTypeResolutionContext): boolean {
    if (isCopilotModel(context.model)) {
      return true;
    }
    return CopilotAuthStrategy.COPILOT_PREFIXES.some((prefix) =>
      context.token.startsWith(prefix),
    );
  }

  public resolve(): ModelAuthTypeValue {
    return AuthType.OAUTH_COPILOT;
  }
}

/**
 * Fallback strategy defaulting to standard API Key authentication.
 */
export class DefaultApiKeyAuthStrategy implements IAuthTypeResolutionStrategy {
  public readonly priority = 100;

  public supports(): boolean {
    return true;
  }

  public resolve(): ModelAuthTypeValue {
    return AuthType.API_KEY;
  }
}

/**
 * Composite AuthType Resolver using ordered Strategy dispatch.
 * Conforms to:
 * - STD-COD-005: Strategy Pattern and Polymorphic Dispatch
 * - STD-COD-006: Cyclomatic Complexity <= 3 per method, nesting depth <= 1
 * - STD-COD-007: SLAP & Immutability by Default
 */
export class AuthTypeResolver {
  private readonly strategies: readonly IAuthTypeResolutionStrategy[];

  constructor(customStrategies?: IAuthTypeResolutionStrategy[]) {
    const list = customStrategies || [
      new ExplicitAuthTypeStrategy(),
      new GoogleOAuthTokenStrategy(),
      new CopilotAuthStrategy(),
      new DefaultApiKeyAuthStrategy(),
    ];
    this.strategies = Object.freeze(
      [...list].sort((a, b) => a.priority - b.priority),
    );
  }

  public resolveAuthType(
    context: AuthTypeResolutionContext,
  ): ModelAuthTypeValue {
    const strategy = this.strategies.find((s) => s.supports(context));
    return strategy ? strategy.resolve(context) : AuthType.API_KEY;
  }
}

export const authTypeResolver = new AuthTypeResolver();
