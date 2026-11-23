import React, { useState } from "react";
import type { UiAuditRecord } from "@/types/ui.types";
import { Pagination, StatusBadge } from "@/components/common";

interface AuditLogViewerProps {
  readonly logs: readonly UiAuditRecord[];
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ logs }) => {
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const paginatedLogs = logs.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="ui-surface-card page-stack">
      <div className="section-card-header">
        <div>
          <h3>Compliance &amp; Governance Distributed Audit Trail</h3>
          <p className="section-subtitle">
            Immutable records synchronized with distributed trace and correlation telemetry
          </p>
        </div>
      </div>

      <div className="telemetry-table-wrapper">
        <table className="desktop-table">
          <thead>
            <tr>
              <th>Audit ID</th>
              <th>Action</th>
              <th>Model</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Client IP</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLogs.map((log) => (
              <tr key={log.id}>
                <td className="font-mono">{log.id.slice(0, 12)}...</td>
                <td className="font-mono col-strong">{log.action || "INFERENCE"}</td>
                <td>{log.modelUsed || "default"}</td>
                <td>
                  <StatusBadge label={log.status} tone="success" showDot />
                </td>
                <td>{log.latencyMs}ms</td>
                <td className="font-mono">{log.clientIp || "127.0.0.1"}</td>
                <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
              </tr>
            ))}

            {logs.length === 0 && (
              <tr>
                <td colSpan={7}>No audit records available.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={logs.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        pageSizeOptions={[5, 10, 20, 50]}
        itemName="records"
        className="audit-pagination"
        ariaLabel="Audit Log Telemetry Navigation"
      />
    </div>
  );
};
