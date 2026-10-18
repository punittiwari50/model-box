import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  oauthProviderRegistry,
  OllamaOAuthProvider,
} from '@/core/adapters/auth/oauth/index.js';
import {
  cliCommandStrategyRegistry,
  OllamaCliStrategy,
} from '@/core/cli/cliCommandStrategy.js';
import {
  AuthProviderId,
  ModelFamily,
  ModelCatalog,
  isFallbackModel,
  isOllamaModel,
} from '@/domain/constants/index.js';
import { config } from '@/core/config/index.js';
import { promptRepo } from '@/repositories/promptRepository.js';

describe('Fallback Model Architecture & Multi-Model Tier Governance', () => {
  it('should identify fallback models correctly via isFallbackModel and isOllamaModel', () => {
    assert.strictEqual(isFallbackModel(ModelCatalog.TINYLLAMA), true);
    assert.strictEqual(isFallbackModel('tinyllama:latest'), true);
    assert.strictEqual(isFallbackModel(ModelCatalog.LLAMA_3_2), true);
    assert.strictEqual(isFallbackModel(ModelCatalog.PHI_4), true);
    assert.strictEqual(isFallbackModel('ollama/custom-model'), true);
    assert.strictEqual(isFallbackModel(ModelCatalog.GEMINI_3_8_FLASH), false);

    assert.strictEqual(isOllamaModel(ModelCatalog.TINYLLAMA), true);
    assert.strictEqual(isOllamaModel(ModelCatalog.GEMINI_3_8_FLASH), false);
  });

  it('should return distinct per-model email and account name across models', () => {
    const geminiEmail = config.getAccountEmail('gemini');
    const ollamaEmail = config.getAccountEmail('ollama');
    const claudeEmail = config.getAccountEmail('claude');

    assert.ok(geminiEmail.includes('@'));
    assert.ok(ollamaEmail.includes('@'));
    assert.ok(claudeEmail.includes('@'));
    assert.notStrictEqual(geminiEmail, ollamaEmail);
  });

  it('should correctly identify paid vs freeware tier per model', () => {
    assert.strictEqual(config.getModelTier('tinyllama'), 'freeware');
    assert.strictEqual(config.getModelTier('ollama'), 'freeware');
    assert.strictEqual(config.getModelTier('gemini-3.8-flash'), 'paid');
    assert.strictEqual(config.getModelTier('claude-3-7-sonnet'), 'paid');
    assert.strictEqual(config.getModelTier('gpt-4o'), 'paid');
  });

  it('should resolve OllamaOAuthProvider for Ollama models', () => {
    const provider = oauthProviderRegistry.getProvider('tinyllama');
    assert.strictEqual(provider.providerId, AuthProviderId.OLLAMA);
    assert.ok(provider instanceof OllamaOAuthProvider);
  });

  it('should resolve OllamaCliStrategy from registry for Ollama models', () => {
    const strategy = cliCommandStrategyRegistry.resolve('tinyllama');
    assert.strictEqual(strategy.family, ModelFamily.OLLAMA);
    assert.ok(strategy instanceof OllamaCliStrategy);

    const args = strategy.buildCommandArgs('ollama', 'tinyllama', 'Hello', {} as any);
    assert.deepStrictEqual(args, ['run', 'tinyllama', 'Hello']);
  });

  it('should format environment correctly for Ollama CLI execution', () => {
    const strategy = cliCommandStrategyRegistry.resolve('tinyllama');
    const env = strategy.prepareEnvironment({ PATH: '/usr/bin' });
    assert.ok(env.OLLAMA_HOST);
  });

  it('should exchange tokens using model-specific account from YAML configuration', async () => {
    const provider = new OllamaOAuthProvider();
    const tokenResult = await (provider as any).exchangeTokens('dummy-code');
    assert.strictEqual(tokenResult.accountEmail, config.getAccountEmail('ollama'));
    assert.strictEqual(tokenResult.accountName, config.getAccountName('ollama'));
  });

  it('should persist and retrieve prompt templates via promptRepository', async () => {
    const prompt = await promptRepo.savePrompt({
      prompt_key: 'TEST_PROMPT_KEY',
      prompt_type: 'TEST_TYPE',
      content: 'Test content with {{resume}}',
      description: 'Test description',
    });
    assert.ok(prompt.id);
    assert.strictEqual(prompt.prompt_key, 'TEST_PROMPT_KEY');

    const fetched = await promptRepo.getPromptByKey('TEST_PROMPT_KEY');
    assert.ok(fetched);
    assert.strictEqual(fetched?.content, 'Test content with {{resume}}');
  });
});
