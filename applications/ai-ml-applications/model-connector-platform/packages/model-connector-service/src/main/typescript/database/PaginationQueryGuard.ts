import { ServiceConstant } from "@/constants/index";

export interface PaginationCriteria {
  readonly limit: number;
  readonly offset: number;
}

/**
 * Performance & Security Query Governance Guard.
 * Enforces safe bounded limits and offsets across all database queries to prevent
 * unbounded million-record queries and memory exhaustion.
 */
export class PaginationQueryGuard {
  public static sanitizeLimit(
    limit?: unknown,
    defaultLimit: number = ServiceConstant.DEFAULT_QUERY_LIMIT,
    maxLimit: number = ServiceConstant.MAX_QUERY_LIMIT,
  ): number {
    if (limit === undefined || limit === null || limit === "") {
      return defaultLimit;
    }
    const parsed = typeof limit === "number" ? limit : Number(limit);
    if (Number.isNaN(parsed) || parsed < ServiceConstant.MIN_QUERY_LIMIT) {
      return defaultLimit;
    }
    return Math.min(Math.floor(parsed), maxLimit);
  }

  public static sanitizeOffset(
    offset?: unknown,
    defaultOffset: number = ServiceConstant.DEFAULT_OFFSET,
  ): number {
    if (offset === undefined || offset === null || offset === "") {
      return defaultOffset;
    }
    const parsed = typeof offset === "number" ? offset : Number(offset);
    if (Number.isNaN(parsed) || parsed < 0) {
      return defaultOffset;
    }
    return Math.floor(parsed);
  }

  public static resolveCriteria(
    limit?: unknown,
    offset?: unknown,
    defaultLimit: number = ServiceConstant.DEFAULT_QUERY_LIMIT,
  ): PaginationCriteria {
    return {
      limit: this.sanitizeLimit(limit, defaultLimit),
      offset: this.sanitizeOffset(offset),
    };
  }
}
