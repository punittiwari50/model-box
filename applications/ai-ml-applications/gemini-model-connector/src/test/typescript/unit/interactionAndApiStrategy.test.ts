import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  interactionStrategyRegistry,
  InteractionMode,
  ConversationInteractionStrategy,
  AgentInteractionStrategy,
} from '@/core/interaction/interactionStrategy.js';
import {
  executionStrategyRegistry,
  WebSocketExecutionStrategy,
  CliExecutionStrategy,
  ApiExecutionStrategy,
  MockExecutionStrategy,
} from '@/core/cli/executionStrategies.js';
import {
  modelApiStrategyRegistry,
  ClaudeApiStrategy,
  CodexApiStrategy,
  CursorApiStrategy,
  GeminiApiStrategy,
  CopilotApiStrategy,
  OllamaApiStrategy,
} from '@/core/api/modelApiStrategy.js';
import {
  DEFAULT_HYPERPARAMETERS,
  resolveHyperparameters,
  ModelProperties,
} from '@/core/config/properties/modelProperties.js';
import { config, environment } from '@/core/config/index.js';
import { ModelFamily } from '@/domain/constants/index.js';

describe('Interaction Mode Strategy Registry (STD-COD-005)', () => {
  test('should resolve ConversationInteractionStrategy for conversation, chat, and dialog in O(1)', () => {
    const convStrategy = interactionStrategyRegistry.resolve(InteractionMode.CONVERSATION);
    assert.ok(convStrategy instanceof ConversationInteractionStrategy);
    assert.strictEqual(convStrategy.mode, InteractionMode.CONVERSATION);

    const chatStrategy = interactionStrategyRegistry.resolve('chat');
    assert.ok(chatStrategy instanceof ConversationInteractionStrategy);

    const dialogStrategy = interactionStrategyRegistry.resolve('dialog');
    assert.ok(dialogStrategy instanceof ConversationInteractionStrategy);
  });

  test('should resolve AgentInteractionStrategy for agent, autonomous, and task in O(1)', () => {
    const agentStrategy = interactionStrategyRegistry.resolve(InteractionMode.AGENT);
    assert.ok(agentStrategy instanceof AgentInteractionStrategy);
    assert.strictEqual(agentStrategy.mode, InteractionMode.AGENT);

    const autoStrategy = interactionStrategyRegistry.resolve('autonomous');
    assert.ok(autoStrategy instanceof AgentInteractionStrategy);

    const taskStrategy = interactionStrategyRegistry.resolve('task');
    assert.ok(taskStrategy instanceof AgentInteractionStrategy);
  });

  test('should fall back to ConversationInteractionStrategy for undefined or unrecognized modes', () => {
    const defaultStrategy = interactionStrategyRegistry.resolve(undefined);
    assert.ok(defaultStrategy instanceof ConversationInteractionStrategy);

    const unknownStrategy = interactionStrategyRegistry.resolve('unrecognized-mode');
    assert.ok(unknownStrategy instanceof ConversationInteractionStrategy);
  });
});

describe('Execution Channel Strategies Registry (CLI, API, WebSocket, Mock)', () => {
  test('should resolve WebSocketExecutionStrategy for websocket and ws', () => {
    const ws1 = executionStrategyRegistry.get('websocket');
    assert.ok(ws1 instanceof WebSocketExecutionStrategy);

    const ws2 = executionStrategyRegistry.get('ws');
    assert.ok(ws2 instanceof WebSocketExecutionStrategy);
  });

  test('should resolve CliExecutionStrategy for cli', () => {
    const cliStrategy = executionStrategyRegistry.get('cli');
    assert.ok(cliStrategy instanceof CliExecutionStrategy);
  });

  test('should resolve ApiExecutionStrategy for api', () => {
    const apiStrategy = executionStrategyRegistry.get('api');
    assert.ok(apiStrategy instanceof ApiExecutionStrategy);
  });

  test('should resolve MockExecutionStrategy for mock', () => {
    const mockStrategy = executionStrategyRegistry.get('mock');
    assert.ok(mockStrategy instanceof MockExecutionStrategy);
  });
});

describe('Model API Strategy Registry (Claude, Codex, Cursor, Gemini, Copilot, Ollama)', () => {
  test('should resolve ClaudeApiStrategy for Claude and Anthropic models', () => {
    const strategy = modelApiStrategyRegistry.resolve('claude-3-7-sonnet');
    assert.ok(strategy instanceof ClaudeApiStrategy);
    assert.strictEqual(strategy.family, ModelFamily.CLAUDE);
  });

  test('should resolve CodexApiStrategy for GPT and Codex models', () => {
    const strategy = modelApiStrategyRegistry.resolve('gpt-4o');
    assert.ok(strategy instanceof CodexApiStrategy);
    assert.strictEqual(strategy.family, ModelFamily.CODEX);

    const strategy2 = modelApiStrategyRegistry.resolve('codex-davinci');
    assert.ok(strategy2 instanceof CodexApiStrategy);
  });

  test('should resolve CursorApiStrategy for Cursor models', () => {
    const strategy = modelApiStrategyRegistry.resolve('cursor-default');
    assert.ok(strategy instanceof CursorApiStrategy);
    assert.strictEqual(strategy.family, ModelFamily.CURSOR);
  });

  test('should resolve GeminiApiStrategy for Gemini and Google models', () => {
    const strategy = modelApiStrategyRegistry.resolve('gemini-3.8-flash');
    assert.ok(strategy instanceof GeminiApiStrategy);
    assert.strictEqual(strategy.family, ModelFamily.GEMINI);
  });

  test('should resolve CopilotApiStrategy for Copilot models', () => {
    const strategy = modelApiStrategyRegistry.resolve('copilot-chat');
    assert.ok(strategy instanceof CopilotApiStrategy);
    assert.strictEqual(strategy.family, ModelFamily.COPILOT);
  });

  test('should resolve OllamaApiStrategy for Ollama and tinyllama fallback models', () => {
    const strategy = modelApiStrategyRegistry.resolve('tinyllama');
    assert.ok(strategy instanceof OllamaApiStrategy);
    assert.strictEqual(strategy.family, ModelFamily.OLLAMA);

    const strategy2 = modelApiStrategyRegistry.resolve('ollama/llama3');
    assert.ok(strategy2 instanceof OllamaApiStrategy);
  });
});

describe('Model Hyperparameters & Cascading Resolution (Requirement #5)', () => {
  test('should share default hyperparameters without repetition', () => {
    assert.strictEqual(DEFAULT_HYPERPARAMETERS.temperature, 0.7);
    assert.strictEqual(DEFAULT_HYPERPARAMETERS.topP, 0.95);
    assert.strictEqual(DEFAULT_HYPERPARAMETERS.maxOutputTokens, 8192);
    assert.strictEqual(DEFAULT_HYPERPARAMETERS.timeoutMs, 120000);
    assert.strictEqual(DEFAULT_HYPERPARAMETERS.allowMockFallback, true);
    assert.strictEqual(DEFAULT_HYPERPARAMETERS.fallbackThresholdPercentage, 90);

    const resolved = resolveHyperparameters();
    assert.deepStrictEqual(resolved, DEFAULT_HYPERPARAMETERS);
  });

  test('should cascade: request body overrides DB overrides subscription overrides default', () => {
    // 1. Subscription only
    const subParams = { temperature: 0.3 };
    const res1 = resolveHyperparameters(subParams);
    assert.strictEqual(res1.temperature, 0.3);
    assert.strictEqual(res1.topP, 0.95); // default preserved

    // 2. DB overrides subscription
    const dbParams = { temperature: 0.5, topP: 0.8 };
    const res2 = resolveHyperparameters(subParams, dbParams);
    assert.strictEqual(res2.temperature, 0.5);
    assert.strictEqual(res2.topP, 0.8);

    // 3. Request body overrides DB and subscription
    const reqBody = { temperature: 0.9, maxOutputTokens: 4096 };
    const res3 = resolveHyperparameters(subParams, dbParams, reqBody);
    assert.strictEqual(res3.temperature, 0.9);
    assert.strictEqual(res3.topP, 0.8);
    assert.strictEqual(res3.maxOutputTokens, 4096);
    assert.strictEqual(res3.timeoutMs, 120000); // default preserved
  });
});

describe('Multi-Subscription Lists per Model Family', () => {
  test('should load lists of paid and freeware subscriptions', () => {
    const props = new ModelProperties(environment);
    const paidGemini = props.getSubscriptions(ModelFamily.GEMINI, 'paid');
    assert.ok(Array.isArray(paidGemini));
    assert.ok(paidGemini.length >= 1);
    assert.strictEqual(paidGemini[0].tier, 'paid');
    assert.ok(paidGemini[0].accountEmail.includes('@'));

    const freeGemini = props.getSubscriptions(ModelFamily.GEMINI, 'freeware');
    assert.ok(Array.isArray(freeGemini));
    assert.strictEqual(freeGemini[0].tier, 'freeware');

    // Cursor family verification
    const paidCursor = props.getSubscriptions(ModelFamily.CURSOR, 'paid');
    assert.ok(paidCursor.length >= 1);
    assert.strictEqual(paidCursor[0].tier, 'paid');

    // Claude family verification
    const paidClaude = props.getSubscriptions(ModelFamily.CLAUDE, 'paid');
    assert.ok(paidClaude.length >= 1);
    assert.strictEqual(paidClaude[0].tier, 'paid');

    // Codex family verification
    const paidCodex = props.getSubscriptions(ModelFamily.CODEX, 'paid');
    assert.ok(paidCodex.length >= 1);
    assert.strictEqual(paidCodex[0].tier, 'paid');
  });

  test('should resolve family key using ModelFamily constants', () => {
    assert.strictEqual(config.resolveFamilyKey('cursor-fast'), ModelFamily.CURSOR);
    assert.strictEqual(config.resolveFamilyKey('claude-3-7-sonnet'), ModelFamily.CLAUDE);
    assert.strictEqual(config.resolveFamilyKey('gpt-4o'), ModelFamily.CODEX);
    assert.strictEqual(config.resolveFamilyKey('copilot-chat'), ModelFamily.COPILOT);
    assert.strictEqual(config.resolveFamilyKey('gemini-3.8-flash'), ModelFamily.GEMINI);
    assert.strictEqual(config.resolveFamilyKey('tinyllama'), ModelFamily.OLLAMA);
  });
});
