import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { getClientIp } from "@/core/web/helper/responseHelper.js";

interface CachedResponse {
  readonly statusCode: number;
  readonly body: any;
  readonly timestamp: number;
}

/**
 * Enterprise Idempotency Middleware.
 * Conforms to Requirement #16 (All requests must be idempotent).
 * Supports Idempotency-Key header and request body hashing with replay protection.
 */
export class IdempotencyFilter {
  private static readonly cache = new Map<string, CachedResponse>();
  private static readonly TTL_MS = 60000; // 1 minute window
  private static readonly MAX_ENTRIES = 500;

  public static handle(req: Request, res: Response, next: NextFunction): void {
    // Only apply idempotency to state-mutating requests (POST, PUT, PATCH, DELETE)
    if (
      req.method === "GET" ||
      req.method === "HEAD" ||
      req.method === "OPTIONS"
    ) {
      next();
      return;
    }

    const explicitKey = req.headers["idempotency-key"] as string | undefined;
    const clientIp = getClientIp(req);
    const bodyHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(req.body || {}))
      .digest("hex")
      .slice(0, 16);
    const key = `idemp:${clientIp}:${req.originalUrl}:${explicitKey || bodyHash}`;

    // Check existing cache
    const existing = IdempotencyFilter.cache.get(key);
    if (
      existing &&
      Date.now() - existing.timestamp < IdempotencyFilter.TTL_MS
    ) {
      res.setHeader("X-Cache-Lookup", "HIT");
      res.setHeader("X-Idempotent-Replay", "true");
      res.status(existing.statusCode).json(existing.body);
      return;
    }

    // Intercept outgoing json
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (IdempotencyFilter.cache.size >= IdempotencyFilter.MAX_ENTRIES) {
          const oldestKey = IdempotencyFilter.cache.keys().next().value;
          if (oldestKey) IdempotencyFilter.cache.delete(oldestKey);
        }
        IdempotencyFilter.cache.set(key, {
          statusCode: res.statusCode,
          body,
          timestamp: Date.now(),
        });
      }
      return originalJson(body);
    };

    next();
  }
}
