import React, { useState } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { Pagination } from "@/components/common/Pagination";

interface DesktopTelemetryPageProps {
  readonly state: ModelConnectorState;
}

export const DesktopTelemetryPage: React.FC<DesktopTelemetryPageProps> = ({ state }) => {
  const [auditPage, setAuditPage] = useState(1);
  const pageSize = 5;

  const paginatedAudit = state.auditLogs.slice((auditPage - 1) * pageSize, auditPage * pageSize);

  return (
    <div className="desktop-telemetry-view">
      <div className="telemetry-cards-grid">
        <div className="telemetry-card">
          <div className="card-label">Core Microservice Health</div>
          <div className="card-value green">{state.upstreamHealth.status}</div>
          <div className="card-sub">{state.upstreamHealth.service} (Port 8095)</div>
        </div>

        <div className="telemetry-card">
          <div className="card-label">Total Active Models</div>
          <div className="card-value cyan">{state.models.length}</div>
          <div className="card-sub">Gemini, Grok, Copilot, ChatGPT, Claude, Ollama</div>
        </div>

        <div className="telemetry-card">
          <div className="card-label">Active Lineage Sessions</div>
          <div className="card-value emerald">{state.sessions.length}</div>
          <div className="card-sub">Multi-turn cookie persistence</div>
        </div>

        <div className="telemetry-card">
          <div className="card-label">Audit Log Events</div>
          <div className="card-value purple">{state.auditLogs.length}</div>
          <div className="card-sub">Zero PII W3C trace records</div>
        </div>
      </div>

      <div className="audit-table-card">
        <h3>Distributed Audit & Trace Log Trail</h3>
        <table className="desktop-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Model</th>
              <th>Message / Task</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Client IP</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {paginatedAudit.map((a) => (
              <tr key={a.id}>
                <td className="font-mono">{a.action || "INFERENCE"}</td>
                <td>{a.modelUsed || "default"}</td>
                <td style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.message}>
                  {a.message || "—"}
                </td>
                <td>
                  <span className="status-pill active">{a.status}</span>
                </td>
                <td>{a.latencyMs}ms</td>
                <td>{a.clientIp || "127.0.0.1"}</td>
                <td>{new Date(a.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination
          currentPage={auditPage}
          totalPages={Math.max(1, Math.ceil(state.auditLogs.length / pageSize))}
          totalItems={state.auditLogs.length}
          pageSize={pageSize}
          onPageChange={setAuditPage}
          itemName="records"
          className="audit-pagination"
          ariaLabel="Audit Log Telemetry Navigation"
        />
      </div>
    </div>
  );
};
