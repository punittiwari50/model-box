import { environment } from '@/core/config/environment.js';
import {
  ModelCatalog,
  ModelFamily,
  GEMINI_MODELS,
  CLAUDE_MODELS,
  OPENAI_MODELS,
  COPILOT_MODELS,
} from '@/domain/constants/index.js';

export interface IModelApiKeyProvider {
  readonly providerId: string;
  supports(model: string): boolean;
  resolveApiKey(): string | undefined;
}

/**
 * Base abstract API key provider for model families.
 * Checks application.yml configuration keys first before environment variable fallbacks.
 * Conforms to STD-COD-002, STD-COD-005.
 */
export abstract class BaseFamilyApiKeyProvider implements IModelApiKeyProvider {
  constructor(
    public readonly providerId: string,
    protected readonly supportedModels: ReadonlySet<string>,
    protected readonly envVarNames: readonly string[]
  ) {}

  public supports(model: string): boolean {
    return this.supportedModels.has(model.toLowerCase());
  }

  public resolveApiKey(): string | undefined {
    for (const varName of this.envVarNames) {
      const val = environment.getProperty(varName);
      if (val && val.trim().length > 0) {
        return val.trim();
      }
    }
    return undefined;
  }
}

export class GoogleModelApiKeyProvider extends BaseFamilyApiKeyProvider {
  constructor() {
    super(
      ModelFamily.GOOGLE,
      new Set([ModelFamily.GOOGLE, ModelFamily.GEMINI, ModelCatalog.DEFAULT, ...GEMINI_MODELS]),
      [
        'models.gemini.apiKey',
        'model.gemini.apiKey',
        'models.google.apiKey',
        'model.google.apiKey',
        'model.apiKey',
        'models.default.apiKey',
        'GEMINI_API_KEY',
        'GOOGLE_API_KEY',
      ]
    );
  }
}

export class AnthropicModelApiKeyProvider extends BaseFamilyApiKeyProvider {
  constructor() {
    super(
      ModelFamily.ANTHROPIC,
      new Set([ModelFamily.ANTHROPIC, ModelFamily.CLAUDE, ...CLAUDE_MODELS]),
      [
        'models.claude.apiKey',
        'model.claude.apiKey',
        'models.anthropic.apiKey',
        'ANTHROPIC_API_KEY',
        'CLAUDE_API_KEY',
      ]
    );
  }
}

export class OpenAiModelApiKeyProvider extends BaseFamilyApiKeyProvider {
  constructor() {
    super(
      ModelFamily.OPENAI,
      new Set([ModelFamily.OPENAI, ModelFamily.CODEX, ...OPENAI_MODELS]),
      [
        'models.codex.apiKey',
        'model.codex.apiKey',
        'models.openai.apiKey',
        'OPENAI_API_KEY',
        'CODEX_API_KEY',
      ]
    );
  }
}

export class CursorModelApiKeyProvider extends BaseFamilyApiKeyProvider {
  constructor() {
    super(
      ModelFamily.CURSOR,
      new Set([ModelFamily.CURSOR, 'cursor-default', 'cursor-fast']),
      [
        'models.cursor.apiKey',
        'model.cursor.apiKey',
        'CURSOR_API_KEY',
      ]
    );
  }
}

export class CopilotModelApiKeyProvider extends BaseFamilyApiKeyProvider {
  constructor() {
    super(
      ModelFamily.COPILOT,
      new Set([ModelFamily.COPILOT, ...COPILOT_MODELS]),
      [
        'models.copilot.apiKey',
        'model.copilot.apiKey',
        'COPILOT_API_KEY',
        'GITHUB_TOKEN',
        'GH_TOKEN',
      ]
    );
  }
}

export class GenericModelApiKeyProvider extends BaseFamilyApiKeyProvider {
  constructor() {
    super(
      ModelFamily.GENERIC,
      new Set(),
      ['models.default.apiKey', 'model.apiKey', 'MODEL_API_KEY', 'API_KEY']
    );
  }

  public override supports(): boolean {
    return true;
  }
}

export class ModelApiKeyRegistry {
  private readonly providers: IModelApiKeyProvider[] = [];
  private readonly fallbackProvider: IModelApiKeyProvider;

  constructor() {
    this.fallbackProvider = new GenericModelApiKeyProvider();
    this.register(new GoogleModelApiKeyProvider());
    this.register(new AnthropicModelApiKeyProvider());
    this.register(new OpenAiModelApiKeyProvider());
    this.register(new CursorModelApiKeyProvider());
    this.register(new CopilotModelApiKeyProvider());
    this.register(this.fallbackProvider);
  }

  public register(provider: IModelApiKeyProvider): void {
    this.providers.push(provider);
  }

  public getApiKey(model: string = ModelCatalog.DEFAULT): string | undefined {
    const matched = this.providers.find((p) => p.supports(model));
    return matched?.resolveApiKey() || this.fallbackProvider.resolveApiKey();
  }
}

export const modelApiKeyRegistry = new ModelApiKeyRegistry();
