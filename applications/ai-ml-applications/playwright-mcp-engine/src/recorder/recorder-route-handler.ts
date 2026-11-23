import type { IncomingMessage, ServerResponse } from 'node:http';
import { HTTP_CONTENT_TYPES, HTTP_HEADERS, HTTP_STATUS, WORKFLOW_RECORDING_CONSTANTS } from '@/constants/index.js';
import type { WorkflowRecorderService } from '@/recorder/workflow-recorder.js';
import type { OllamaWorkflowRevalidator } from '@/recorder/ollama-revalidator.js';
import type { WorkflowGenerationRequest } from '@/recorder/types.js';
import { jobRequirementPipeline, type JobRequirementPayload } from '@/recorder/job-requirement-pipeline.js';
import {
  resumeMatcherService,
  type ResumeMatchRequest,
  type ResumeCustomizeRequest,
} from '@/recorder/resume-matcher-service.js';
import { googleDocsProfileService } from '@/recorder/google-docs-profile-service.js';
import { cookieStorageService } from '@/recorder/cookie-storage-service.js';

// ============================================================================
// Workflow Recorder & AI Revalidator Route Handlers (SOLID: SRP, OCP)
// ============================================================================

export interface RecorderRouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  pathname: string;
  recorderService: WorkflowRecorderService;
  aiRevalidator: OllamaWorkflowRevalidator;
}

class RequestBodyReader {
  static async read(req: IncomingMessage): Promise<string> {
    return new Promise<string>((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
      });
      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
    });
  }
}

export class RecordStartRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.RECORD_START &&
      ctx.req.method === 'POST'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    const body = await RequestBodyReader.read(ctx.req);
    try {
      const payload = JSON.parse(body || '{}') as { targetUrl?: string };
      const targetUrl = payload.targetUrl || 'https://google.com';
      const result = await ctx.recorderService.startRecording(targetUrl);

      ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify(result, null, 2));
    } catch (err) {
      ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

export class RecordStopRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.RECORD_STOP &&
      ctx.req.method === 'POST'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    const body = await RequestBodyReader.read(ctx.req);
    try {
      const payload = JSON.parse(body || '{}') as { sessionId?: string };
      const sessionId = payload.sessionId || ctx.url.searchParams.get('sessionId') || '';
      const result = await ctx.recorderService.stopRecording(sessionId);

      ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify(result, null, 2));
    } catch (err) {
      ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

export class DescribeAndGenerateRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      (ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.DESCRIBE_AND_GENERATE ||
        ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.REVALIDATE_WITH_OLLAMA) &&
      ctx.req.method === 'POST'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    const body = await RequestBodyReader.read(ctx.req);
    try {
      const payload = JSON.parse(body || '{}') as WorkflowGenerationRequest;
      const result = await ctx.aiRevalidator.describeAndGenerate(payload);

      ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify(result, null, 2));
    } catch (err) {
      ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

export class ListWorkflowsRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.LIST_WORKFLOWS &&
      ctx.req.method === 'GET'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    const workflows = ctx.recorderService.listRecordedWorkflows();
    ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
    ctx.res.end(
      JSON.stringify(
        {
          workflows,
          count: workflows.length,
        },
        null,
        2
      )
    );
  }
}

export class SaveJobRequirementRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.SAVE_JOB_REQUIREMENT &&
      ctx.req.method === 'POST'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    const body = await RequestBodyReader.read(ctx.req);
    try {
      const payload = JSON.parse(body || '{}') as JobRequirementPayload;
      const result = await jobRequirementPipeline.processAndPersist(payload);
      ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify(result, null, 2));
    } catch (err) {
      ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

export class ListJobRequirementsRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.LIST_JOB_REQUIREMENTS &&
      ctx.req.method === 'GET'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    try {
      const jobs = await jobRequirementPipeline.listJobRequirements();
      ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ jobs, count: jobs.length }, null, 2));
    } catch (err) {
      ctx.res.writeHead(HTTP_STATUS.INTERNAL_SERVER_ERROR, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

export class MatchResumeRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.MATCH_RESUME &&
      ctx.req.method === 'POST'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    const body = await RequestBodyReader.read(ctx.req);
    try {
      const payload = JSON.parse(body || '{}') as ResumeMatchRequest;
      const result = await resumeMatcherService.matchAndReviewProfile(payload);
      ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify(result, null, 2));
    } catch (err) {
      ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

export class CustomizeResumeRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.CUSTOMIZE_RESUME &&
      ctx.req.method === 'POST'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    const body = await RequestBodyReader.read(ctx.req);
    try {
      const payload = JSON.parse(body || '{}') as ResumeCustomizeRequest;
      const result = await resumeMatcherService.customizeResumeForRole(payload);
      ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify(result, null, 2));
    } catch (err) {
      ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

export class FetchGoogleDocProfileRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.FETCH_GOOGLE_DOC_PROFILE &&
      (ctx.req.method === 'POST' || ctx.req.method === 'GET')
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    try {
      let sheetUrl = ctx.url.searchParams.get('url') || '';
      let gid = ctx.url.searchParams.get('gid') || '0';

      if (!sheetUrl && ctx.req.method === 'POST') {
        const body = await RequestBodyReader.read(ctx.req);
        if (body) {
          const parsed = JSON.parse(body);
          sheetUrl = parsed.url || parsed.googleSheetUrl || '';
          gid = parsed.gid || gid;
        }
      }

      if (!sheetUrl) {
        // Return cached profile if available
        const cached = googleDocsProfileService.loadCachedProfile();
        if (cached) {
          ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
          ctx.res.end(JSON.stringify({ profile: cached, source: 'cached' }, null, 2));
          return;
        }
        ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
        ctx.res.end(JSON.stringify({ error: 'Missing url parameter or body { url: string }' }));
        return;
      }

      const profile = await googleDocsProfileService.fetchProfileFromGoogleSheet(sheetUrl, gid);
      ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ profile, source: 'google_docs' }, null, 2));
    } catch (err) {
      ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

export class CookiesStatusRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.COOKIES_STATUS &&
      ctx.req.method === 'GET'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    const summary = cookieStorageService.getCookieSummary();
    ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
    ctx.res.end(JSON.stringify(summary, null, 2));
  }
}

export class CookiesImportRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      (ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.COOKIES_STATUS ||
        ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.COOKIES_IMPORT) &&
      ctx.req.method === 'POST'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    const body = await RequestBodyReader.read(ctx.req);
    try {
      const payload = JSON.parse(body || '{}');
      const dataToImport = payload.cookies || payload;
      const result = cookieStorageService.importState(dataToImport);
      const statusCode = result.success ? HTTP_STATUS.OK : HTTP_STATUS.BAD_REQUEST;
      ctx.res.writeHead(statusCode, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify(result, null, 2));
    } catch (err) {
      ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
      ctx.res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

export class CookiesExportRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.COOKIES_EXPORT &&
      ctx.req.method === 'GET'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    const state = cookieStorageService.exportState();
    ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
    ctx.res.end(JSON.stringify(state || { cookies: [], origins: [] }, null, 2));
  }
}

export class CookiesClearRouteHandler {
  matches(ctx: RecorderRouteContext): boolean {
    return (
      ctx.pathname === WORKFLOW_RECORDING_CONSTANTS.REST_ENDPOINTS.COOKIES_STATUS &&
      ctx.req.method === 'DELETE'
    );
  }

  async handle(ctx: RecorderRouteContext): Promise<void> {
    cookieStorageService.clearState();
    ctx.res.writeHead(HTTP_STATUS.OK, { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON });
    ctx.res.end(JSON.stringify({ success: true, message: 'Cleared authentication cookies and storage state' }, null, 2));
  }
}

