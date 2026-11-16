import type { Request, Response, NextFunction } from "express";
import {
  ModelConnectorException,
  ApiTransportException,
  CliExecutionException,
  SessionCookieException,
} from "@model-box/model-connector-client";
import { DomainException } from "@model-box/model-connector-core";
import { HttpStatus } from "@/constants/index";

/**
 * Sanitized Error Handling Middleware.
 * Purges SQL queries, database stack traces, file paths, and code snippets from client responses.
 * Emits clean, meaningful, actionable error messages with correlation ID tracking.
 */
export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = req.correlationId || "unknown";
  const statusCode = resolveStatusCode(err);
  const rawMessage = err.message || "An unexpected internal server error occurred.";
  const sanitizedMessage = DomainException.sanitizeMessage(rawMessage);

  res.status(statusCode).json({
    success: false,
    error: {
      message: sanitizedMessage,
      code: (err as ModelConnectorException).code || "INTERNAL_ERROR",
      correlationId,
      timestamp: new Date().toISOString(),
    },
  });
}

function resolveStatusCode(err: Error): number {
  if (err instanceof ApiTransportException) return err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  if (err instanceof CliExecutionException) return HttpStatus.BAD_REQUEST;
  if (err instanceof SessionCookieException) return HttpStatus.UNAUTHORIZED;
  if (err instanceof ModelConnectorException) return HttpStatus.BAD_REQUEST;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}
