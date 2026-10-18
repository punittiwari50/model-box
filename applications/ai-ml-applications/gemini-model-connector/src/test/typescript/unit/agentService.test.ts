import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AgentService } from '@/services/agent/agentService.js';
import { AgentRepository } from '@/repositories/agentRepository.js';
import type { IModelRunner } from '@/core/cli/modelRunnerInterface.js';
import { AgentStatusConstant } from '@/domain/constants/index.js';

describe('Autonomous Agent Service & Repository', () => {
  let mockRunner: IModelRunner;
  let service: AgentService;

  beforeEach(() => {
    mockRunner = {
      getDefaultModel: () => 'gemini-3.8-flash',
      isMockAllowed: () => true,
      executePrompt: async (options) => ({
        content: `Agent response for: ${options.prompt}`,
        raw_output: '',
        stderr: '',
        exit_code: 0,
        latency_ms: 10,
        model: options.model || 'gemini-3.8-flash',
        runner_type: 'cli',
        prompt_tokens: 25,
        completion_tokens: 50,
        total_tokens: 75,
        tier: 'paid',
      }),
      executeApi: async () => ({ content: '', raw_output: '', stderr: '', exit_code: 0, latency_ms: 0, model: 'm', runner_type: 'api' }),
      executeCli: async () => ({ content: '', raw_output: '', stderr: '', exit_code: 0, latency_ms: 0, model: 'm', runner_type: 'cli' }),
      executeMock: async () => ({ content: '', raw_output: '', stderr: '', exit_code: 0, latency_ms: 0, model: 'm', runner_type: 'mock' }),
      executeFallback: async () => ({ content: '', raw_output: '', stderr: '', exit_code: 0, latency_ms: 0, model: 'm', runner_type: 'api' }),
    };

    service = new AgentService(
      new AgentRepository(),
      undefined as any,
      undefined as any,
      mockRunner
    );
  });

  it('should successfully execute an autonomous agent task and persist steps', async () => {
    const execution = await service.executeTask({
      agent_name: 'TestCoderAgent',
      task: 'Analyze repository architecture and suggest improvements',
      approval_mode: 'auto_edit',
      sandbox: true,
      skills: ['code_review', 'refactoring'],
    });

    assert.ok(execution.id, 'Agent execution should have an ID');
    assert.strictEqual(execution.agent_name, 'TestCoderAgent');
    assert.strictEqual(execution.status, AgentStatusConstant.COMPLETED);
    assert.ok(execution.result?.includes('Analyze repository architecture'));
    assert.strictEqual(execution.approval_mode, 'auto_edit');
    assert.strictEqual(execution.total_tokens, 75);

    const detailed = await service.getExecution(execution.id);
    assert.ok(detailed, 'Execution should be retrievable with steps');
    assert.strictEqual(detailed.execution.id, execution.id);
    assert.ok(detailed.steps.length >= 1, 'At least one step should be recorded');
    assert.strictEqual(detailed.steps[0].step_type, 'OUTPUT');
  });

  it('should list past agent executions in descending order', async () => {
    const list = await service.listExecutions(10, 0);
    assert.ok(Array.isArray(list));
  });

  it('should handle skill listing gracefully', async () => {
    const result = await service.listSkills();
    assert.ok(result);
    assert.strictEqual(typeof result.count, 'number');
    assert.ok(Array.isArray(result.skills));
  });

  it('should execute task within AGENTS/<project> workspace and persist action file', async () => {
    const execution = await service.executeTask({
      agent_name: 'ProjectAgent',
      project: 'ecommerce-suite',
      task: 'Generate checkout microservice skeleton',
    });

    assert.strictEqual(execution.project, 'ecommerce-suite');
    assert.strictEqual(execution.status, AgentStatusConstant.COMPLETED);
    assert.strictEqual(execution.metadata?.project, 'ecommerce-suite');
    assert.ok(execution.metadata?.project_dir?.includes('ecommerce-suite'));
  });

  it('should execute agent mode across all 7 models: ollama, gemini, grok, copilot, codex, cursor, claude', async () => {
    const modelsToTest = [
      { model: 'gemini-3.8-flash', expectedFamily: 'gemini', expectedTool: 'gemini-cli-agent' },
      { model: 'tinyllama', expectedFamily: 'ollama', expectedTool: 'ollama-local-agent' },
      { model: 'grok-3', expectedFamily: 'grok', expectedTool: 'grok-xai-agent' },
      { model: 'copilot-chat', expectedFamily: 'copilot', expectedTool: 'copilot-workspace-agent' },
      { model: 'gpt-4o', expectedFamily: 'codex', expectedTool: 'codex-openai-agent' },
      { model: 'cursor-default', expectedFamily: 'cursor', expectedTool: 'cursor-ide-agent' },
      { model: 'claude-3-7-sonnet', expectedFamily: 'claude', expectedTool: 'claude-anthropic-agent' },
    ];

    for (const item of modelsToTest) {
      const execution = await service.executeTask({
        model: item.model,
        project: `test-${item.expectedFamily}`,
        task: `Build automated pipeline for ${item.expectedFamily}`,
      });

      assert.strictEqual(execution.status, AgentStatusConstant.COMPLETED);
      assert.strictEqual(execution.metadata?.strategy, item.expectedFamily);
      assert.strictEqual(execution.metadata?.tool_name, item.expectedTool);

      const detailed = await service.getExecution(execution.id);
      assert.ok(detailed);
      assert.strictEqual(detailed.steps[0].tool_name, item.expectedTool);
      assert.strictEqual(detailed.steps[0].metadata?.strategy, item.expectedFamily);

      const modelSkills = await service.listSkills(item.model);
      assert.ok(modelSkills.count > 0, `Skills should exist for ${item.model}`);
    }
  });
});
