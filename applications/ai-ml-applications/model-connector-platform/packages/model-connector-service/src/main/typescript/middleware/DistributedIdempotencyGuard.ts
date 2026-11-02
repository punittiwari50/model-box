import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "@/constants/index";

export interface IdempotencyRecord {
  readonly status: "IN_FLIGHT" | "COMPLETED" | "FAILED";
  readonly createdAtMs: number;
  readonly statusCode?: number;
  readonly body?: unknown;
}

/**
 * Enterprise Distributed Idempotency Guard Middleware.
 * Conforms to:
 * - HLD §21 & LLD §17: Tri-Tier Request De-duplication Engine
 * - STD-COD-007: Resilient Error Handling & Idempotent Safety
 */
export class DistributedIdempotencyGuard {
  private static readonly registry = new Map<string, IdempotencyRecord>();
  private static readonly TTL_MS = 60000; // 60 seconds TTL

  public static middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const key = (req.headers["idempotency-key"] || req.headers["x-idempotency-key"]) as string | undefined;
      if (!key) {
        return next();
      }

      this.cleanupExpiredKeys();
      const existing = this.registry.get(key);

      if (existing) {
        if (existing.status === "IN_FLIGHT") {
          res.status(HttpStatus.CONFLICT).json({
            success: false,
            error: {
              code: "IDEMPOTENT_OPERATION_IN_FLIGHT",
              message: "Your action is already processing in the background. Please do not re-submit.",
              idempotencyKey: key,
            },
          });
          return;
        }

        if (existing.status === "COMPLETED" && existing.body !== undefined) {
          res.setHeader("X-Cache-Lookup", "HIT");
          res.status(existing.statusCode || HttpStatus.OK).json(existing.body);
          return;
        }
      }

      // Mark request as IN_FLIGHT
      this.registry.set(key, {
        status: "IN_FLIGHT",
        createdAtMs: Date.now(),
      });

      this.interceptResponse(res, key);
      next();
    };
  }

  public static getRecord(key: string): IdempotencyRecord | undefined {
    return this.registry.get(key);
  }

  public static clear(): void {
    this.registry.clear();
  }

  private static interceptResponse(res: Response, key: string): void {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      DistributedIdempotencyGuard.registry.set(key, {
        status: res.statusCode >= 400 ? "FAILED" : "COMPLETED",
        statusCode: res.statusCode,
        body,
        createdAtMs: Date.now(),
      });
      return originalJson(body);
    };
  }

  private static cleanupExpiredKeys(): void {
    const now = Date.now();
    for (const [key, record] of this.registry.entries()) {
      if (now - record.createdAtMs > this.TTL_MS) {
        this.registry.delete(key);
      }
    }
  }
}

export const idempotencyGuardMiddleware = DistributedIdempotencyGuard.middleware();
