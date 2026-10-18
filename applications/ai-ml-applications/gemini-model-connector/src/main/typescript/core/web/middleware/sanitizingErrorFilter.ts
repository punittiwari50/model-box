import type { Request, Response, NextFunction } from 'express';
import { logger } from '@/core/observability/logging/logger.js';
import { httpResponseFormatter } from '@/core/web/helper/responseHelper.js';

/**
 * Sanitizing Error Filter (OOP Pattern).
 * Conforms to Requirement #8:
 * - Prevents leakage of SQL statements, file paths, stack traces, and configuration parameters in API error responses.
 */
export class SanitizingErrorFilter {
  public handle(
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
  ): void {
    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
    const rawMessage = typeof err.message === 'string' ? err.message : 'Unknown internal error';

    // Log full unsanitized error to server-side logs for investigation
    logger.error('SERVER', `Unhandled exception caught by SanitizingErrorFilter: ${rawMessage}`);
    if (err.stack) {
      logger.debug('SERVER', err.stack);
    }

    // Sanitize message for client consumption
    let sanitized = rawMessage;

    // Mask internal SQL details
    if (
      /SELECT|INSERT|UPDATE|DELETE|SQLITE_|DATABASE|SYNTAX ERROR|TABLE|COLUMN/i.test(sanitized) ||
      statusCode >= 500
    ) {
      sanitized = 'An internal system error occurred while processing the request.';
    }

    // Strip file system paths
    sanitized = sanitized.replace(/([a-zA-Z]:|\/app|\/usr|\/home|\/node_modules)[\w\-\.\/\\\:]+/g, '[masked-path]');

    // Strip potential tokens or keys
    sanitized = sanitized.replace(/(AIza|Bearer\s+|key=|token=)[\w\-\._]+/gi, '[masked-credential]');

    httpResponseFormatter.sendError(res, statusCode, sanitized);
  }
}

export const sanitizingErrorFilterInstance = new SanitizingErrorFilter();
export const sanitizingErrorFilter = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => sanitizingErrorFilterInstance.handle(err, req, res, next);
