import React, { useState } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import type { UiAuditRecord } from "@/types/ui.types";
import {
  PageHeader,
  StatCard,
  StatCardGrid,
  StatusBadge,
  Pagination,
  EmptyState,
} from "@/components/common";

interface TelemetryPageProps {
  readonly state: ModelConnectorState;
}

export const TelemetryPage: React.FC<TelemetryPageProps> = ({ state }) => {
  const [auditPage, setAuditPage] = useState(1);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const pageSize = 5;

  const paginatedAudit = state.auditLogs.slice((auditPage - 1) * pageSize, auditPage * pageSize);

  const selectedRecord: UiAuditRecord | null =
    (activeRecordId ? state.auditLogs.find((a) => a.id === activeRecordId) : null) ||
    paginatedAudit[0] ||
    state.auditLogs[0] ||
    null;

  const handleSwitchSession = (sessionId?: string) => {
    if (!sessionId) return;
    state.setActiveSessionId(sessionId);
    state.setActiveTab("chat");
  };

  const handleCopy = (text: string) => {
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
  };

  const isSuccessStatus = (status: string) => status === "SUCCESS" || status === "VERIFIED";

  return (
    <div className="desktop-telemetry-view page-stack">
      <PageHeader
        title="Observability & Distributed Telemetry"
        subtitle="Monitor service resilience, active model routing, and W3C distributed trace lineage."
        actions={
          <button
            type="button"
            className="btn-ui-secondary"
            onClick={() => void state.refreshData()}
          >
            🔄 Refresh Logs
          </button>
        }
      />

      <StatCardGrid className="telemetry-cards-grid">
        <StatCard
          label="Core Microservice Health"
          value={state.upstreamHealth.status}
          subtitle={`${state.upstreamHealth.service} (Port 8095)`}
          icon="💚"
          tone="success"
        />
        <StatCard
          label="Total Active Models"
          value={state.models.length}
          subtitle="Gemini, Grok, Copilot, ChatGPT, Claude, Ollama"
          icon="🧩"
          tone="info"
        />
        <StatCard
          label="Active Lineage Sessions"
          value={state.sessions.length}
          subtitle="Multi-turn cookie persistence"
          icon="🔗"
          tone="primary"
        />
        <StatCard
          label="Audit Log Events"
          value={state.auditLogs.length}
          subtitle="Zero PII W3C trace records"
          icon="📡"
          tone="warning"
        />
      </StatCardGrid>

      <section className="audit-table-card ui-surface-card">
        <div className="section-card-header">
          <div>
            <h3>Distributed Audit &amp; Trace Log Trail</h3>
            <p className="section-subtitle">
              Select any record to inspect W3C Trace ID, Span ID, Session ID, and request payload details below.
            </p>
          </div>
        </div>

        {paginatedAudit.length === 0 ? (
          <EmptyState
            icon="📡"
            title="No Audit Trail Records"
            description="Execute a chat prompt or test connection to generate live trace logs."
          />
        ) : (
          <div className="telemetry-table-wrapper">
            <table className="desktop-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Model</th>
                  <th>Session ID</th>
                  <th>Message / Task</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Client IP</th>
                  <th>Timestamp</th>
                  <th>Select</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAudit.map((a) => {
                  const isSelected = selectedRecord?.id === a.id;
                  const success = isSuccessStatus(a.status);
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setActiveRecordId(a.id)}
                      className={`audit-row-hoverable ${isSelected ? "selected-row" : ""}`}
                    >
                      <td className="font-mono col-strong">{a.action || "INFERENCE"}</td>
                      <td>{a.modelUsed || "default"}</td>
                      <td className="col-truncate-sm" title={a.sessionId}>
                        {a.sessionId ? <code>{a.sessionId.slice(0, 10)}...</code> : "—"}
                      </td>
                      <td className="col-truncate-md" title={a.message}>
                        {a.message || "—"}
                      </td>
                      <td>
                        <StatusBadge
                          label={a.status}
                          tone={success ? "success" : "danger"}
                          showDot
                        />
                      </td>
                      <td>{a.latencyMs}ms</td>
                      <td className="font-mono">{a.clientIp || "127.0.0.1"}</td>
                      <td>{new Date(a.timestamp).toLocaleTimeString()}</td>
                      <td>
                        <button
                          type="button"
                          className={`btn-ui-secondary btn-xs ${isSelected ? "active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveRecordId(a.id);
                          }}
                        >
                          {isSelected ? "Active ✔" : "Inspect"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

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
      </section>

      {selectedRecord && (
        <section className="audit-detail-panel-card ui-surface-card">
          <div className="detail-panel-header">
            <div className="detail-title-group">
              <span className="detail-icon" aria-hidden="true">🔬</span>
              <div>
                <h3>Selected Telemetry Record Details</h3>
                <span className="detail-id">Record ID: {selectedRecord.id}</span>
              </div>
              <StatusBadge
                label={selectedRecord.status}
                tone={isSuccessStatus(selectedRecord.status) ? "success" : "danger"}
                showDot
              />
            </div>
            <span className="detail-timestamp">
              Recorded: {new Date(selectedRecord.timestamp).toLocaleString()}
            </span>
          </div>

          <div className="detail-metrics-grid">
            <div className="detail-metric-box">
              <span className="metric-key">Action</span>
              <span className="metric-val">{selectedRecord.action}</span>
            </div>
            <div className="detail-metric-box">
              <span className="metric-key">Target Model</span>
              <span className="metric-val accent">{selectedRecord.modelUsed}</span>
            </div>
            <div className="detail-metric-box">
              <span className="metric-key">Latency &amp; Timing</span>
              <span className="metric-val success">⚡ {selectedRecord.latencyMs} ms</span>
            </div>
            <div className="detail-metric-box">
              <span className="metric-key">Client IP Address</span>
              <span className="metric-val font-mono">{selectedRecord.clientIp || "127.0.0.1"}</span>
            </div>
          </div>

          <div className="trace-correlation-box">
            <div className="trace-box-title">📡 Distributed W3C Tracing &amp; Lineage Correlation</div>
            <div className="trace-ids-grid">
              <div className="trace-id-item">
                <span className="trace-label">Session ID:</span>
                <div className="trace-value-group">
                  <code>{selectedRecord.sessionId || "None"}</code>
                  {selectedRecord.sessionId && (
                    <>
                      <button
                        type="button"
                        className="btn-icon-ghost"
                        onClick={() => handleCopy(selectedRecord.sessionId || "")}
                        title="Copy Session ID"
                      >
                        📋
                      </button>
                      <button
                        type="button"
                        className="btn-ui-secondary btn-xs"
                        onClick={() => handleSwitchSession(selectedRecord.sessionId)}
                      >
                        Open Chat
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="trace-id-item">
                <span className="trace-label">Trace ID (W3C):</span>
                <div className="trace-value-group">
                  <code>{selectedRecord.traceId || `trace-${selectedRecord.id}`}</code>
                  <button
                    type="button"
                    className="btn-icon-ghost"
                    onClick={() => handleCopy(selectedRecord.traceId || `trace-${selectedRecord.id}`)}
                    title="Copy Trace ID"
                  >
                    📋
                  </button>
                </div>
              </div>

              <div className="trace-id-item">
                <span className="trace-label">Span ID:</span>
                <div className="trace-value-group">
                  <code>{selectedRecord.spanId || `span-${selectedRecord.id.slice(0, 8)}`}</code>
                  <button
                    type="button"
                    className="btn-icon-ghost"
                    onClick={() => handleCopy(selectedRecord.spanId || `span-${selectedRecord.id.slice(0, 8)}`)}
                    title="Copy Span ID"
                  >
                    📋
                  </button>
                </div>
              </div>

              <div className="trace-id-item">
                <span className="trace-label">Correlation ID:</span>
                <div className="trace-value-group">
                  <code>{selectedRecord.correlationId || "—"}</code>
                  {selectedRecord.correlationId && (
                    <button
                      type="button"
                      className="btn-icon-ghost"
                      onClick={() => handleCopy(selectedRecord.correlationId || "")}
                      title="Copy Correlation ID"
                    >
                      📋
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="payload-comparison-grid">
            <div className="payload-box">
              <div className="payload-box-label">⚡ Prompt / Request Payload</div>
              <div className="payload-box-content">
                {selectedRecord.message || "No prompt message recorded."}
              </div>
            </div>

            <div className="payload-box">
              <div className="payload-box-label">🤖 Response Status &amp; Message</div>
              <div className={`payload-box-content ${selectedRecord.errorMessage ? "is-error" : "is-success"}`}>
                {selectedRecord.errorMessage ||
                  `Inference succeeded with status ${selectedRecord.status}. Latency: ${selectedRecord.latencyMs}ms.`}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
