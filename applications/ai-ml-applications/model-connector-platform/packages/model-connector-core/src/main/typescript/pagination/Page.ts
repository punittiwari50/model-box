import type { Pageable } from "@/pagination/Pageable.js";

export interface Page<T> {
  readonly content: readonly T[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly pageNumber: number;
  readonly pageSize: number;
  readonly numberOfElements: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  map<U>(converter: (item: T) => U): Page<U>;
}

export class PageImpl<T> implements Page<T> {
  public readonly content: readonly T[];
  public readonly totalElements: number;
  public readonly totalPages: number;
  public readonly pageNumber: number;
  public readonly pageSize: number;
  public readonly numberOfElements: number;
  public readonly isFirst: boolean;
  public readonly isLast: boolean;
  public readonly hasNext: boolean;
  public readonly hasPrevious: boolean;

  constructor(content: readonly T[], totalElements: number, pageable: Pageable) {
    this.content = Object.freeze([...content]);
    this.totalElements = Math.max(0, totalElements);
    this.pageNumber = pageable.pageNumber;
    this.pageSize = pageable.pageSize;
    this.numberOfElements = content.length;
    this.totalPages = this.pageSize === 0 ? 1 : Math.ceil(this.totalElements / this.pageSize);
    this.isFirst = this.pageNumber === 0;
    this.isLast = this.pageNumber >= this.totalPages - 1;
    this.hasNext = this.pageNumber < this.totalPages - 1;
    this.hasPrevious = this.pageNumber > 0;
  }

  public map<U>(converter: (item: T) => U): Page<U> {
    const mapped = this.content.map(converter);
    return new PageImpl<U>(mapped, this.totalElements, {
      pageNumber: this.pageNumber,
      pageSize: this.pageSize,
      offset: this.pageNumber * this.pageSize,
    });
  }

  public static empty<T>(pageable: Pageable): Page<T> {
    return new PageImpl<T>([], 0, pageable);
  }
}
