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
    "apikey",
    "token",
    "access_token",
    "id_token",
    "refresh_token",
    "auth_token",
    "bearer",
    "secret",
    "password",
    "client_secret",
    "email",
    "account_email",
    "user_email",
    "username",
    "phone",
    "mobile",
    "ssn",
    "dob",
    "first_name",
    "last_name",
    "full_name",
  ]);

  public filter(req: Request, res: Response, next: NextFunction): void {
    // 1. Strict OWASP Security Headers (Zero PII leakage via Referrer)
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    );

    // 2. Anti-PII & Parameter Protection: strictly forbid PII in URL query parameters
    const incomingQueryKeys = Object.keys(req.query || {});
    for (const rawKey of incomingQueryKeys) {
      const lowerKey = rawKey.toLowerCase().replace(/[-_]/g, "");
      const isForbidden = SecurityFilter.FORBIDDEN_QUERY_KEYS.some(
        (forbidden) => forbidden.replace(/[-_]/g, "") === lowerKey,
      );
      if (isForbidden) {
        res.status(400).json({
          error: `Sensitive information or PII must not be passed via URL query parameter '${rawKey}'. Supply data via secure request body.`,
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
