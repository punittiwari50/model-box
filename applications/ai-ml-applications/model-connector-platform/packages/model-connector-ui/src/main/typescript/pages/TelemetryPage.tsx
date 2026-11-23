import React, { useState, useMemo, useEffect } from "react";
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
import { AuditTelemetryDetailPage } from "@/components/telemetry/AuditTelemetryDetailPage";

interface TelemetryPageProps {
  readonly state: ModelConnectorState;
}

type StatusFilterType = "ALL" | "SUCCESS" | "FAILED";

export const TelemetryPage: React.FC<TelemetryPageProps> = ({ state }) => {
  const [auditPage, setAuditPage] = useState(1);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    return state.routeParams.traceId || state.routeParams.correlationId || "";
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>("ALL");
  const [modelFilter, setModelFilter] = useState<string>("ALL");
  const pageSize = 5;

  // Auto-refresh audit logs on mount or navigation to this tab
  useEffect(() => {
    void state.refreshAuditLogs();
  }, [state.activeTab]);

  // Reset detail inspector when top navigation menu or tabResetNonce changes
  useEffect(() => {
    setActiveRecordId(null);
  }, [state.activeTab, state.tabResetNonce]);

  // Sync external routeParams if traceId or correlationId is passed
  useEffect(() => {
    const routeTrace = state.routeParams.traceId || state.routeParams.correlationId;
    if (routeTrace && routeTrace !== searchQuery) {
      setSearchQuery(routeTrace);
      setAuditPage(1);
    }
  }, [state.routeParams.traceId, state.routeParams.correlationId]);

  const isSuccessStatus = (status: string) => status === "SUCCESS" || status === "VERIFIED";

  // Unique model list for dropdown filter
  const availableModels = useMemo(() => {
    const set = new Set<string>();
    for (const log of state.auditLogs) {
      if (log.modelUsed) set.add(log.modelUsed);
    }
    return Array.from(set).sort();
  }, [state.auditLogs]);

  // Filtered audit records based on Trace ID, Correlation ID, Model, Action, Status, and Query
  const filteredAudit = useMemo(() => {
    let logs = state.auditLogs;

    if (statusFilter === "SUCCESS") {
      logs = logs.filter((l) => isSuccessStatus(l.status));
    } else if (statusFilter === "FAILED") {
      logs = logs.filter((l) => !isSuccessStatus(l.status));
    }

    if (modelFilter !== "ALL") {
      logs = logs.filter((l) => (l.modelUsed || "").toLowerCase() === modelFilter.toLowerCase());
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      logs = logs.filter((l) => {
        const traceMatch = (l.traceId || "").toLowerCase().includes(q);
        const corrMatch = (l.correlationId || "").toLowerCase().includes(q);
        const spanMatch = (l.spanId || "").toLowerCase().includes(q);
        const sessMatch = (l.sessionId || "").toLowerCase().includes(q);
        const modelMatch = (l.modelUsed || "").toLowerCase().includes(q);
        const actionMatch = (l.action || "").toLowerCase().includes(q);
        const msgMatch = (l.message || "").toLowerCase().includes(q);
        const statusMatch = (l.status || "").toLowerCase().includes(q);
        const stratMatch = (l.strategyMode || "").toLowerCase().includes(q);
        const idMatch = (l.id || "").toLowerCase().includes(q);
        return (
          traceMatch ||
          corrMatch ||
          spanMatch ||
          sessMatch ||
          modelMatch ||
          actionMatch ||
          msgMatch ||
          statusMatch ||
          stratMatch ||
          idMatch
        );
      });
    }

    return logs;
  }, [state.auditLogs, statusFilter, modelFilter, searchQuery]);

  const inspectingRecordId = state.activeAuditRecordId || activeRecordId;
  const activeRecord: UiAuditRecord | null = inspectingRecordId
    ? state.auditLogs.find((a) => a.id === inspectingRecordId) || null
    : null;

  const totalPages = Math.max(1, Math.ceil(filteredAudit.length / pageSize));
  const paginatedAudit = filteredAudit.slice((auditPage - 1) * pageSize, auditPage * pageSize);

  const selectedRecord: UiAuditRecord | null =
    (activeRecordId ? state.auditLogs.find((a) => a.id === activeRecordId) : null) ||
    paginatedAudit[0] ||
    filteredAudit[0] ||
    state.auditLogs[0] ||
    null;

  const handleCopy = (text: string, id?: string) => {
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
    const key = id || text;
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSwitchSession = (sessionId?: string) => {
    if (sessionId) {
      state.setActiveSessionId(sessionId);
      state.setActiveTab("chat");
    }
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setModelFilter("ALL");
    setAuditPage(1);
  };

  const isTraceSearch = Boolean(
    searchQuery.trim() &&
    (searchQuery.length >= 12 || /^[a-f0-9-]+$/i.test(searchQuery.trim())),
  );

  // When a record is selected for inspection, render the full Detail Page (Not a Modal!)
  if (activeRecord) {
    return (
      <AuditTelemetryDetailPage
        record={activeRecord}
        onBack={() => {
          setActiveRecordId(null);
          state.setActiveAuditRecordId(null);
        }}
        state={state}
      />
    );
  }

  return (
    <div className="desktop-telemetry-view page-stack">
      <PageHeader
        title="Observability & Distributed Telemetry"
        subtitle="Monitor service resilience, active model routing, and W3C distributed trace lineage."
        actions={
          <button
            type="button"
            className="btn-ui-secondary"
            onClick={() => void state.refreshAuditLogs()}
            title="Refresh latest telemetry trace logs from server"
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

      {/* Search Toolbar for Trace ID, Correlation ID, Model & Status */}
      <section className="telemetry-filter-bar ui-surface-card">
        <div className="telemetry-search-group">
          <div className="telemetry-search-input-wrapper">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="telemetry-search-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setAuditPage(1);
              }}
              placeholder="Search by W3C Trace ID, Correlation ID, Model, Action..."
              data-testid="telemetry-trace-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setSearchQuery("");
                  setAuditPage(1);
                }}
                title="Clear search query"
              >
                ✕
              </button>
            )}
          </div>

          {isTraceSearch && (
            <span className="trace-search-badge" title="Searching across W3C Trace IDs and Correlation IDs">
              ⚡ Trace ID Filter Active
            </span>
          )}
        </div>

        <div className="telemetry-filter-controls">
          <div className="status-filter-pills" role="radiogroup" aria-label="Filter by execution status">
            <button
              type="button"
              className={`filter-pill-btn ${statusFilter === "ALL" ? "active" : ""}`}
              onClick={() => {
                setStatusFilter("ALL");
                setAuditPage(1);
              }}
            >
              All ({state.auditLogs.length})
            </button>
            <button
              type="button"
              className={`filter-pill-btn success ${statusFilter === "SUCCESS" ? "active" : ""}`}
              onClick={() => {
                setStatusFilter("SUCCESS");
                setAuditPage(1);
              }}
            >
              ✔ Success ({state.auditLogs.filter((l) => isSuccessStatus(l.status)).length})
            </button>
            <button
              type="button"
              className={`filter-pill-btn danger ${statusFilter === "FAILED" ? "active" : ""}`}
              onClick={() => {
                setStatusFilter("FAILED");
                setAuditPage(1);
              }}
            >
              ⚠️ Failed ({state.auditLogs.filter((l) => !isSuccessStatus(l.status)).length})
            </button>
          </div>

          {availableModels.length > 0 && (
            <div className="model-filter-wrapper">
              <label htmlFor="telemetry-model-select" className="filter-label">Model:</label>
              <select
                id="telemetry-model-select"
                className="telemetry-model-select"
                value={modelFilter}
                onChange={(e) => {
                  setModelFilter(e.target.value);
                  setAuditPage(1);
                }}
              >
                <option value="ALL">All Models</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {(searchQuery || statusFilter !== "ALL" || modelFilter !== "ALL") && (
            <button
              type="button"
              className="btn-ui-ghost btn-xs clear-all-filter-btn"
              onClick={handleClearFilters}
              title="Reset all search filters"
            >
              ✕ Reset Filters
            </button>
          )}
        </div>

        <div className="telemetry-results-summary">
          <span>
            Showing <strong>{filteredAudit.length}</strong> of <strong>{state.auditLogs.length}</strong> telemetry records
          </span>
        </div>
      </section>

      {/* Main Table */}
      <section className="audit-table-card ui-surface-card">
        <div className="section-card-header">
          <div>
            <h3>Distributed Audit &amp; Trace Log Trail</h3>
            <p className="section-subtitle">
              Select any record or click Inspect to view full W3C Trace ID, Span ID, Session ID, and request/response payloads.
            </p>
          </div>
        </div>

        {filteredAudit.length === 0 ? (
          <EmptyState
            icon="📡"
            title={state.auditLogs.length === 0 ? "No Audit Trail Records" : "No Matching Telemetry Records"}
            description={
              state.auditLogs.length === 0
                ? "Execute a chat prompt or test connection to generate live trace logs."
                : `No logs matched query "${searchQuery || statusFilter}". Try adjusting your filters.`
            }
            action={
              (searchQuery || statusFilter !== "ALL" || modelFilter !== "ALL") ? (
                <button
                  type="button"
                  className="btn-ui-secondary btn-sm"
                  onClick={handleClearFilters}
                >
                  Clear Filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="telemetry-table-wrapper">
            <table className="desktop-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Model</th>
                  <th>W3C Trace ID</th>
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
                  const displaySessionId =
                    a.sessionId ||
                    `sess-${(a.modelUsed || "default").replace(/[^a-zA-Z0-9]/g, "-")}-${(a.correlationId || a.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`;
                  const displayTraceId = a.traceId || a.correlationId || "—";

                  return (
                    <tr
                      key={a.id}
                      onClick={() => {
                        setActiveRecordId(a.id);
                        state.setActiveAuditRecordId(a.id);
                      }}
                      className={`audit-row-hoverable ${isSelected ? "selected-row" : ""}`}
                      title="Click to view full Detail Page"
                    >
                      <td className="font-mono col-strong">{a.action || "INFERENCE"}</td>
                      <td>{a.modelUsed || "default"}</td>
                      <td className="col-trace-cell">
                        <div className="trace-id-row">
                          <code className="font-mono trace-id-text" title={displayTraceId}>
                            {displayTraceId.length > 20
                              ? `${displayTraceId.slice(0, 16)}...`
                              : displayTraceId}
                          </code>
                          {displayTraceId !== "—" && (
                            <button
                              type="button"
                              className="btn-copy-mini"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(displayTraceId, `trace-${a.id}`);
                              }}
                              title="Copy W3C Trace ID"
                            >
                              {copiedId === `trace-${a.id}` ? "✔" : "📋"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="col-session-cell">
                        <div className="session-id-row">
                          <code className="font-mono session-id-text" title={displaySessionId}>
                            {displaySessionId.length > 20
                              ? `${displaySessionId.slice(0, 16)}...`
                              : displaySessionId}
                          </code>
                          <button
                            type="button"
                            className="btn-copy-mini"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(displaySessionId, `sess-${a.id}`);
                            }}
                            title="Copy Session ID"
                          >
                            {copiedId === `sess-${a.id}` ? "✔" : "📋"}
                          </button>
                        </div>
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
                      <td>{new Date(a.timestamp).toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-ui-primary btn-xs btn-inspect-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveRecordId(a.id);
                            state.setActiveAuditRecordId(a.id);
                          }}
                          title="Open full Detail Page"
                        >
                          🔬 Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredAudit.length > pageSize && (
          <Pagination
            currentPage={auditPage}
            totalPages={totalPages}
            totalItems={filteredAudit.length}
            pageSize={pageSize}
            onPageChange={setAuditPage}
            itemName="records"
            className="audit-pagination"
            ariaLabel="Audit Log Telemetry Navigation"
          />
        )}
      </section>

      {/* Selected Record Quick Details */}
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-ui-primary btn-sm"
                onClick={() => {
                  setActiveRecordId(selectedRecord.id);
                  state.setActiveAuditRecordId(selectedRecord.id);
                }}
              >
                🔬 Inspect Full Detail Page
              </button>
              <span className="detail-timestamp">
                Recorded: {new Date(selectedRecord.timestamp).toLocaleString()}
              </span>
            </div>
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
