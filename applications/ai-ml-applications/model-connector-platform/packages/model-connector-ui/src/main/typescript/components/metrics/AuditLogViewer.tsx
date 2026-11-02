import React, { useState } from "react";
import type { UiAuditRecord } from "@/types/ui.types";
import { AuditPagination } from "@/components/metrics/AuditPagination";

interface AuditLogViewerProps {
  readonly logs: readonly UiAuditRecord[];
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ logs }) => {
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const paginatedLogs = logs.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      <div>
        <h3 style={{ fontSize: "1.1rem" }}>Compliance & Governance Distributed Audit Trail</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Immutable records synchronized with distributed trace and correlation telemetry
        </p>
      </div>

      <div style={{ overflowX: "auto", width: "100%" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-glass)", color: "var(--text-muted)" }}>
              <th style={{ padding: "10px" }}>Audit ID</th>
              <th style={{ padding: "10px" }}>Action</th>
              <th style={{ padding: "10px" }}>Model</th>
              <th style={{ padding: "10px" }}>Status</th>
              <th style={{ padding: "10px" }}>Latency</th>
              <th style={{ padding: "10px" }}>Client IP</th>
              <th style={{ padding: "10px" }}>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLogs.map((log) => (
              <tr key={log.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <td style={{ padding: "10px", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {log.id.slice(0, 12)}...
                </td>
                <td style={{ padding: "10px", fontFamily: "var(--font-mono)", color: "var(--cyan-primary)" }}>
                  {log.action || "INFERENCE"}
                </td>
                <td style={{ padding: "10px" }}>{log.modelUsed || "default"}</td>
                <td style={{ padding: "10px" }}>
                  <span className="glass-pill" style={{ padding: "2px 8px", fontSize: "0.75rem", color: "var(--emerald-primary)" }}>
                    {log.status}
                  </span>
                </td>
                <td style={{ padding: "10px" }}>{log.latencyMs}ms</td>
                <td style={{ padding: "10px", fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {log.clientIp || "127.0.0.1"}
                </td>
                <td style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </td>
              </tr>
            ))}

            {logs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                  No audit records available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AuditPagination
        currentPage={page}
        totalPages={totalPages}
        totalLogs={logs.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        pageSizeOptions={[5, 10, 20, 50]}
      />
    </div>
  );
};
