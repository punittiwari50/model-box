import React from "react";

export interface PaginationProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly totalItems: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly pageSizeOptions?: readonly number[];
  readonly itemName?: string;
  readonly ariaLabel?: string;
  readonly className?: string;
}

/**
 * Universal accessible single pagination component reused across models, sessions, and telemetry trails.
 */
export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [6, 12, 24],
  itemName = "models",
  ariaLabel = "Pagination Navigation",
  className = "",
}) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);
  const displayStart = Math.min(startItem, endItem);

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (safeTotalPages <= maxVisible) {
      for (let i = 1; i <= safeTotalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);
    const start = Math.max(2, safeCurrentPage - 1);
    const end = Math.min(safeTotalPages - 1, safeCurrentPage + 1);

    if (start > 2) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < safeTotalPages - 1) pages.push("...");
    pages.push(safeTotalPages);

    return pages;
  };

  return (
    <nav className={`pagination-container ${className}`.trim()} aria-label={ariaLabel}>
      <div className="pagination-meta">
        <span className="pagination-info">
          Showing {itemName} <strong className="pagination-highlight">{displayStart}</strong> to{" "}
          <strong className="pagination-highlight">{endItem}</strong> of{" "}
          <strong className="pagination-highlight">{totalItems}</strong> {itemName}
        </span>

        {onPageSizeChange && (
          <div className="pagination-size-selector">
            <label htmlFor="pagination-size-select">Per page:</label>
            <select
              id="pagination-size-select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="pagination-select"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn pagination-prev"
          onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
          disabled={safeCurrentPage <= 1}
          aria-label={`Previous ${itemName} page`}
        >
          &lt; Prev
        </button>

        <div className="pagination-pages" role="group" aria-label={`${itemName} page numbers`}>
          {getPageNumbers().map((p, idx) =>
            typeof p === "number" ? (
              <button
                key={`page-${p}`}
                type="button"
                className={`pagination-btn pagination-page-btn ${p === safeCurrentPage ? "active" : ""}`}
                onClick={() => onPageChange(p)}
                aria-current={p === safeCurrentPage ? "page" : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </button>
            ) : (
              <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                {p}
              </span>
            )
          )}
        </div>

        <button
          type="button"
          className="pagination-btn pagination-next"
          onClick={() => onPageChange(Math.min(safeTotalPages, safeCurrentPage + 1))}
          disabled={safeCurrentPage >= safeTotalPages}
          aria-label={`Next ${itemName} page`}
        >
          Next &gt;
        </button>
      </div>
    </nav>
  );
};
