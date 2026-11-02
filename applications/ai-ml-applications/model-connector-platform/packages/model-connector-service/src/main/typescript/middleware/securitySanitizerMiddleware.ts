import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "@/constants/index";

const SENSITIVE_QUERY_KEYS = [
  "prompt",
  "apikey",
  "api_key",
  "token",
  "cookie",
  "secret",
  "password",
  "auth",
  "authorization",
  "sessionid",
  "session_id",
];

/**
 * PII and Credential URL Guard Middleware.
 * Enforces requirement: No PII or credential information in URL header, path, query.
 * All sensitive payloads must reside strictly in request body / response body.
 */
export function piiUrlGuardMiddleware(req: Request, res: Response, next: NextFunction): void {
  const queryKeys = Object.keys(req.query || {}).map((k) => k.toLowerCase());
  for (const sensitive of SENSITIVE_QUERY_KEYS) {
    if (queryKeys.includes(sensitive)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: {
          code: "SEC_PII_URL_DISALLOWED",
          message: `Sensitive parameter '${sensitive}' is disallowed in URL query. All credentials and prompts must be passed in the request body.`,
          correlationId: req.correlationId || "unknown",
        },
      });
      return;
    }
  }

  // Check URL path for raw API keys or tokens
  const rawPath = req.originalUrl || req.url;
  if (/AIza[0-9A-Za-z_\-]{35}|sk-[a-zA-Z0-9]{32,}|ghu_[a-zA-Z0-9]{36}/.test(rawPath)) {
    res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      error: {
        code: "SEC_PII_PATH_DISALLOWED",
        message: "API keys and sensitive tokens are strictly prohibited in URL path.",
        correlationId: req.correlationId || "unknown",
      },
    });
    return;
  }

  next();
}
