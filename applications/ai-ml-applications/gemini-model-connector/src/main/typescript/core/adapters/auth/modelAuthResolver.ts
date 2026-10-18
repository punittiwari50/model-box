import type { ModelAuth } from '@/domain/index.js';
import type { IAuthRepository } from '@/repositories/authRepository.js';
import { authRepo as defaultAuthRepo } from '@/repositories/authRepository.js';
import { ModelCatalog, AuthStatusConstant } from '@/domain/constants/index.js';

export interface IModelAuthStrategy {
  resolve(modelName: string): Promise<ModelAuth | null>;
}

export class ExactModelAuthStrategy implements IModelAuthStrategy {
  constructor(private readonly repo: IAuthRepository) {}

  public async resolve(modelName: string): Promise<ModelAuth | null> {
    const auth = await this.repo.getModelAuth(modelName);
    return auth && auth.status === AuthStatusConstant.AUTHENTICATED ? auth : null;
  }
}

export class DefaultModelAuthStrategy implements IModelAuthStrategy {
  constructor(private readonly repo: IAuthRepository) {}

  public async resolve(): Promise<ModelAuth | null> {
    const auth = await this.repo.getModelAuth(ModelCatalog.DEFAULT);
    return auth && auth.status === AuthStatusConstant.AUTHENTICATED ? auth : null;
  }
}

export class FallbackModelAuthStrategy implements IModelAuthStrategy {
  constructor(private readonly repo: IAuthRepository) {}

  public async resolve(modelName: string): Promise<ModelAuth | null> {
    const specific = await this.repo.getModelAuth(modelName);
    if (specific) {
      return specific;
    }
    return this.repo.getModelAuth(ModelCatalog.DEFAULT);
  }
}

/**
 * Composite Model Authentication Resolver using Strategy Pipeline (STD-COD-005).
 * Eliminates nested if-else ladders and cognitive branching.
 */
export class ModelAuthResolver {
  private readonly strategies: IModelAuthStrategy[];

  constructor(repo: IAuthRepository = defaultAuthRepo) {
    this.strategies = [
      new ExactModelAuthStrategy(repo),
      new DefaultModelAuthStrategy(repo),
      new FallbackModelAuthStrategy(repo),
    ];
  }

  public async getEffectiveModelAuth(modelName: string): Promise<ModelAuth | null> {
    for (const strategy of this.strategies) {
      const result = await strategy.resolve(modelName);
      if (result) {
        return result;
      }
    }
    return null;
  }
}

export const modelAuthResolver = new ModelAuthResolver();
