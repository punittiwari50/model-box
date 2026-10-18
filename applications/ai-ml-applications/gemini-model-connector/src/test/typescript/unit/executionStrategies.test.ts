import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MockExecutionStrategy,
  AutoExecutionStrategy,
  ExecutionStrategyRegistry,
} from '@/core/cli/executionStrategies.js';
import type { IModelRunner, ExecutePromptOptions } from '@/core/cli/modelRunnerInterface.js';
import type { CliExecutionResult } from '@/domain/index.js';

class StubModelRunner implements IModelRunner {
  public mockAllowed = true;
  public apiCalled = false;
  public cliCalled = false;
  public mockCalled = false;

  public getDefaultModel(): string {
    return 'gemini-3.8-flash';
  }

  public isMockAllowed(): boolean {
    return this.mockAllowed;
  }

  public async executeMock(options: ExecutePromptOptions): Promise<CliExecutionResult> {
    this.mockCalled = true;
    return {
      content: 'mock result',
      raw_output: '{}',
      stderr: '',
      exit_code: 0,
      latency_ms: 5,
      model: options.model || this.getDefaultModel(),
      runner_type: 'mock',
    };
  }

  public async executeApi(options: ExecutePromptOptions): Promise<CliExecutionResult> {
    this.apiCalled = true;
    return {
      content: 'api result',
      raw_output: '{}',
      stderr: '',
      exit_code: 0,
      latency_ms: 10,
      model: options.model || this.getDefaultModel(),
      runner_type: 'api',
    };
  }

  public async executeCli(options: ExecutePromptOptions): Promise<CliExecutionResult> {
    this.cliCalled = true;
    return {
      content: 'cli result',
      raw_output: '{}',
      stderr: '',
      exit_code: 0,
      latency_ms: 20,
      model: options.model || this.getDefaultModel(),
      runner_type: 'cli',
    };
  }

  public async executePrompt(options: ExecutePromptOptions): Promise<CliExecutionResult> {
    return this.executeMock(options);
  }

  public async executeFallback(options: ExecutePromptOptions): Promise<CliExecutionResult> {
    return this.executeMock(options);
  }
}

describe('ExecutionStrategy Pattern with IModelRunner DI', () => {
  it('should execute MockExecutionStrategy via IModelRunner', async () => {
    const runner = new StubModelRunner();
    const strategy = new MockExecutionStrategy();
    const result = await strategy.execute(runner, { prompt: 'test' }, Date.now());

    assert.strictEqual(runner.mockCalled, true);
    assert.strictEqual(result.runner_type, 'mock');
  });

  it('should throw error in MockExecutionStrategy when mock is disallowed', async () => {
    const runner = new StubModelRunner();
    runner.mockAllowed = false;
    const strategy = new MockExecutionStrategy();

    await assert.rejects(
      async () => strategy.execute(runner, { prompt: 'test' }, Date.now()),
      /Mock responses are disabled/
    );
  });

  it('should dispatch to API in AutoExecutionStrategy when effective token is provided', async () => {
    const runner = new StubModelRunner();
    const strategy = new AutoExecutionStrategy();
    const result = await strategy.execute(
      runner,
      { prompt: 'test' },
      Date.now(),
      'test-token-123'
    );

    assert.strictEqual(runner.apiCalled, true);
    assert.strictEqual(result.runner_type, 'api');
  });

  it('should dispatch to CLI in AutoExecutionStrategy when no token is present', async () => {
    const runner = new StubModelRunner();
    const strategy = new AutoExecutionStrategy();
    const result = await strategy.execute(runner, { prompt: 'test' }, Date.now(), undefined);

    assert.strictEqual(runner.cliCalled, true);
    assert.strictEqual(result.runner_type, 'cli');
  });

  it('should resolve strategies by mode key from ExecutionStrategyRegistry', () => {
    const registry = new ExecutionStrategyRegistry();
    const mockStrategy = registry.get('mock');
    const autoStrategy = registry.get('unrecognized');

    assert.ok(mockStrategy instanceof MockExecutionStrategy);
    assert.ok(autoStrategy instanceof AutoExecutionStrategy);
  });
});
