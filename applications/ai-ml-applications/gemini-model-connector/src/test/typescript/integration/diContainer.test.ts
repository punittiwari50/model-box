import { describe, it } from 'node:test';
import assert from 'node:assert';
import { container, ServiceTokens, AppContainer, ApplicationContext } from '@/core/context/appContext.js';
import type { IModelRunner } from '@/core/cli/modelRunnerInterface.js';

describe('Dependency Injection Container (IoC & Loose Coupling)', () => {
  it('should resolve default singletons and services', () => {
    const runner = container.getModelRunner();
    const convService = container.getConversationService();
    const authService = container.getAuthService();
    const convRepo = container.getConversationRepository();

    assert.ok(runner);
    assert.ok(convService);
    assert.ok(authService);
    assert.ok(convRepo);
    assert.ok(container.getAgentService());
    assert.ok(container.getAgentRepository());
  });

  it('should cache resolved instances as singletons', () => {
    const c = new AppContainer();
    const instance1 = c.getConversationService();
    const instance2 = c.getConversationService();

    assert.strictEqual(instance1, instance2, 'Multiple resolve calls should return the same singleton instance');
  });

  it('should allow overriding services with mock implementations for testing', () => {
    const c = new AppContainer();

    const mockRunner: IModelRunner = {
      getDefaultModel: () => 'mock-runner-model',
      isMockAllowed: () => true,
      executePrompt: async () => ({ content: 'mock', raw_output: '', stderr: '', exit_code: 0, latency_ms: 1, model: 'mock', runner_type: 'mock' }),
      executeApi: async () => ({ content: 'mock', raw_output: '', stderr: '', exit_code: 0, latency_ms: 1, model: 'mock', runner_type: 'mock' }),
      executeCli: async () => ({ content: 'mock', raw_output: '', stderr: '', exit_code: 0, latency_ms: 1, model: 'mock', runner_type: 'mock' }),
      executeMock: async () => ({ content: 'mock', raw_output: '', stderr: '', exit_code: 0, latency_ms: 1, model: 'mock', runner_type: 'mock' }),
      executeFallback: async () => ({ content: 'mock', raw_output: '', stderr: '', exit_code: 0, latency_ms: 1, model: 'mock', runner_type: 'mock' }),
    };

    c.register(ServiceTokens.ModelRunner, () => mockRunner);

    const resolved = c.getModelRunner();
    assert.strictEqual(resolved.getDefaultModel(), 'mock-runner-model');
  });

  it('should support direct ApplicationContext resolution from context/appContext.js', () => {
    const ctx = new ApplicationContext();
    assert.ok(ctx.getConversationService());
    assert.ok(ctx.getAuthService());
    assert.ok(ctx.getModelRunner());
  });
});

