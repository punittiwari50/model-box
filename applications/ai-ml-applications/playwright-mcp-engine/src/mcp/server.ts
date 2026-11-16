import http from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '@/core/logger.js';
import { ENGINE_MCP_TOOLS } from '@/mcp/tools.js';
import type { WorkflowOrchestrator } from '@/engine/workflow-orchestrator.js';
import { CodeGenerator } from '@/generator/code-generator.js';
import { WorkflowParser } from '@/engine/workflow-parser.js';
import { ollamaConnector } from '@/connectors/ollama-connector.js';
import { comfyUiConnector } from '@/connectors/comfyui-connector.js';
import type { ConcurrencyTracker } from '@/resilience/concurrency-tracker.js';
import type { CircuitBreakerRegistry } from '@/resilience/circuit-breaker.js';
import { HTTP_CONTENT_TYPES, HTTP_HEADERS, HTTP_STATUS } from '@/constants/index.js';
import { GoogleXRayService } from '@/xray/xray-service.js';
import type { XRayQueryParams } from '@/xray/types.js';
import {
  XRayPreviewRouteHandler,
  XRaySearchRouteHandler,
  XRayTemplatesRouteHandler,
} from '@/xray/xray-route-handler.js';
import { WorkflowRecorderService } from '@/recorder/workflow-recorder.js';
import { OllamaWorkflowRevalidator } from '@/recorder/ollama-revalidator.js';
import type { WorkflowGenerationRequest } from '@/recorder/types.js';
import {
  DescribeAndGenerateRouteHandler,
  ListWorkflowsRouteHandler,
  RecordStartRouteHandler,
  RecordStopRouteHandler,
  SaveJobRequirementRouteHandler,
  ListJobRequirementsRouteHandler,
  MatchResumeRouteHandler,
  CustomizeResumeRouteHandler,
  FetchGoogleDocProfileRouteHandler,
  CookiesStatusRouteHandler,
  CookiesImportRouteHandler,
  CookiesExportRouteHandler,
  CookiesClearRouteHandler,
} from '@/recorder/recorder-route-handler.js';
import { cookieStorageService } from '@/recorder/cookie-storage-service.js';
import { jobRequirementPipeline, type JobRequirementPayload } from '@/recorder/job-requirement-pipeline.js';
import {
  resumeMatcherService,
  type ResumeMatchRequest,
  type ResumeCustomizeRequest,
} from '@/recorder/resume-matcher-service.js';
import { googleDocsProfileService } from '@/recorder/google-docs-profile-service.js';

interface ActiveSession {
  sessionId: string;
  transport: SSEServerTransport;
  server: Server;
  createdAt: number;
}

// ============================================================================
// Tool Execution Strategy Pattern (SOLID: SRP, OCP, LSP, ISP, DIP)
// ============================================================================

export interface ToolExecutionContext {
  args: Record<string, unknown> | undefined;
  orchestrator: WorkflowOrchestrator;
  tracker: ConcurrencyTracker;
  circuitBreakers: CircuitBreakerRegistry;
  xrayService: GoogleXRayService;
  recorderService: WorkflowRecorderService;
  aiRevalidator: OllamaWorkflowRevalidator;
}

export interface IMcpToolHandler {
  readonly name: string;
  execute(ctx: ToolExecutionContext): Promise<unknown>;
}

export class ExecuteWorkflowToolHandler implements IMcpToolHandler {
  readonly name = 'execute_workflow';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const workflow = ctx.args?.workflow;
    const variables = (ctx.args?.variables as Record<string, unknown>) || {};
    return ctx.orchestrator.execute(workflow, variables);
  }
}

export class CatalogEndpointsToolHandler implements IMcpToolHandler {
  readonly name = 'catalog_endpoints';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const targetUrl = String(ctx.args?.targetUrl || '');
    const scanWorkflow = {
      id: `scan-${Date.now()}`,
      name: `Catalog Endpoints for ${targetUrl}`,
      baseUrl: targetUrl,
      steps: [
        { id: 'nav', action: 'navigate', targetUrl },
        { id: 'wait', action: 'wait_for_timeout', value: 3000 },
      ],
    };
    const result = await ctx.orchestrator.execute(scanWorkflow);
    return {
      targetUrl,
      networkAuthSummary: result.networkAuthSummary,
      status: result.status,
    };
  }
}

export class GeneratePlaywrightCodeToolHandler implements IMcpToolHandler {
  readonly name = 'generate_playwright_code';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const raw = ctx.args?.workflow;
    const parsed = WorkflowParser.parse(raw);
    return CodeGenerator.generatePlaywrightTypeScript(parsed);
  }
}

export class OllamaAssistToolHandler implements IMcpToolHandler {
  readonly name = 'ollama_assist';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const prompt = String(ctx.args?.prompt || '');
    const model = ctx.args?.model ? String(ctx.args.model) : undefined;
    const screenshotBase64 = ctx.args?.screenshotBase64 ? String(ctx.args.screenshotBase64) : undefined;

    return ollamaConnector.generate({
      prompt,
      model,
      images: screenshotBase64 ? [screenshotBase64] : undefined,
    });
  }
}

export class ComfyUiGenerateToolHandler implements IMcpToolHandler {
  readonly name = 'comfyui_generate';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const positivePrompt = String(ctx.args?.positivePrompt || '');
    const negativePrompt = ctx.args?.negativePrompt ? String(ctx.args.negativePrompt) : '';
    const seed = typeof ctx.args?.seed === 'number' ? ctx.args.seed : Math.floor(Math.random() * 1000000);

    const promptGraph = {
      '3': {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps: 20,
          cfg: 8,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: 1,
        },
      },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: { text: positivePrompt },
      },
      '7': {
        class_type: 'CLIPTextEncode',
        inputs: { text: negativePrompt },
      },
    };

    return comfyUiConnector.queuePrompt(promptGraph);
  }
}

export class GetEngineMetricsToolHandler implements IMcpToolHandler {
  readonly name = 'get_engine_metrics';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const snapshot = ctx.tracker.getMetricsSnapshot();
    const cbStatuses = ctx.circuitBreakers.getAllStatuses();
    return { concurrency: snapshot, circuitBreakers: cbStatuses };
  }
}

export class GoogleXRayToolHandler implements IMcpToolHandler {
  readonly name = 'google_xray_search';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const params = (ctx.args || {}) as unknown as XRayQueryParams;
    return ctx.xrayService.search(params);
  }
}

export class StartRecordingToolHandler implements IMcpToolHandler {
  readonly name = 'start_workflow_recording';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const targetUrl = String(ctx.args?.targetUrl || 'https://google.com');
    return ctx.recorderService.startRecording(targetUrl);
  }
}

export class StopRecordingToolHandler implements IMcpToolHandler {
  readonly name = 'stop_workflow_recording';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const sessionId = String(ctx.args?.sessionId || '');
    return ctx.recorderService.stopRecording(sessionId);
  }
}

export class DescribeAndGenerateToolHandler implements IMcpToolHandler {
  readonly name = 'describe_and_generate_workflow';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const request = (ctx.args || {}) as unknown as WorkflowGenerationRequest;
    return ctx.aiRevalidator.describeAndGenerate(request);
  }
}

export class ListRecordedWorkflowsToolHandler implements IMcpToolHandler {
  readonly name = 'list_recorded_workflows';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const workflows = ctx.recorderService.listRecordedWorkflows();
    return { workflows, count: workflows.length };
  }
}

export class ExtractAndSaveJobToolHandler implements IMcpToolHandler {
  readonly name = 'extract_and_save_job_requirement';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const payload = (ctx.args || {}) as unknown as JobRequirementPayload;
    return jobRequirementPipeline.processAndPersist(payload);
  }
}

export class ListJobRequirementsToolHandler implements IMcpToolHandler {
  readonly name = 'list_job_requirements';

  async execute(_ctx: ToolExecutionContext): Promise<unknown> {
    const jobs = await jobRequirementPipeline.listJobRequirements();
    return { jobs, count: jobs.length };
  }
}

export class MatchResumeToolHandler implements IMcpToolHandler {
  readonly name = 'match_and_review_resume';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const payload = (ctx.args || {}) as unknown as ResumeMatchRequest;
    return resumeMatcherService.matchAndReviewProfile(payload);
  }
}

export class CustomizeResumeToolHandler implements IMcpToolHandler {
  readonly name = 'customize_resume_for_role';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const payload = (ctx.args || {}) as unknown as ResumeCustomizeRequest;
    return resumeMatcherService.customizeResumeForRole(payload);
  }
}

export class FetchGoogleDocsProfileToolHandler implements IMcpToolHandler {
  readonly name = 'fetch_google_docs_profile';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const args = (ctx.args || {}) as { url?: string; gid?: string };
    if (!args.url) {
      const cached = googleDocsProfileService.loadCachedProfile();
      if (cached) return { profile: cached, source: 'cached' };
      throw new Error('Missing url parameter in fetch_google_docs_profile');
    }
    const profile = await googleDocsProfileService.fetchProfileFromGoogleSheet(args.url, args.gid || '0');
    return { profile, source: 'google_docs' };
  }
}

export class GetAuthCookiesToolHandler implements IMcpToolHandler {
  readonly name = 'get_auth_cookies';

  async execute(): Promise<unknown> {
    return cookieStorageService.getCookieSummary();
  }
}

export class ImportAuthCookiesToolHandler implements IMcpToolHandler {
  readonly name = 'import_auth_cookies';

  async execute(ctx: ToolExecutionContext): Promise<unknown> {
    const cookies = (ctx.args as any)?.cookies || ctx.args;
    return cookieStorageService.importState(cookies);
  }
}

export class ExportAuthCookiesToolHandler implements IMcpToolHandler {
  readonly name = 'export_auth_cookies';

  async execute(): Promise<unknown> {
    return cookieStorageService.exportState() || { cookies: [], origins: [] };
  }
}

export class McpToolRegistry {
  private static readonly HANDLERS: Readonly<Record<string, IMcpToolHandler>> = {
    execute_workflow: new ExecuteWorkflowToolHandler(),
    catalog_endpoints: new CatalogEndpointsToolHandler(),
    generate_playwright_code: new GeneratePlaywrightCodeToolHandler(),
    ollama_assist: new OllamaAssistToolHandler(),
    comfyui_generate: new ComfyUiGenerateToolHandler(),
    get_engine_metrics: new GetEngineMetricsToolHandler(),
    google_xray_search: new GoogleXRayToolHandler(),
    start_workflow_recording: new StartRecordingToolHandler(),
    stop_workflow_recording: new StopRecordingToolHandler(),
    describe_and_generate_workflow: new DescribeAndGenerateToolHandler(),
    list_recorded_workflows: new ListRecordedWorkflowsToolHandler(),
    extract_and_save_job_requirement: new ExtractAndSaveJobToolHandler(),
    list_job_requirements: new ListJobRequirementsToolHandler(),
    match_and_review_resume: new MatchResumeToolHandler(),
    customize_resume_for_role: new CustomizeResumeToolHandler(),
    fetch_google_docs_profile: new FetchGoogleDocsProfileToolHandler(),
    get_auth_cookies: new GetAuthCookiesToolHandler(),
    import_auth_cookies: new ImportAuthCookiesToolHandler(),
    export_auth_cookies: new ExportAuthCookiesToolHandler(),
  };

  static getHandler(name: string): IMcpToolHandler | undefined {
    return this.HANDLERS[name];
  }
}

// ============================================================================
// HTTP Route Strategy Pattern (SOLID: SRP, OCP, LSP, ISP, DIP)
// ============================================================================

export interface HttpRequestContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  pathname: string;
  host: string;
  port: number;
  server: PlaywrightMcpServer;
}

export interface IHttpRouteHandler {
  matches(ctx: HttpRequestContext): boolean;
  handle(ctx: HttpRequestContext): Promise<void>;
}

export class HealthRouteHandler implements IHttpRouteHandler {
  matches(ctx: HttpRequestContext): boolean {
    return ctx.pathname === '/health';
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
    ctx.res.end(
      JSON.stringify({
        status: 'healthy',
        activeSseSessions: ctx.server.getActiveSessionCount(),
        concurrency: ctx.server.getTracker().getMetricsSnapshot().currentActive,
      })
    );
  }
}

export class RootRouteHandler implements IHttpRouteHandler {
  matches(ctx: HttpRequestContext): boolean {
    return ctx.pathname === '/' && ctx.req.method === 'GET';
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    const configInfo = {
      mcpServers: {
        'playwright-mcp-engine': {
          url: `http://${ctx.host === '0.0.0.0' ? 'localhost' : ctx.host}:${ctx.port}/mcp`,
        },
      },
    };
    ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.TEXT_PLAIN });
    ctx.res.end(
      [
        `Listening on http://${ctx.host}:${ctx.port}`,
        'Put this in your client config:',
        JSON.stringify(configInfo, null, 2),
        '',
        'For legacy SSE transport support, you can use the /sse endpoint instead.',
        '',
        'Google X-Ray Automation REST Endpoints:',
        '  POST /api/xray/search    - Execute Google X-Ray search query',
        '  GET  /api/xray/templates - List pre-configured enterprise search templates',
        '  POST /api/xray/preview   - Preview compiled Google query string without browser execution',
        '',
        'Workflow Recording & AI Revalidation REST Endpoints:',
        '  POST /api/workflow/record/start          - Start interactive recording session on target URL',
        '  POST /api/workflow/record/stop           - Stop recording and persist workflow to volume',
        '  POST /api/workflow/describe-and-generate - Describe changes in natural language and revalidate via Ollama',
        '  GET  /api/workflows                      - List all workflows saved in bidirectional mounted volume',
      ].join('\n')
    );
  }
}

export class SseConnectRouteHandler implements IHttpRouteHandler {
  matches(ctx: HttpRequestContext): boolean {
    return (ctx.pathname === '/sse' || ctx.pathname === '/mcp') && ctx.req.method === 'GET';
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    try {
      logger.info(`Creating SSE session for client from ${ctx.req.socket.remoteAddress}`);
      const transport = new SSEServerTransport('/sse', ctx.res);
      const serverInstance = ctx.server.createServerInstance();
      await serverInstance.connect(transport);

      const session: ActiveSession = {
        sessionId: transport.sessionId,
        transport,
        server: serverInstance,
        createdAt: Date.now(),
      };
      ctx.server.addSession(transport.sessionId, session);

      ctx.res.on('close', () => {
        logger.info(`SSE session ${transport.sessionId} closed by client.`);
        ctx.server.removeSession(transport.sessionId);
        transport.close().catch(() => {});
      });
    } catch (err) {
      logger.error('Failed to establish SSE transport session', err);
      const isHeadersSent = ctx.res.headersSent;
      const errorSenders: Record<string, () => void> = {
        false: () => {
          ctx.res.writeHead(HTTP_STATUS.INTERNAL_SERVER_ERROR, {
            [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON,
          });
          ctx.res.end(JSON.stringify({ error: 'Failed to establish SSE session' }));
        },
        true: () => {},
      };
      errorSenders[String(isHeadersSent)]();
    }
  }
}

export class SsePostMessageRouteHandler implements IHttpRouteHandler {
  matches(ctx: HttpRequestContext): boolean {
    return (
      (ctx.pathname === '/sse' || ctx.pathname === '/messages' || ctx.pathname === '/mcp') &&
      ctx.req.method === 'POST'
    );
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    const sessionId =
      ctx.url.searchParams.get('sessionId') || (ctx.req.headers[HTTP_HEADERS.MCP_SESSION_ID] as string);

    const hasSessionId = Boolean(sessionId);
    const sessionMissingHandlers: Record<string, () => Promise<void>> = {
      false: async () => {
        ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
        ctx.res.end(
          JSON.stringify({
            error: 'Missing sessionId query parameter or mcp-session-id header.',
            help: 'Connect with GET /sse first to establish a session, or supply ?sessionId=<id>',
          })
        );
      },
      true: async () => {
        const session = ctx.server.getSession(sessionId!);
        const hasSession = Boolean(session);

        const sessionFoundHandlers: Record<string, () => Promise<void>> = {
          false: async () => {
            ctx.res.writeHead(HTTP_STATUS.NOT_FOUND, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
            ctx.res.end(JSON.stringify({ error: `Session '${sessionId}' not found or expired.` }));
          },
          true: async () => {
            try {
              await session!.transport.handlePostMessage(ctx.req, ctx.res);
            } catch (err) {
              logger.error(`Error handling post message for session ${sessionId}`, err);
              const isSent = ctx.res.headersSent;
              const postErrorSenders: Record<string, () => void> = {
                false: () => {
                  ctx.res.writeHead(HTTP_STATUS.INTERNAL_SERVER_ERROR, {
                    [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON,
                  });
                  ctx.res.end(JSON.stringify({ error: String(err) }));
                },
                true: () => {},
              };
              postErrorSenders[String(isSent)]();
            }
          },
        };

        await (sessionFoundHandlers[String(hasSession)] ?? sessionFoundHandlers.false)();
      },
    };

    await (sessionMissingHandlers[String(hasSessionId)] ?? sessionMissingHandlers.false)();
  }
}

export class XRaySearchRouteAdapter implements IHttpRouteHandler {
  private handler = new XRaySearchRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      xrayService: ctx.server.getXRayService(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      xrayService: ctx.server.getXRayService(),
    });
  }
}

export class XRayTemplatesRouteAdapter implements IHttpRouteHandler {
  private handler = new XRayTemplatesRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      xrayService: ctx.server.getXRayService(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      xrayService: ctx.server.getXRayService(),
    });
  }
}

export class XRayPreviewRouteAdapter implements IHttpRouteHandler {
  private handler = new XRayPreviewRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      xrayService: ctx.server.getXRayService(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      xrayService: ctx.server.getXRayService(),
    });
  }
}

export class RecordStartRouteAdapter implements IHttpRouteHandler {
  private handler = new RecordStartRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class RecordStopRouteAdapter implements IHttpRouteHandler {
  private handler = new RecordStopRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class DescribeAndGenerateRouteAdapter implements IHttpRouteHandler {
  private handler = new DescribeAndGenerateRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class ListWorkflowsRouteAdapter implements IHttpRouteHandler {
  private handler = new ListWorkflowsRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class SaveJobRequirementRouteAdapter implements IHttpRouteHandler {
  private handler = new SaveJobRequirementRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class ListJobRequirementsRouteAdapter implements IHttpRouteHandler {
  private handler = new ListJobRequirementsRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class MatchResumeRouteAdapter implements IHttpRouteHandler {
  private handler = new MatchResumeRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class CustomizeResumeRouteAdapter implements IHttpRouteHandler {
  private handler = new CustomizeResumeRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class FetchGoogleDocProfileRouteAdapter implements IHttpRouteHandler {
  private handler = new FetchGoogleDocProfileRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class CookiesStatusRouteAdapter implements IHttpRouteHandler {
  private handler = new CookiesStatusRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class CookiesImportRouteAdapter implements IHttpRouteHandler {
  private handler = new CookiesImportRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class CookiesExportRouteAdapter implements IHttpRouteHandler {
  private handler = new CookiesExportRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class CookiesClearRouteAdapter implements IHttpRouteHandler {
  private handler = new CookiesClearRouteHandler();

  matches(ctx: HttpRequestContext): boolean {
    return this.handler.matches({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    await this.handler.handle({
      req: ctx.req,
      res: ctx.res,
      url: ctx.url,
      pathname: ctx.pathname,
      recorderService: ctx.server.getRecorderService(),
      aiRevalidator: ctx.server.getAiRevalidator(),
    });
  }
}

export class DefaultNotFoundRouteHandler implements IHttpRouteHandler {
  matches(_ctx: HttpRequestContext): boolean {
    return true;
  }

  async handle(ctx: HttpRequestContext): Promise<void> {
    ctx.res.writeHead(HTTP_STATUS.NOT_FOUND, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.TEXT_PLAIN });
    ctx.res.end(
      `Not Found: ${ctx.pathname}\nUse /sse for legacy SSE transport or /mcp for streamable transport.`
    );
  }
}

// ============================================================================
// Playwright MCP Server
// ============================================================================

export class PlaywrightMcpServer {
  private orchestrator: WorkflowOrchestrator;
  private tracker: ConcurrencyTracker;
  private circuitBreakers: CircuitBreakerRegistry;
  private xrayService: GoogleXRayService;
  private recorderService: WorkflowRecorderService;
  private aiRevalidator: OllamaWorkflowRevalidator;
  private sessions = new Map<string, ActiveSession>();
  private httpServer: http.Server | null = null;

  private readonly routePipeline: IHttpRouteHandler[] = [
    new HealthRouteHandler(),
    new RootRouteHandler(),
    new XRaySearchRouteAdapter(),
    new XRayTemplatesRouteAdapter(),
    new XRayPreviewRouteAdapter(),
    new RecordStartRouteAdapter(),
    new RecordStopRouteAdapter(),
    new DescribeAndGenerateRouteAdapter(),
    new ListWorkflowsRouteAdapter(),
    new SaveJobRequirementRouteAdapter(),
    new ListJobRequirementsRouteAdapter(),
    new MatchResumeRouteAdapter(),
    new CustomizeResumeRouteAdapter(),
    new FetchGoogleDocProfileRouteAdapter(),
    new CookiesStatusRouteAdapter(),
    new CookiesImportRouteAdapter(),
    new CookiesExportRouteAdapter(),
    new CookiesClearRouteAdapter(),
    new SseConnectRouteHandler(),
    new SsePostMessageRouteHandler(),
    new DefaultNotFoundRouteHandler(),
  ];

  constructor(
    orchestrator: WorkflowOrchestrator,
    tracker: ConcurrencyTracker,
    circuitBreakers: CircuitBreakerRegistry,
    xrayService: GoogleXRayService,
    recorderService?: WorkflowRecorderService,
    aiRevalidator?: OllamaWorkflowRevalidator
  ) {
    this.orchestrator = orchestrator;
    this.tracker = tracker;
    this.circuitBreakers = circuitBreakers;
    this.xrayService = xrayService;
    this.recorderService = recorderService || new WorkflowRecorderService(orchestrator.getPool());
    this.aiRevalidator = aiRevalidator || new OllamaWorkflowRevalidator();
  }

  getXRayService(): GoogleXRayService {
    return this.xrayService;
  }

  getRecorderService(): WorkflowRecorderService {
    return this.recorderService;
  }

  getAiRevalidator(): OllamaWorkflowRevalidator {
    return this.aiRevalidator;
  }

  getTracker(): ConcurrencyTracker {
    return this.tracker;
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  addSession(id: string, session: ActiveSession): void {
    this.sessions.set(id, session);
  }

  removeSession(id: string): void {
    this.sessions.delete(id);
  }

  getSession(id: string): ActiveSession | undefined {
    return this.sessions.get(id);
  }

  createServerInstance(): Server {
    const server = new Server(
      {
        name: 'playwright-mcp-engine',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: ENGINE_MCP_TOOLS,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info(`MCP tool call received: ${name}`);

      try {
        const handler = McpToolRegistry.getHandler(name);
        const hasHandler = Boolean(handler);

        const handlerDispatchers: Record<string, () => Promise<unknown>> = {
          true: () =>
            handler!.execute({
              args,
              orchestrator: this.orchestrator,
              tracker: this.tracker,
              circuitBreakers: this.circuitBreakers,
              xrayService: this.xrayService,
              recorderService: this.recorderService,
              aiRevalidator: this.aiRevalidator,
            }),
          false: async () => {
            throw new Error(`Unknown tool name: ${name}`);
          },
        };

        const result = await (handlerDispatchers[String(hasHandler)] ?? handlerDispatchers.false)();
        const textPayload = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: 'text',
              text: textPayload,
            },
          ],
        };
      } catch (err) {
        logger.error(`Error executing MCP tool '${name}':`, err);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    });

    return server;
  }

  async startHttp(port: number, host = '0.0.0.0'): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.httpServer = http.createServer(async (req, res) => {
        res.setHeader(HTTP_HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN, '*');
        res.setHeader(HTTP_HEADERS.ACCESS_CONTROL_ALLOW_METHODS, 'GET, POST, OPTIONS');
        res.setHeader(
          HTTP_HEADERS.ACCESS_CONTROL_ALLOW_HEADERS,
          'Content-Type, mcp-session-id, Authorization, Accept'
        );

        const isOptions = req.method === 'OPTIONS';
        const optionsActions: Record<string, () => void> = {
          true: () => {
            res.writeHead(HTTP_STATUS.NO_CONTENT);
            res.end();
          },
          false: () => {},
        };
        optionsActions[String(isOptions)]();

        const skipRoutingActions: Record<string, () => Promise<void>> = {
          true: async () => {},
          false: async () => {
            const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
            const ctx: HttpRequestContext = {
              req,
              res,
              url: reqUrl,
              pathname: reqUrl.pathname,
              host,
              port,
              server: this,
            };

            const matchedHandler = this.routePipeline.find((h) => h.matches(ctx)) ?? new DefaultNotFoundRouteHandler();
            await matchedHandler.handle(ctx);
          },
        };

        await (skipRoutingActions[String(isOptions)] ?? skipRoutingActions.false)();
      });

      this.httpServer.on('error', (err) => {
        logger.error(`HTTP Server failed to bind on ${host}:${port}`, err);
        reject(err);
      });

      this.httpServer.listen(port, host, () => {
        const listenUrl = `http://${host}:${port}`;
        const mcpConfig = {
          mcpServers: {
            'playwright-mcp-engine': {
              url: `${listenUrl}/mcp`,
            },
          },
        };
        const message = [
          `Listening on ${listenUrl}`,
          'Put this in your client config:',
          JSON.stringify(mcpConfig, null, 2),
          'For legacy SSE transport support, you can use the /sse endpoint instead.',
        ].join('\n');
        console.error(message);
        resolve(listenUrl);
      });
    });
  }

  async startStdio(): Promise<void> {
    const serverInstance = this.createServerInstance();
    const transport = new StdioServerTransport();
    await serverInstance.connect(transport);
    logger.info('Playwright MCP Server running on Stdio transport');
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) {
      try {
        await session.transport.close();
      } catch {
        // Ignore
      }
    }
    this.sessions.clear();

    const hasHttpServer = Boolean(this.httpServer);
    const closeActions: Record<string, () => Promise<void>> = {
      true: async () => {
        await new Promise<void>((res) => this.httpServer?.close(() => res()));
        this.httpServer = null;
      },
      false: async () => {},
    };
    await (closeActions[String(hasHttpServer)] ?? closeActions.false)();
  }
}
