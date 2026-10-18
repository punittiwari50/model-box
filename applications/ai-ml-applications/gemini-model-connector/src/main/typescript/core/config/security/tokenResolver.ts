import { AuthStatusConstant } from "@/domain/constants/index.js";
import type { ModelAuth } from "@/domain/index.js";
import { modelApiKeyRegistry } from "@/core/config/security/modelApiKeyProvider.js";

export interface TokenResolutionContext {
  readonly modelName?: string;
  readonly explicitApiKey?: string;
  readonly modelAuth?: ModelAuth | null;
  readonly configApiKey?: string;
}

export interface TokenResolver {
  setNext(resolver: TokenResolver): TokenResolver;
  resolve(context: TokenResolutionContext): string | undefined;
}

export abstract class BaseTokenResolver implements TokenResolver {
  private nextResolver?: TokenResolver;

  public setNext(resolver: TokenResolver): TokenResolver {
    this.nextResolver = resolver;
    return resolver;
  }

  public resolve(context: TokenResolutionContext): string | undefined {
    const token = this.doResolve(context);
    if (token && token.trim().length > 0) {
      return token.trim();
    }
    return this.nextResolver?.resolve(context);
  }

  protected abstract doResolve(
    context: TokenResolutionContext,
  ): string | undefined;
}

export class ExplicitOptionTokenResolver extends BaseTokenResolver {
  protected doResolve(context: TokenResolutionContext): string | undefined {
    return context.explicitApiKey;
  }
}

export class ModelMetadataApiKeyResolver extends BaseTokenResolver {
  protected doResolve(context: TokenResolutionContext): string | undefined {
    const metadata = context.modelAuth?.metadata as
      Record<string, unknown> | undefined;
    if (!metadata) {
      return undefined;
    }
    const apiKey = metadata.api_key || metadata.apiKey;
    return typeof apiKey === "string" ? apiKey : undefined;
  }
}

export class AuthenticatedAccessTokenResolver extends BaseTokenResolver {
  protected doResolve(context: TokenResolutionContext): string | undefined {
    const auth = context.modelAuth;
    if (!auth || auth.status !== AuthStatusConstant.AUTHENTICATED) {
      return undefined;
    }
    return auth.access_token;
  }
}

export class ModelRegistryApiKeyResolver extends BaseTokenResolver {
  protected doResolve(context: TokenResolutionContext): string | undefined {
    const targetModel = context.modelName || context.modelAuth?.model;
    return modelApiKeyRegistry.getApiKey(targetModel) || context.configApiKey;
  }
}

export class TokenResolutionPipeline {
  private readonly head: TokenResolver;

  constructor() {
    const explicit = new ExplicitOptionTokenResolver();
    const metadata = new ModelMetadataApiKeyResolver();
    const oauth = new AuthenticatedAccessTokenResolver();
    const modelRegistry = new ModelRegistryApiKeyResolver();

    explicit.setNext(metadata).setNext(oauth).setNext(modelRegistry);

    this.head = explicit;
  }

  public resolve(context: TokenResolutionContext): string | undefined {
    return this.head.resolve(context);
  }
}

export const tokenResolutionPipeline = new TokenResolutionPipeline();
