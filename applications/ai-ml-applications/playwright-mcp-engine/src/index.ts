import fs from 'node:fs';
import process from 'node:process';
import { Command } from 'commander';

// Fix MaxListenersExceededWarning: elevate default process EventEmitter listener limit for high concurrency
process.setMaxListeners(100);

import { config } from '@/core/config.js';
import { logger } from '@/core/logger.js';
import { BrowserPool } from '@/concurrency/browser-pool.js';
import { CircuitBreakerRegistry } from '@/resilience/circuit-breaker.js';
import { RetryHandler } from '@/resilience/retry-handler.js';
import { ConcurrencyTracker } from '@/resilience/concurrency-tracker.js';
import { WorkflowOrchestrator } from '@/engine/workflow-orchestrator.js';
import { PlaywrightMcpServer } from '@/mcp/server.js';
import { CodeGenerator } from '@/generator/code-generator.js';
import { WorkflowParser } from '@/engine/workflow-parser.js';
import { GoogleXRayService } from '@/xray/xray-service.js';
import type { XRayQueryParams, XRayTargetPlatform } from '@/xray/types.js';
import { WorkflowRecorderService } from '@/recorder/workflow-recorder.js';
import { OllamaWorkflowRevalidator } from '@/recorder/ollama-revalidator.js';
import { EXECUTION_STATUS_NAMES, NETWORK_DEFAULTS } from '@/constants/index.js';

// ============================================================================
// CLI Execution Strategy Pattern (SOLID: SRP, OCP, LSP, ISP, DIP)
// ============================================================================

export interface CliRuntimeContext {
  options: Record<string, unknown>;
  pool: BrowserPool;
  orchestrator: WorkflowOrchestrator;
  tracker: ConcurrencyTracker;
  circuitBreakers: CircuitBreakerRegistry;
  mcpServer: PlaywrightMcpServer;
  xrayService: GoogleXRayService;
  recorderService: WorkflowRecorderService;
  aiRevalidator: OllamaWorkflowRevalidator;
}

export interface ICliModeRunner {
  canHandle(ctx: CliRuntimeContext): boolean;
  run(ctx: CliRuntimeContext): Promise<void>;
}

export class WorkflowCliRunner implements ICliModeRunner {
  canHandle(ctx: CliRuntimeContext): boolean {
    return Boolean(ctx.options.workflow);
  }

  async run(ctx: CliRuntimeContext): Promise<void> {
    try {
      const workflowPath = String(ctx.options.workflow);
      const rawContent = fs.readFileSync(workflowPath, 'utf-8');
      const overrides = ctx.options.vars ? JSON.parse(String(ctx.options.vars)) : {};
      logger.info(`Executing workflow from file: ${workflowPath}`);

      const result = await ctx.orchestrator.execute(rawContent, overrides);
      console.log(JSON.stringify(result, null, 2));

      await ctx.pool.close();
      const isSuccess =
        result.status === EXECUTION_STATUS_NAMES.SUCCESS ||
        result.status === EXECUTION_STATUS_NAMES.RETRIED_SUCCESS;

      const exitActions: Record<string, () => never> = {
        true: () => process.exit(0),
        false: () => process.exit(1),
      };
      exitActions[String(isSuccess)]();
    } catch (err) {
      logger.error('Failed to execute workflow file', err);
      await ctx.pool.close();
      process.exit(1);
    }
  }
}

export class CatalogCliRunner implements ICliModeRunner {
  canHandle(ctx: CliRuntimeContext): boolean {
    return Boolean(ctx.options.catalog);
  }

  async run(ctx: CliRuntimeContext): Promise<void> {
    try {
      const targetUrl = String(ctx.options.catalog);
      logger.info(`Scanning and cataloging endpoints for: ${targetUrl}`);

      const scanWorkflow = {
        id: `catalog-${Date.now()}`,
        name: `Catalog Endpoints for ${targetUrl}`,
        baseUrl: targetUrl,
        steps: [
          { id: 'nav-step', action: 'navigate', targetUrl },
          { id: 'wait-step', action: 'wait_for_timeout', value: 3000 },
        ],
      };

      const result = await ctx.orchestrator.execute(scanWorkflow);
      console.log(
        JSON.stringify(
          {
            targetUrl,
            status: result.status,
            durationMs: result.durationMs,
            networkAuthSummary: result.networkAuthSummary,
          },
          null,
          2
        )
      );

      await ctx.pool.close();
      process.exit(0);
    } catch (err) {
      logger.error('Failed to catalog endpoints', err);
      await ctx.pool.close();
      process.exit(1);
    }
  }
}

export class GenerateCliRunner implements ICliModeRunner {
  canHandle(ctx: CliRuntimeContext): boolean {
    return Boolean(ctx.options.generate);
  }

  async run(ctx: CliRuntimeContext): Promise<void> {
    try {
      const generatePath = String(ctx.options.generate);
      const rawContent = fs.readFileSync(generatePath, 'utf-8');
      const parsed = WorkflowParser.parse(rawContent);
      const code = CodeGenerator.generatePlaywrightTypeScript(parsed);
      console.log(code);

      await ctx.pool.close();
      process.exit(0);
    } catch (err) {
      logger.error('Failed to generate code', err);
      await ctx.pool.close();
      process.exit(1);
    }
  }
}

export class MetricsCliRunner implements ICliModeRunner {
  canHandle(ctx: CliRuntimeContext): boolean {
    return Boolean(ctx.options.metrics);
  }

  async run(ctx: CliRuntimeContext): Promise<void> {
    const metrics = ctx.tracker.getMetricsSnapshot();
    const breakers = ctx.circuitBreakers.getAllStatuses();
    console.log(JSON.stringify({ metrics, circuitBreakers: breakers }, null, 2));
    await ctx.pool.close();
    process.exit(0);
  }
}

export class XRayCliRunner implements ICliModeRunner {
  canHandle(ctx: CliRuntimeContext): boolean {
    return Boolean(ctx.options.xrayPlatform || ctx.options.xrayRole || ctx.options.xraySkills);
  }

  async run(ctx: CliRuntimeContext): Promise<void> {
    try {
      const skills = ctx.options.xraySkills
        ? String(ctx.options.xraySkills).split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const queryParams: XRayQueryParams = {
        platform: (ctx.options.xrayPlatform as XRayTargetPlatform) || 'linkedin',
        role: ctx.options.xrayRole ? String(ctx.options.xrayRole) : undefined,
        skills,
        location: ctx.options.xrayLocation ? String(ctx.options.xrayLocation) : undefined,
        company: ctx.options.xrayCompany ? String(ctx.options.xrayCompany) : undefined,
      };

      const isPreview = Boolean(ctx.options.xrayPreview);

      const executionHandlers: Record<string, () => Promise<unknown>> = {
        true: async () => ctx.xrayService.previewQuery(queryParams),
        false: async () => ctx.xrayService.search(queryParams),
      };

      const result = await executionHandlers[String(isPreview)]();
      console.log(JSON.stringify(result, null, 2));

      await ctx.pool.close();
      process.exit(0);
    } catch (err) {
      logger.error('Failed to execute Google X-Ray query', err);
      await ctx.pool.close();
      process.exit(1);
    }
  }
}

export class RecordCliRunner implements ICliModeRunner {
  canHandle(ctx: CliRuntimeContext): boolean {
    return Boolean(ctx.options.record);
  }

  async run(ctx: CliRuntimeContext): Promise<void> {
    try {
      const targetUrl = String(ctx.options.record);
      logger.info(`Starting interactive workflow recording on ${targetUrl}...`);

      const session = await ctx.recorderService.startRecording(targetUrl);
      console.log(`\n======================================================`);
      console.log(`RECORDING SESSION ACTIVE: ${session.sessionId}`);
      console.log(`Target URL: ${session.targetUrl}`);
      console.log(`Perform your manual workflow in the browser.`);
      console.log(`Waiting for interactions to complete or timeout...`);
      console.log(`======================================================\n`);

      const timeoutMs = Number(ctx.options.recordTimeout || 30000);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          logger.info('Auto-finalizing recording session after timeout window.');
          resolve();
        }, timeoutMs);

        process.stdin.once('data', () => {
          clearTimeout(timer);
          resolve();
        });
      });

      const stopResult = await ctx.recorderService.stopRecording(session.sessionId);
      console.log(JSON.stringify(stopResult, null, 2));

      await ctx.pool.close();
      process.exit(0);
    } catch (err) {
      logger.error('Failed during recording session', err);
      await ctx.pool.close();
      process.exit(1);
    }
  }
}

export class DescribeWorkflowCliRunner implements ICliModeRunner {
  canHandle(ctx: CliRuntimeContext): boolean {
    return Boolean(ctx.options.describe);
  }

  async run(ctx: CliRuntimeContext): Promise<void> {
    try {
      const description = String(ctx.options.describe);
      const baseUrl = ctx.options.url ? String(ctx.options.url) : undefined;
      const customName = ctx.options.name ? String(ctx.options.name) : undefined;

      logger.info(`Synthesizing and revalidating workflow with Ollama: "${description}"`);

      const result = await ctx.aiRevalidator.describeAndGenerate({
        userDescription: description,
        baseUrl,
        customName,
      });

      console.log(JSON.stringify(result, null, 2));

      await ctx.pool.close();
      process.exit(0);
    } catch (err) {
      logger.error('Failed to describe and synthesize workflow', err);
      await ctx.pool.close();
      process.exit(1);
    }
  }
}

export class ListWorkflowsCliRunner implements ICliModeRunner {
  canHandle(ctx: CliRuntimeContext): boolean {
    return Boolean(ctx.options.listWorkflows);
  }

  async run(ctx: CliRuntimeContext): Promise<void> {
    const list = ctx.recorderService.listRecordedWorkflows();
    console.log(JSON.stringify({ workflows: list, count: list.length }, null, 2));
    await ctx.pool.close();
    process.exit(0);
  }
}

export class StdioCliRunner implements ICliModeRunner {
  canHandle(ctx: CliRuntimeContext): boolean {
    return Boolean(ctx.options.stdio);
  }

  async run(ctx: CliRuntimeContext): Promise<void> {
    logger.info('Starting Playwright MCP Server on Stdio transport...');
    await ctx.mcpServer.startStdio();
  }
}

export class HttpServerCliRunner implements ICliModeRunner {
  canHandle(_ctx: CliRuntimeContext): boolean {
    return true; // Default fallback runner
  }

  async run(ctx: CliRuntimeContext): Promise<void> {
    const port = Number(
      ctx.options.port || process.env.MCP_PORT || process.env.PORT || NETWORK_DEFAULTS.MCP_PORT
    );
    const host = (ctx.options.host as string) || process.env.HOST || NETWORK_DEFAULTS.HOST;
    await ctx.mcpServer.startHttp(port, host);
  }
}

// ============================================================================
// Application Bootstrap
// ============================================================================

async function bootstrap() {
  const program = new Command();

  program
    .name('playwright-mcp-engine')
    .description(
      'High-concurrency JSON-driven Playwright Application and MCP Server with Auth Sniffing and AI Connectors'
    )
    .version('1.0.0')
    .option('--mcp', 'Start MCP server (defaults to HTTP/SSE server with /sse and /mcp endpoints)')
    .option('--stdio', 'Start MCP server on stdio transport instead of HTTP')
    .option('-p, --port <port>', 'Port for MCP HTTP/SSE server', String(config.mcpPort))
    .option('-h, --host <host>', 'Host for MCP HTTP/SSE server', config.host)
    .option('-w, --workflow <path>', 'Execute a JSON workflow file')
    .option('-c, --catalog <url>', 'Catalog all endpoints and scan auth requirements for a target URL')
    .option(
      '-g, --generate <path>',
      'Generate generalized Playwright TypeScript code from a workflow JSON file'
    )
    .option('-v, --vars <json>', 'Optional JSON string of runtime variables to override')
    .option('--metrics', 'Print engine concurrency and circuit breaker metrics')
    .option('--xray-platform <platform>', 'Google X-Ray platform target (linkedin, github, stackoverflow, pdf, custom)')
    .option('--xray-role <role>', 'Target role or job title for X-Ray search')
    .option('--xray-skills <skills>', 'Target skills or keywords (comma-separated) for X-Ray search')
    .option('--xray-location <location>', 'Target geographical location for X-Ray search')
    .option('--xray-company <company>', 'Target current or past company for X-Ray search')
    .option('--xray-preview', 'Preview Google X-Ray search query string without launching browser')
    .option('--record <url>', 'Start manual recording session on target URL')
    .option('--record-timeout <ms>', 'Recording session window timeout in ms (default: 30000)')
    .option('--describe <prompt>', 'Describe workflow changes in natural language to synthesize via Ollama')
    .option('--url <url>', 'Base URL for workflow generation when using --describe')
    .option('--name <name>', 'Custom workflow name when using --describe')
    .option('--list-workflows', 'List all saved workflows in the mounted workflows directory')
    .parse(process.argv);

  const options = program.opts();

  const pool = new BrowserPool(config.pool);
  await pool.initialize();

  const circuitBreakers = new CircuitBreakerRegistry(config.circuitBreaker);
  const retryHandler = new RetryHandler(config.retry);
  const tracker = new ConcurrencyTracker(pool, circuitBreakers);
  const orchestrator = new WorkflowOrchestrator(pool, circuitBreakers, tracker, retryHandler);
  const xrayService = new GoogleXRayService(pool, circuitBreakers, tracker);
  const recorderService = new WorkflowRecorderService(pool);
  const aiRevalidator = new OllamaWorkflowRevalidator();
  const mcpServer = new PlaywrightMcpServer(
    orchestrator,
    tracker,
    circuitBreakers,
    xrayService,
    recorderService,
    aiRevalidator
  );

  const shutdown = async () => {
    logger.info('Shutting down Playwright MCP Engine...');
    await mcpServer.close();
    await pool.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const runtimeCtx: CliRuntimeContext = {
    options,
    pool,
    orchestrator,
    tracker,
    circuitBreakers,
    mcpServer,
    xrayService,
    recorderService,
    aiRevalidator,
  };

  const cliRunners: ICliModeRunner[] = [
    new RecordCliRunner(),
    new DescribeWorkflowCliRunner(),
    new ListWorkflowsCliRunner(),
    new XRayCliRunner(),
    new WorkflowCliRunner(),
    new CatalogCliRunner(),
    new GenerateCliRunner(),
    new MetricsCliRunner(),
    new StdioCliRunner(),
    new HttpServerCliRunner(),
  ];

  const activeRunner = cliRunners.find((r) => r.canHandle(runtimeCtx)) ?? new HttpServerCliRunner();
  await activeRunner.run(runtimeCtx);
}

bootstrap().catch((err) => {
  logger.error('Fatal initialization error in Playwright MCP Engine', err);
  process.exit(1);
});
