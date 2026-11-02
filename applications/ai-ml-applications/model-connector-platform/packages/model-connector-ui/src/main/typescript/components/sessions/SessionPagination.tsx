import React from "react";
import { Pagination } from "@/components/common/Pagination";

export interface SessionPaginationProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly totalSessions: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly pageSizeOptions?: readonly number[];
}

/**
 * Session Lineage pagination wrapper reusing the universal Pagination component.
 */
export const SessionPagination: React.FC<SessionPaginationProps> = ({
  totalSessions,
  ...props
}) => (
  <Pagination
    totalItems={totalSessions}
    itemName="sessions"
    className="session-pagination"
    ariaLabel="Session Lineage Navigation"
    {...props}
  />
);
