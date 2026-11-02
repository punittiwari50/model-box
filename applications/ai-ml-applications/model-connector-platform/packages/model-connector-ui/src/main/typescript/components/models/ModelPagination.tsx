import React from "react";
import { Pagination } from "@/components/common/Pagination";

export interface ModelPaginationProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly totalModels: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly pageSizeOptions?: readonly number[];
}

/**
 * Model Catalog pagination wrapper reusing the universal Pagination component.
 */
export const ModelPagination: React.FC<ModelPaginationProps> = ({
  totalModels,
  ...props
}) => (
  <Pagination
    totalItems={totalModels}
    itemName="models"
    className="model-pagination"
    ariaLabel="Model Catalog Navigation"
    {...props}
  />
);
