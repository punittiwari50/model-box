import { AuthScheme, HttpHeader } from "@/domain/constants/index.js";
import { config } from "@/core/config/index.js";
import { traceContext } from "@/core/observability/tracing/traceContext.js";

export interface AuthorizationContext {
  readonly scheme?: string;
  readonly tokenOrKey?: string;
  readonly model?: string;
  readonly customHeaders?: Record<string, string>;
}

export interface AuthorizedRequestPlan {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/**
 * Strategy Pattern Interface for Request Authorization (STD-PAT-CORE-TYPESCRIPT #1).
 * Replaces procedural if/else and switch ladders with polymorphic dispatch.
 */
export interface IRequestAuthorizer {
  readonly scheme: string;
  supports(scheme: string): boolean;
  authorize(
    url: string,
    headers: Record<string, string>,
    context: AuthorizationContext,
  ): AuthorizedRequestPlan;
}

/**
 * Standard RFC 6750 Bearer Token Authorization Strategy.
 */
export class BearerRequestAuthorizer implements IRequestAuthorizer {
  public readonly scheme = AuthScheme.BEARER;

  public supports(scheme: string): boolean {
    return scheme.toLowerCase() === AuthScheme.BEARER.toLowerCase();
  }

  public authorize(
    url: string,
    headers: Record<string, string>,
    context: AuthorizationContext,
  ): AuthorizedRequestPlan {
    const updatedHeaders = { ...headers };
    if (context.tokenOrKey) {
      updatedHeaders[HttpHeader.AUTHORIZATION] =
        `${AuthScheme.BEARER} ${context.tokenOrKey}`;
    }
    return { url, headers: updatedHeaders };
  }
}

/**
 * Google Gemini API Key Authorization Strategy.
 */
export class GoogleApiKeyAuthorizer implements IRequestAuthorizer {
  public readonly scheme = AuthScheme.GOOGLE_API_KEY;

  public supports(scheme: string): boolean {
    return scheme.toLowerCase() === AuthScheme.GOOGLE_API_KEY.toLowerCase();
  }

  public authorize(
    url: string,
    headers: Record<string, string>,
    context: AuthorizationContext,
  ): AuthorizedRequestPlan {
    const updatedHeaders = { ...headers };
    let targetUrl = url;

    if (context.tokenOrKey) {
      updatedHeaders["x-goog-api-key"] = context.tokenOrKey;
      try {
        const parsedUrl = new URL(url);
        if (!parsedUrl.searchParams.has("key")) {
          parsedUrl.searchParams.set("key", context.tokenOrKey);
          targetUrl = parsedUrl.toString();
        }
      } catch {
        targetUrl = url;
      }
    }
    return { url: targetUrl, headers: updatedHeaders };
  }
}

/**
 * Anthropic Claude API Key Authorization Strategy.
 */
export class AnthropicApiKeyAuthorizer implements IRequestAuthorizer {
  public readonly scheme = AuthScheme.ANTHROPIC_API_KEY;

  public supports(scheme: string): boolean {
    return scheme.toLowerCase() === AuthScheme.ANTHROPIC_API_KEY.toLowerCase();
  }

  public authorize(
    url: string,
    headers: Record<string, string>,
    context: AuthorizationContext,
  ): AuthorizedRequestPlan {
    const updatedHeaders: Record<string, string> = {
      ...headers,
      "anthropic-version": config.authEndpoints.anthropicVersion,
    };
    if (context.tokenOrKey) {
      updatedHeaders["x-api-key"] = context.tokenOrKey;
    }
    return { url, headers: updatedHeaders };
  }
}

/**
 * OpenAI / Codex Bearer Key Authorization Strategy.
 */
export class OpenAiBearerAuthorizer implements IRequestAuthorizer {
  public readonly scheme = AuthScheme.OPENAI_BEARER;

  public supports(scheme: string): boolean {
    return scheme.toLowerCase() === AuthScheme.OPENAI_BEARER.toLowerCase();
  }

  public authorize(
    url: string,
    headers: Record<string, string>,
    context: AuthorizationContext,
  ): AuthorizedRequestPlan {
    const updatedHeaders = { ...headers };
    if (context.tokenOrKey) {
      updatedHeaders[HttpHeader.AUTHORIZATION] =
        `${AuthScheme.BEARER} ${context.tokenOrKey}`;
    }
    return { url, headers: updatedHeaders };
  }
}

/**
 * No-Op Strategy for Unauthenticated Public Endpoints.
 */
export class NoOpRequestAuthorizer implements IRequestAuthorizer {
  public readonly scheme = AuthScheme.NOOP;

  public supports(scheme: string): boolean {
    return scheme.toLowerCase() === AuthScheme.NOOP.toLowerCase();
  }

  public authorize(
    url: string,
    headers: Record<string, string>,
  ): AuthorizedRequestPlan {
    return { url, headers: { ...headers } };
  }
}

/**
 * Request Authorizer Registry using Strategy Map Dispatch (STD-COD-005).
 */
export class RequestAuthorizerRegistry {
  private readonly strategies = new Map<string, IRequestAuthorizer>();
  private readonly defaultStrategy: IRequestAuthorizer;

  constructor() {
    this.defaultStrategy = new BearerRequestAuthorizer();
    this.register(this.defaultStrategy);
    this.register(new GoogleApiKeyAuthorizer());
    this.register(new AnthropicApiKeyAuthorizer());
    this.register(new OpenAiBearerAuthorizer());
    this.register(new NoOpRequestAuthorizer());
  }

  public register(authorizer: IRequestAuthorizer): void {
    this.strategies.set(authorizer.scheme.toLowerCase(), authorizer);
  }

  public resolve(scheme?: string): IRequestAuthorizer {
    if (!scheme) {
      return this.defaultStrategy;
    }
    const matched = this.strategies.get(scheme.toLowerCase());
    return matched || this.defaultStrategy;
  }
}

export const requestAuthorizerRegistry = new RequestAuthorizerRegistry();

/**
 * Declarative Authorized HTTP Client (OOP Pattern).
 * Applies the configured authorization strategy, propagates distributed trace context,
 * and executes the HTTP call.
 */
export class AuthorizedHttpClient {
  private readonly registry: RequestAuthorizerRegistry;

  constructor(registry: RequestAuthorizerRegistry = requestAuthorizerRegistry) {
    this.registry = registry;
  }

  public async fetch(
    input: string | URL,
    init: RequestInit = {},
    context: AuthorizationContext = {},
  ): Promise<Response> {
    const authorizer = this.registry.resolve(context.scheme);
    const inputUrl = typeof input === "string" ? input : input.toString();

    const existingHeaders: Record<string, string> = {};
    if (init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((val, key) => {
          existingHeaders[key] = val;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([key, val]) => {
          existingHeaders[key] = val;
        });
      } else {
        Object.assign(existingHeaders, init.headers);
      }
    }

    if (context.customHeaders) {
      Object.assign(existingHeaders, context.customHeaders);
    }

    // Inject distributed tracing headers
    const traceHeaders = traceContext.getTraceHeaders();
    Object.assign(existingHeaders, traceHeaders);

    const plan = authorizer.authorize(inputUrl, existingHeaders, context);

    return fetch(plan.url, {
      ...init,
      headers: plan.headers,
    });
  }
}

export const authorizedHttpClient = new AuthorizedHttpClient();

/**
 * Backward compatibility facade delegating to AuthorizedHttpClient singleton.
 */
export const authorizedFetch = (
  input: string | URL,
  init: RequestInit = {},
  context: AuthorizationContext = {},
): Promise<Response> => authorizedHttpClient.fetch(input, init, context);
