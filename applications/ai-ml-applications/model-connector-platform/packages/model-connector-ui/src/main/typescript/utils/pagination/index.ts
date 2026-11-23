export const PaginationConstants = {
  DEFAULT_CATEGORY_PAGE_SIZE: 12,
  CATEGORY_MODEL_PAGINATION_THRESHOLD: 25,
  DEFAULT_CATEGORY_MODEL_PAGE_SIZE: 25,
  DEFAULT_PAGE_SIZE_OPTIONS: [6, 12, 24] as const,
} as const;

export interface BasePaginationProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly pageSizeOptions?: readonly number[];
}

export { Pagination } from "@/components/common/Pagination";
export type { PaginationProps } from "@/components/common/Pagination";
