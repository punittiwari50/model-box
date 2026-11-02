import React from "react";
import { Pagination } from "@/components/common/Pagination";

export interface AuditPaginationProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly totalLogs: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly pageSizeOptions?: readonly number[];
}

/**
 * Telemetry Audit Trail pagination wrapper reusing the universal Pagination component.
 */
export const AuditPagination: React.FC<AuditPaginationProps> = ({
  totalLogs,
  ...props
}) => (
  <Pagination
    totalItems={totalLogs}
    itemName="records"
    className="audit-pagination"
    ariaLabel="Audit Log Telemetry Navigation"
    {...props}
  />
);
