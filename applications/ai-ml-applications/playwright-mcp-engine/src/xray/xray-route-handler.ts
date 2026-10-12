import type { IncomingMessage, ServerResponse } from 'node:http';
import { HTTP_CONTENT_TYPES, HTTP_HEADERS, HTTP_STATUS } from '@/constants/index.js';
import type { GoogleXRayService } from '@/xray/xray-service.js';
import { XRayPlatformRegistry } from '@/xray/platform-strategies.js';
import type { XRayQueryParams } from '@/xray/types.js';

export interface XRayRouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  pathname: string;
  xrayService: GoogleXRayService;
}

export class XRaySearchRouteHandler {
  matches(ctx: XRayRouteContext): boolean {
    return ctx.pathname === '/api/xray/search' && ctx.req.method === 'POST';
  }

  async handle(ctx: XRayRouteContext): Promise<void> {
    const body = await this.readRequestBody(ctx.req);
    try {
      const params = JSON.parse(body || '{}') as XRayQueryParams;
      const result = await ctx.xrayService.search(params);

      ctx.res.writeHead(HTTP_STATUS.OK, {
        [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON,
      });
      ctx.res.end(JSON.stringify(result, null, 2));
    } catch (err) {
      ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, {
        [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON,
      });
      ctx.res.end(
        JSON.stringify({
          error: `Invalid X-Ray request: ${err instanceof Error ? err.message : String(err)}`,
        })
      );
    }
  }

  private async readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise<string>((resolve) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => resolve(body));
    });
  }
}

export class XRayTemplatesRouteHandler {
  matches(ctx: XRayRouteContext): boolean {
    return ctx.pathname === '/api/xray/templates' && ctx.req.method === 'GET';
  }

  async handle(ctx: XRayRouteContext): Promise<void> {
    const templates = XRayPlatformRegistry.getEnterpriseTemplates();
    ctx.res.writeHead(HTTP_STATUS.OK, {
      [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON,
    });
    ctx.res.end(
      JSON.stringify(
        {
          templates,
          count: templates.length,
        },
        null,
        2
      )
    );
  }
}

export class XRayPreviewRouteHandler {
  matches(ctx: XRayRouteContext): boolean {
    return ctx.pathname === '/api/xray/preview' && ctx.req.method === 'POST';
  }

  async handle(ctx: XRayRouteContext): Promise<void> {
    return new Promise<void>((resolve) => {
      let body = '';
      ctx.req.on('data', (chunk) => {
        body += chunk;
      });
      ctx.req.on('end', () => {
        try {
          const params = JSON.parse(body || '{}') as XRayQueryParams;
          const preview = ctx.xrayService.previewQuery(params);

          ctx.res.writeHead(HTTP_STATUS.OK, {
            [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON,
          });
          ctx.res.end(JSON.stringify(preview, null, 2));
        } catch (err) {
          ctx.res.writeHead(HTTP_STATUS.BAD_REQUEST, {
            [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON,
          });
          ctx.res.end(
            JSON.stringify({
              error: `Invalid preview payload: ${err instanceof Error ? err.message : String(err)}`,
            })
          );
        }
        resolve();
      });
    });
  }
}
