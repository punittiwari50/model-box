import type { Request, Response } from "express";
import { inferenceService } from "@/services/inferenceService";
import { HttpStatus, HttpHeader } from "@/constants/index";
import type { ExecutionRequest, StreamChunk } from "@model-box/model-connector-client";

export class InferenceController {
  public async chat(req: Request, res: Response): Promise<void> {
    try {
      const payload = this.extractExecutionPayload(req);
      const response = await inferenceService.executeChat(payload);
      res.status(HttpStatus.OK).json({ success: true, ...response });
    } catch (err: any) {
      const statusCode = Number(err.statusCode) || HttpStatus.INTERNAL_SERVER_ERROR;
      res.status(statusCode).json({
        success: false,
        error: {
          message: err.message || "Failed to process chat inference",
          code: err.code || "INFERENCE_ERROR",
          correlationId: req.correlationId,
        },
      });
    }
  }

  public async streamChat(req: Request, res: Response): Promise<void> {
    this.prepareSseHeaders(res);
    const payload = this.extractExecutionPayload(req);

    try {
      await inferenceService.streamChat(payload, (chunk: StreamChunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      });
      res.write("event: done\ndata: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      res.end();
    }
  }

  private extractExecutionPayload(req: Request): ExecutionRequest {
    const headers = req.headers;
    const model = (req.body?.model || req.body?.modelId || "gemini-3.8-flash") as string;
    const prompt = (req.body?.prompt || "") as string;
    return {
      ...req.body,
      model,
      prompt,
      userId: (req.body?.userId || headers["x-user-id"] || headers["user-id"]) as string | undefined,
      userEmail: (req.body?.userEmail || headers["x-user-email"] || headers["user-email"]) as string | undefined,
      taskId: (req.body?.taskId || headers["x-task-id"] || headers["task-id"]) as string | undefined,
      requestId: (req.body?.requestId || headers["x-request-id"] || headers["request-id"] || req.correlationId) as string | undefined,
      correlationId: req.correlationId,
    };
  }

  private prepareSseHeaders(res: Response): void {
    res.setHeader(HttpHeader.CONTENT_TYPE, "text/event-stream");
    res.setHeader(HttpHeader.CACHE_CONTROL, "no-cache");
    res.setHeader(HttpHeader.CONNECTION, "keep-alive");
    res.flushHeaders?.();
  }
}

export const inferenceController = new InferenceController();
