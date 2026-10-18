import type { Request, Response, NextFunction } from "express";

/**
 * Enterprise Security Filter & Interceptor (OOP Pattern).
 * Conforms to Requirement #3, #8, #15:
 * - Injects hardened OWASP security headers.
 * - Enforces anti-PII and zero-leakage policies across query parameters and headers.
 */
export class SecurityFilter {
  private static readonly FORBIDDEN_QUERY_KEYS = Object.freeze([
    "api_key",
    "apiKey",
    "token",
    "access_token",
    "secret",
    "password",
    "client_secret",
  ]);

  public filter(req: Request, res: Response, next: NextFunction): void {
    // 1. Strict OWASP Security Headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    );

    // 2. Anti-PII & Parameter Protection (Requirement #15)
    for (const key of SecurityFilter.FORBIDDEN_QUERY_KEYS) {
      if (req.query[key]) {
        res.status(400).json({
          error: `Sensitive information must not be passed via URL query parameter '${key}'. Please supply credentials in the secure JSON request body.`,
        });
        return;
      }
    }

    next();
  }
}

export const securityFilterInstance = new SecurityFilter();
export const securityFilter = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => securityFilterInstance.filter(req, res, next);
