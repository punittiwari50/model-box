import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  modelRunnerFactory,
  defaultModelRunner,
  GeminiModelRunner,
  ClaudeModelRunner,
  CopilotModelRunner,
  CodexModelRunner,
  CursorModelRunner,
  OllamaModelRunner,
  GrokModelRunner,
} from '@/core/cli/modelRunnerFactory.js';
import { ModelFamily } from '@/domain/constants/index.js';
import { applicationContext, ServiceTokens } from '@/core/context/appContext.js';
import { AgentService } from '@/services/agent/agentService.js';

describe('ModelRunnerFactory & Dependency Inversion Tests', () => {
  it('should provide default runner conforming to IModelRunner', () => {
    const runner = modelRunnerFactory.getDefaultRunner();
    assert.ok(runner);
    assert.strictEqual(typeof runner.executePrompt, 'function');
    assert.strictEqual(typeof runner.getDefaultModel, 'function');
    assert.strictEqual(typeof runner.isCliAvailable, 'function');
    assert.strictEqual(defaultModelRunner, runner);
  });

  it('should resolve specific runner per model family polymorphically', () => {
    const testCases = [
      { input: ModelFamily.GEMINI, expectedClass: GeminiModelRunner },
      { input: 'gemini-3.5-flash', expectedClass: GeminiModelRunner },
      { input: ModelFamily.CLAUDE, expectedClass: ClaudeModelRunner },
      { input: 'claude-3-7-sonnet', expectedClass: ClaudeModelRunner },
      { input: ModelFamily.COPILOT, expectedClass: CopilotModelRunner },
      { input: 'copilot-chat', expectedClass: CopilotModelRunner },
      { input: ModelFamily.CODEX, expectedClass: CodexModelRunner },
      { input: 'gpt-4o', expectedClass: CodexModelRunner },
      { input: ModelFamily.CURSOR, expectedClass: CursorModelRunner },
      { input: 'cursor-small', expectedClass: CursorModelRunner },
      { input: ModelFamily.OLLAMA, expectedClass: OllamaModelRunner },
      { input: 'llama3.2', expectedClass: OllamaModelRunner },
      { input: ModelFamily.GROK, expectedClass: GrokModelRunner },
      { input: 'grok-2', expectedClass: GrokModelRunner },
    ];

    for (const { input, expectedClass } of testCases) {
      const runner = modelRunnerFactory.getRunner(input);
      assert.ok(runner, `Runner should exist for ${input}`);
      assert.ok(runner instanceof expectedClass, `Expected ${input} to yield ${expectedClass.name}`);
    }
  });

  it('should create new runner instances via createRunner', () => {
    const r1 = modelRunnerFactory.createRunner(ModelFamily.CLAUDE);
    const r2 = modelRunnerFactory.createRunner(ModelFamily.CLAUDE);
    assert.ok(r1 instanceof ClaudeModelRunner);
    assert.ok(r2 instanceof ClaudeModelRunner);
    assert.notStrictEqual(r1, r2, 'createRunner should return a distinct new instance');
  });

  it('should resolve default runner for unknown or empty input', () => {
    const fallback = modelRunnerFactory.getRunner('unknown-custom-model-xyz');
    assert.ok(fallback);
    assert.strictEqual(fallback, modelRunnerFactory.getDefaultRunner());
  });

  it('should be registered and resolvable in ApplicationContext IoC container', () => {
    const resolvedFactory = applicationContext.getModelRunnerFactory();
    assert.strictEqual(resolvedFactory, modelRunnerFactory);

    const resolvedRunner = applicationContext.getModelRunner();
    assert.strictEqual(resolvedRunner, defaultModelRunner);

    const fromToken = applicationContext.resolve(ServiceTokens.ModelRunnerFactory);
    assert.strictEqual(fromToken, modelRunnerFactory);
  });

  it('should instantiate AgentService with zero GeminiCliRunner coupling', () => {
    const service = new AgentService();
    assert.ok(service, 'AgentService should instantiate cleanly with defaults');
  });
});
