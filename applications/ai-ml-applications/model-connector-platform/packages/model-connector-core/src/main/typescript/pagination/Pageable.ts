export type SortDirection = "ASC" | "DESC";

export interface SortOrder {
  readonly field: string;
  readonly direction: SortDirection;
}

export interface Pageable {
  readonly pageNumber: number; // 0-based page index
  readonly pageSize: number;   // number of items per page
  readonly sort?: SortOrder;
  readonly offset: number;
}

export class PageRequest implements Pageable {
  public readonly pageNumber: number;
  public readonly pageSize: number;
  public readonly sort?: SortOrder;
  public readonly offset: number;

  private constructor(pageNumber: number, pageSize: number, sort?: SortOrder) {
    this.pageNumber = Math.max(0, pageNumber);
    this.pageSize = Math.max(1, Math.min(pageSize, 500)); // Guardrails [1, 500]
    this.sort = sort;
    this.offset = this.pageNumber * this.pageSize;
  }

  public static of(
    pageNumber: number = 0,
    pageSize: number = 20,
    sortField?: string,
    sortDirection: SortDirection = "ASC"
  ): PageRequest {
    const sort = sortField ? { field: sortField, direction: sortDirection } : undefined;
    return new PageRequest(pageNumber, pageSize, sort);
  }

  public next(): PageRequest {
    return new PageRequest(this.pageNumber + 1, this.pageSize, this.sort);
  }

  public previousOrFirst(): PageRequest {
    return new PageRequest(Math.max(0, this.pageNumber - 1), this.pageSize, this.sort);
  }
}
