import { PaginationDialect } from "@/pagination/PaginationDialect.js";
import type { Pageable, SortOrder } from "@/pagination/Pageable.js";

export interface PaginatedSqlResult {
  readonly sql: string;
  readonly params: Record<string, unknown>;
  readonly countSql: string;
}

/**
 * Universal RDBMS Pagination Query Builder.
 * Generates dialect-specific SQL pagination clauses conforming to:
 * - PostgreSQL: LIMIT :pageSize OFFSET :offset
 * - MySQL: LIMIT :offset, :pageSize
 * - Oracle (12c+): OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
 * - SQL Server (2012+): ORDER BY {col} OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
 * - SQLite: LIMIT :pageSize OFFSET :offset
 */
export class PaginationQueryBuilder {
  /**
   * Builds paginated query string for the targeted database dialect.
   */
  public static build(
    baseSql: string,
    pageable: Pageable,
    dialect: PaginationDialect,
    defaultSort?: SortOrder
  ): PaginatedSqlResult {
    const cleanBase = baseSql.trim().replace(/;$/, "");
    const sort = pageable.sort || defaultSort;
    const countSql = `SELECT COUNT(*) AS TOTAL_COUNT FROM (${cleanBase}) AS COUNT_SUBQUERY`;

    let sql = cleanBase;

    // Apply ORDER BY if specified and not already ordered
    if (sort && !cleanBase.toUpperCase().includes("ORDER BY")) {
      sql += ` ORDER BY ${sort.field} ${sort.direction}`;
    }

    switch (dialect) {
      case PaginationDialect.POSTGRESQL:
      case PaginationDialect.SQLITE:
        sql += ` LIMIT ${pageable.pageSize} OFFSET ${pageable.offset}`;
        break;

      case PaginationDialect.MYSQL:
        sql += ` LIMIT ${pageable.offset}, ${pageable.pageSize}`;
        break;

      case PaginationDialect.ORACLE:
        // Oracle 12c+ standard ANSI pagination
        sql += ` OFFSET ${pageable.offset} ROWS FETCH NEXT ${pageable.pageSize} ROWS ONLY`;
        break;

      case PaginationDialect.SQL_SERVER:
        // SQL Server requires an ORDER BY clause for OFFSET...FETCH
        if (!sql.toUpperCase().includes("ORDER BY")) {
          const fallbackCol = sort ? sort.field : "1";
          sql += ` ORDER BY ${fallbackCol} ASC`;
        }
        sql += ` OFFSET ${pageable.offset} ROWS FETCH NEXT ${pageable.pageSize} ROWS ONLY`;
        break;

      default:
        sql += ` LIMIT ${pageable.pageSize} OFFSET ${pageable.offset}`;
    }

    return {
      sql,
      params: {
        limit: pageable.pageSize,
        offset: pageable.offset,
      },
      countSql,
    };
  }

  /**
   * Generates a fast count query stripping ORDER BY for performance.
   */
  public static buildCountSql(baseSql: string): string {
    const clean = baseSql.trim().replace(/;$/, "");
    const withoutOrder = clean.replace(/ORDER\s+BY\s+[\w\s,.]+(ASC|DESC)?/i, "");
    return `SELECT COUNT(*) AS TOTAL_COUNT FROM (${withoutOrder}) AS COUNT_WRAPPER`;
  }
}
