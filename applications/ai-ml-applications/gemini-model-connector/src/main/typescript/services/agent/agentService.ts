import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type {
  AgentExecution,
  AgentStep,
  CreateAgentExecutionRequest,
} from "@/domain/dto/agent.dto.js";
import {
  agentRepository,
  type AgentRepository,
} from "@/repositories/agentRepository.js";
import {
  auditRepo,
  type AuditRepository,
} from "@/repositories/auditRepository.js";
import {
  subscriptionManager,
  type SubscriptionManager,
} from "@/core/subscription/subscriptionManager.js";
import { config } from "@/core/config/index.js";
import { logger } from "@/core/observability/logging/logger.js";
import {
  AgentStatusConstant,
  AgentApprovalModeConstant,
} from "@/domain/constants/index.js";
import type { IModelRunner } from "@/core/cli/modelRunnerInterface.js";
import {
  modelRunnerFactory,
  type IModelRunnerFactory,
} from "@/core/cli/modelRunnerFactory.js";
import {
  agentStrategyRegistry,
  type AgentStrategyRegistry,
} from "@/services/agent/agentStrategies.js";

export interface IAgentService {
  executeTask(
    request: CreateAgentExecutionRequest,
    clientIp?: string,
  ): Promise<AgentExecution>;
  getExecution(
    id: string,
  ): Promise<{ execution: AgentExecution; steps: AgentStep[] } | null>;
  listExecutions(limit?: number, offset?: number): Promise<AgentExecution[]>;
  cancelExecution(id: string, clientIp?: string): Promise<boolean>;
  listSkills(model?: string): Promise<{ skills: string[]; count: number }>;
}

export class AgentService implements IAgentService {
  private readonly repo: AgentRepository;
  private readonly audit: AuditRepository;
  private readonly subMgr: SubscriptionManager;
  private readonly runnerFactory: IModelRunnerFactory;

  constructor(
    repo: AgentRepository = agentRepository,
    audit: AuditRepository = auditRepo,
    subMgr: SubscriptionManager = subscriptionManager,
    runnerOrFactory: IModelRunner | IModelRunnerFactory = modelRunnerFactory,
  ) {
    this.repo = repo;
    this.audit = audit;
    this.subMgr = subMgr;
    if ("getRunner" in runnerOrFactory) {
      this.runnerFactory = runnerOrFactory;
    } else {
      this.runnerFactory = {
        getRunner: () => runnerOrFactory,
        getDefaultRunner: () => runnerOrFactory,
        createRunner: () => runnerOrFactory,
      };
    }
  }

  public async executeTask(
    request: CreateAgentExecutionRequest,
    clientIp = "127.0.0.1",
  ): Promise<AgentExecution> {
    const startTime = performance.now();
    const model = request.model || config.defaultModel;
    const approvalMode =
      request.approval_mode || AgentApprovalModeConstant.DEFAULT;
    const sandbox = request.sandbox ?? true;
    const projectName =
      request.project || (request.metadata?.project as string) || "default";
    const projectDir = this.resolveProjectWorkspace(projectName);

    const routingDecision = this.subMgr.evaluateRouting(
      model,
      Boolean(config.apiKey),
      0,
      false,
      request.subscription_policy,
    );

    const strategy = agentStrategyRegistry.resolve(routingDecision.targetModel);
    const agentName = request.agent_name || strategy.getDefaultAgentName();
    const toolName = strategy.getToolName();
    const agentCtx = {
      agentName,
      project: projectName,
      projectDir,
      approvalMode,
      skills: request.skills || [],
      sandbox,
    };
    const systemInstruction = strategy.formatSystemInstruction(agentCtx);
    const agentPrompt = strategy.formatPrompt(request.task, agentCtx);

    const execution = await this.repo.saveExecution({
      agent_name: agentName,
      project: projectName,
      task: request.task,
      model: routingDecision.targetModel,
      approval_mode: approvalMode,
      sandbox,
      status: AgentStatusConstant.RUNNING,
      skills: request.skills || [...strategy.getSupportedSkills()],
      subscription_tier: routingDecision.executedTier,
      metadata: {
        ...request.metadata,
        project: projectName,
        project_dir: projectDir,
        client_ip: clientIp,
        strategy: strategy.family,
        tool_name: toolName,
        subscription_policy: routingDecision.policy,
        switched_tier: routingDecision.switchedTier,
      },
    });

    await this.audit.logEvent({
      action: "AGENT_TASK_START",
      client_ip: clientIp,
      model_used: routingDecision.targetModel,
      status: "SUCCESS",
      details: {
        agent_id: execution.id,
        agent_name: agentName,
        project: projectName,
        task: request.task,
        step: "INITIATED",
        tool: toolName,
      },
    });

    try {
      const runner = this.runnerFactory.getRunner(routingDecision.targetModel);
      const cliResult = await runner.executePrompt({
        prompt: agentPrompt,
        model: routingDecision.targetModel,
        subscriptionPolicy: routingDecision.policy,
        cwd: projectDir,
        systemInstruction,
      });

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
      await this.repo.saveStep({
        agent_id: execution.id,
        step_number: 1,
        step_type: "OUTPUT",
        content: cliResult.content,
        tool_name: toolName,
        status: "SUCCESS",
        metadata: {
          latency_ms: cliResult.latency_ms,
          model: cliResult.model,
          project_dir: projectDir,
          strategy: strategy.family,
        },
      });

      this.persistAgentActionArtifact(projectDir, execution.id, {
        execution_id: execution.id,
        agent_name: agentName,
        project: projectName,
        task: request.task,
        model: cliResult.model,
        strategy: strategy.family,
        tool: toolName,
        result: cliResult.content,
        timestamp: new Date().toISOString(),
      });

      const completed = await this.repo.updateExecution(execution.id, {
        status: AgentStatusConstant.COMPLETED,
        result: cliResult.content,
        prompt_tokens: cliResult.prompt_tokens,
        completion_tokens: cliResult.completion_tokens,
        total_tokens: cliResult.total_tokens,
        latency_ms: latencyMs,
      });

      await this.audit.logEvent({
        action: "AGENT_TASK_COMPLETED",
        client_ip: clientIp,
        model_used: cliResult.model,
        prompt_tokens: cliResult.prompt_tokens,
        completion_tokens: cliResult.completion_tokens,
        latency_ms: latencyMs,
        status: "SUCCESS",
        details: {
          agent_id: execution.id,
          project: projectName,
          tier: cliResult.tier,
        },
      });

      return completed;
    } catch (err: any) {
      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
      const failed = await this.repo.updateExecution(execution.id, {
        status: AgentStatusConstant.FAILED,
        error_message: err.message,
        latency_ms: latencyMs,
      });

      await this.audit.logEvent({
        action: "AGENT_TASK_FAILED",
        client_ip: clientIp,
        model_used: routingDecision.targetModel,
        latency_ms: latencyMs,
        status: "FAILED",
        error_message: err.message,
        details: { agent_id: execution.id },
      });

      return failed;
    }
  }

  public async getExecution(
    id: string,
  ): Promise<{ execution: AgentExecution; steps: AgentStep[] } | null> {
    const execution = await this.repo.getExecution(id);
    if (!execution) return null;
    const steps = await this.repo.getSteps(id);
    return { execution, steps };
  }

  public async listExecutions(
    limit = 50,
    offset = 0,
  ): Promise<AgentExecution[]> {
    return this.repo.listExecutions(limit, offset);
  }

  public async cancelExecution(
    id: string,
    clientIp = "127.0.0.1",
  ): Promise<boolean> {
    const execution = await this.repo.getExecution(id);
    if (!execution || execution.status !== AgentStatusConstant.RUNNING) {
      return false;
    }
    await this.repo.updateExecution(id, {
      status: AgentStatusConstant.CANCELLED,
    });
    await this.audit.logEvent({
      action: "AGENT_TASK_CANCELLED",
      client_ip: clientIp,
      status: "SUCCESS",
      details: { agent_id: id, step: "CANCELLED" },
    });
    return true;
  }

  public async listSkills(
    model?: string,
  ): Promise<{ skills: string[]; count: number }> {
    const strategySkills = agentStrategyRegistry.getAllSkills(model);
    if (strategySkills.length > 0 && model) {
      return { skills: [...strategySkills], count: strategySkills.length };
    }

    return new Promise((resolve) => {
      const cliBin = config.geminiCliCommand || "gemini";
      const proc = spawn(cliBin, ["skills", "list"], { env: process.env });
      let stdout = "";

      proc.stdout?.on("data", (d) => {
        stdout += d.toString();
      });
      proc.on("close", () => {
        const lines = stdout
          .split("\n")
          .map((l) => l.trim())
          .filter(
            (l) =>
              l &&
              !l.includes("No skills discovered") &&
              !l.includes("falling back"),
          );
        const combined = Array.from(new Set([...lines, ...strategySkills]));
        resolve({ skills: combined, count: combined.length });
      });
      proc.on("error", () => {
        resolve({ skills: [...strategySkills], count: strategySkills.length });
      });
    });
  }

  private resolveProjectWorkspace(projectName: string): string {
    const sanitized = (projectName || "default").replace(
      /[^a-zA-Z0-9_\-\.]/g,
      "_",
    );
    const projectDir = path.resolve(config.agentsDir, sanitized);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    return projectDir;
  }

  private persistAgentActionArtifact(
    projectDir: string,
    executionId: string,
    payload: Record<string, any>,
  ): void {
    try {
      const artifactPath = path.join(projectDir, `action_${executionId}.json`);
      fs.writeFileSync(artifactPath, JSON.stringify(payload, null, 2), "utf-8");
      logger.info(
        "AGENT_WORKSPACE",
        `Persisted agent action artifact at: ${artifactPath}`,
      );
    } catch (err: any) {
      logger.warn(
        "AGENT_WORKSPACE",
        `Failed to persist action artifact: ${err.message}`,
      );
    }
  }
}

export const agentService = new AgentService();
