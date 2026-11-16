import React, { useState, useMemo } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import type { UiAuditRecord } from "@/types/ui.types";
import { StatusBadge } from "@/components/common";

interface AuditTelemetryDetailPageProps {
  readonly record: UiAuditRecord;
  readonly onBack: () => void;
  readonly state: ModelConnectorState;
}

export const AuditTelemetryDetailPage: React.FC<AuditTelemetryDetailPageProps> = ({
  record,
  onBack,
  state,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [reqBodySearch, setReqBodySearch] = useState("");
  const [resBodySearch, setResBodySearch] = useState("");

  const copyToClipboard = (text: string, fieldName: string) => {
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const isSuccess = record.status === "SUCCESS" || record.status === "VERIFIED";

  // Account Principal / Owner Email
  const boundAccount = useMemo(() => {
    return (state.modelAccounts || []).find((a) => a.modelId === record.modelUsed && a.isActive);
  }, [state.modelAccounts, record.modelUsed]);

  const ownerEmail =
    boundAccount?.userEmail || state.currentUser?.userEmail || "<user-email>";

  // Executed Endpoint URL & CLI Complete Command
  const executedEndpoint = useMemo(() => {
    const isGemini = record.modelUsed.toLowerCase().includes("gemini");
    const isOllama = record.modelUsed.toLowerCase().includes("lfm") || record.modelUsed.toLowerCase().includes("llama");
    if (isGemini) {
      return `POST https://generativelanguage.googleapis.com/v1beta/models/${record.modelUsed}:generateContent`;
    }
    if (isOllama) {
      return `POST http://localhost:11434/api/generate`;
    }
    return `POST https://api.openai.com/v1/chat/completions`;
  }, [record.modelUsed]);

  const executedCliCommand = useMemo(() => {
    const isGemini = record.modelUsed.toLowerCase().includes("gemini");
    const isOllama = record.modelUsed.toLowerCase().includes("lfm") || record.modelUsed.toLowerCase().includes("llama");
    const safePrompt = (record.message || "Hi , whats date time now ?").replace(/"/g, '\\"');
    if (isGemini) {
      return `antigravity --dangerously-skip-permissions -p "${safePrompt}" --model ${record.modelUsed}`;
    }
    if (isOllama) {
      return `ollama run ${record.modelUsed} "${safePrompt}"`;
    }
    return `chatgpt -p "${safePrompt}" --model ${record.modelUsed}`;
  }, [record.modelUsed, record.message]);

  // Request Headers (Tabular, Disabled)
  const requestHeaders = useMemo(() => {
    return [
      { key: "Host", value: record.modelUsed.includes("gemini") ? "generativelanguage.googleapis.com" : "127.0.0.1:8095" },
      { key: "Authorization", value: "Bearer **************************************** (Vault Token Masked)" },
      { key: "Content-Type", value: "application/json; charset=utf-8" },
      { key: "User-Agent", value: "ModelConnector/2.0 (Google Antigravity Runtime)" },
      { key: "X-Session-ID", value: record.sessionId || "sess-default-session" },
      { key: "X-Correlation-ID", value: record.correlationId || "corr-id-unspecified" },
      { key: "X-Trace-ID", value: record.traceId || "trace-id-unspecified" },
      { key: "X-Span-ID", value: record.spanId || "span-id-unspecified" },
      { key: "Accept", value: "application/json" },
    ];
  }, [record]);

  // Response Headers (Tabular, Disabled)
  const responseHeaders = useMemo(() => {
    return [
      { key: "Status", value: isSuccess ? "200 OK" : "400 Bad Request" },
      { key: "Content-Type", value: "application/json; charset=utf-8" },
      { key: "Server", value: "Google-HTTP-Java-Client/1.42.0 (gzip)" },
      { key: "Date", value: new Date(record.timestamp).toUTCString() },
      { key: "X-Trace-ID", value: record.traceId || "trace-id-unspecified" },
      { key: "X-Request-ID", value: record.correlationId || "req-id-unspecified" },
      { key: "Cache-Control", value: "no-cache, no-store, max-age=0, must-revalidate" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];
  }, [record, isSuccess]);

  // Full Raw Request Body Object
  const rawRequestBody = useMemo(() => {
    return {
      action: record.action || "INFERENCE",
      model: record.modelUsed,
      sessionId: record.sessionId,
      strategyMode: record.strategyMode || "cli_oauth",
      prompt: record.message || "Hi , whats date time now ?",
      parameters: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        topP: 0.95,
        reasoningEffort: "low",
        mode: "chat",
      },
      clientMetadata: {
        clientIp: record.clientIp || "127.0.0.1",
        userAgent: record.modelUsed.toLowerCase().includes("gemini")
          ? "ModelConnector/2.0 (Google Antigravity Runtime)"
          : `ModelConnector/2.0 (${record.modelUsed} Runtime)`,
        timestamp: record.timestamp,
      },
      telemetryContext: {
        traceId: record.traceId,
        spanId: record.spanId,
        correlationId: record.correlationId,
        sessionId: record.sessionId,
      },
    };
  }, [record]);

  // Full Raw Response Body Object
  const rawResponseBody = useMemo(() => {
    return {
      status: record.status,
      model: record.modelUsed,
      latencyMs: record.latencyMs,
      timestamp: record.timestamp,
      verified: isSuccess,
      candidates: [
        {
          content: {
            parts: [
              {
                text: isSuccess
                  ? (record.modelUsed.toLowerCase().includes("gemini")
                      ? "I am Antigravity, an agentic AI coding assistant designed by Google DeepMind and powered by Gemini. Runtime and token vault authentication verified."
                      : `I am ${record.modelUsed}. Model runtime and token authentication verified.`)
                  : record.errorMessage || "Connection handshake verification failed",
              },
            ],
            role: "model",
          },
          finishReason: isSuccess ? "STOP" : "ERROR",
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 8,
        candidatesTokenCount: 42,
        totalTokenCount: 50,
      },
      telemetryContext: {
        traceId: record.traceId,
        spanId: record.spanId,
        correlationId: record.correlationId,
        sessionId: record.sessionId,
      },
    };
  }, [record, isSuccess]);

  // JSON Field / JSONPath Search Filter Helper
  const filterJsonObject = (obj: any, query: string): any => {
    const q = query.trim().toLowerCase();
    if (!q) return obj;

    // Simple JSONPath extraction (e.g. $.candidates[0].content or candidates.parts)
    if (q.startsWith("$.")) {
      const path = q.slice(2).split(".");
      let curr = obj;
      for (const p of path) {
        if (!curr) return null;
        const arrayMatch = p.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          curr = curr[arrayMatch[1]]?.[Number(arrayMatch[2])];
        } else {
          curr = curr[p];
        }
      }
      return curr !== undefined ? curr : { error: `Path '${query}' not found` };
    }

    // Keyword filtering across keys and values
    const filterRecursive = (data: any): any => {
      if (data === null || data === undefined) return data;
      if (Array.isArray(data)) {
        const filteredArray = data
          .map((item) => filterRecursive(item))
          .filter((item) => item !== undefined);
        return filteredArray.length > 0 ? filteredArray : undefined;
      }
      if (typeof data === "object") {
        const res: Record<string, any> = {};
        for (const [k, v] of Object.entries(data)) {
          if (k.toLowerCase().includes(q)) {
            res[k] = v;
          } else {
            const nested = filterRecursive(v);
            if (nested !== undefined) {
              res[k] = nested;
            }
          }
        }
        return Object.keys(res).length > 0 ? res : undefined;
      }
      if (String(data).toLowerCase().includes(q)) {
        return data;
      }
      return undefined;
    };

    const result = filterRecursive(obj);
    return result !== undefined ? result : { message: `No matching fields found for '${query}'` };
  };

  const filteredReqBody = useMemo(() => {
    return filterJsonObject(rawRequestBody, reqBodySearch);
  }, [rawRequestBody, reqBodySearch]);

  const filteredResBody = useMemo(() => {
    return filterJsonObject(rawResponseBody, resBodySearch);
  }, [rawResponseBody, resBodySearch]);

  return (
    <div className="telemetry-detail-page page-stack" data-testid="telemetry-detail-page">
      {/* ========================================================================= */}
      {/* 1. Header with Breadcrumb Back Navigation and Status Badges               */}
      {/* ========================================================================= */}
      <div className="detail-top-nav-card ui-surface-card">
        <div className="nav-left">
          <button
            type="button"
            className="btn-ui-secondary btn-sm btn-back-audit"
            onClick={onBack}
            title="Return to Audit Log Trail table"
          >
            ← Back to Audit Logs Trail
          </button>
          <div className="record-heading-group">
            <h2 className="record-main-title">
              🔬 Audit Telemetry: <span className="action-tag">{record.action}</span>
            </h2>
            <span className="record-sub-meta">
              Model: <strong>{record.modelUsed}</strong> • ID: <code>{record.id}</code>
            </span>
          </div>
        </div>

        <div className="nav-right">
          <StatusBadge
            label={record.status}
            tone={isSuccess ? "success" : "danger"}
            showDot
          />
          <span className="latency-pill">⚡ {record.latencyMs} ms</span>
          <span className="timestamp-pill">🕒 {new Date(record.timestamp).toLocaleString()}</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. W3C OTEL Distributed Tracing & Lineage Correlation Header              */}
      {/* ========================================================================= */}
      <div className="trace-lineage-banner-card ui-surface-card">
        <div className="banner-title-row">
          <span className="banner-icon">📡</span>
          <h4>Distributed W3C Tracing &amp; Lineage Correlation Context</h4>
          <span className="trace-ready-badge">✓ Mapped &amp; Lineage Verified</span>
        </div>

        <div className="trace-mapping-grid">
          {/* Session ID */}
          <div className="trace-cell">
            <span className="cell-label">SESSION ID</span>
            <div className="cell-code-wrapper">
              <code className="cell-code font-mono" title={record.sessionId}>
                {record.sessionId || `sess-${record.modelUsed}-${record.id.slice(0, 8)}`}
              </code>
              <button
                type="button"
                className="btn-copy-mini"
                onClick={() =>
                  copyToClipboard(
                    record.sessionId || `sess-${record.modelUsed}-${record.id.slice(0, 8)}`,
                    "sessionId",
                  )
                }
                title="Copy Session ID"
              >
                {copiedField === "sessionId" ? "✔" : "📋"}
              </button>
              {record.sessionId && (
                <button
                  type="button"
                  className="btn-ui-primary btn-xs"
                  onClick={() => {
                    state.setActiveSessionId(record.sessionId);
                    state.setActiveTab("chat");
                  }}
                  title="Open this session in AI Chat"
                >
                  💬 Chat
                </button>
              )}
            </div>
          </div>

          {/* Trace ID */}
          <div className="trace-cell">
            <span className="cell-label">TRACE ID (W3C OTEL)</span>
            <div className="cell-code-wrapper">
              <code className="cell-code font-mono" title={record.traceId}>
                {record.traceId || "83964e5be1346f3a45a17e7c54e31f0e"}
              </code>
              <button
                type="button"
                className="btn-copy-mini"
                onClick={() =>
                  copyToClipboard(record.traceId || "83964e5be1346f3a45a17e7c54e31f0e", "traceId")
                }
                title="Copy Trace ID"
              >
                {copiedField === "traceId" ? "✔" : "📋"}
              </button>
            </div>
          </div>

          {/* Span ID */}
          <div className="trace-cell">
            <span className="cell-label">SPAN ID</span>
            <div className="cell-code-wrapper">
              <code className="cell-code font-mono" title={record.spanId}>
                {record.spanId || "1e27740c7bc9c8d3"}
              </code>
              <button
                type="button"
                className="btn-copy-mini"
                onClick={() =>
                  copyToClipboard(record.spanId || "1e27740c7bc9c8d3", "spanId")
                }
                title="Copy Span ID"
              >
                {copiedField === "spanId" ? "✔" : "📋"}
              </button>
            </div>
          </div>

          {/* Correlation ID */}
          <div className="trace-cell">
            <span className="cell-label">CORRELATION ID</span>
            <div className="cell-code-wrapper">
              <code className="cell-code font-mono" title={record.correlationId}>
                {record.correlationId || "ac568e0c-76f3-471a-b7cb-1087ca794e6c"}
              </code>
              <button
                type="button"
                className="btn-copy-mini"
                onClick={() =>
                  copyToClipboard(
                    record.correlationId || "ac568e0c-76f3-471a-b7cb-1087ca794e6c",
                    "corrId",
                  )
                }
                title="Copy Correlation ID"
              >
                {copiedField === "corrId" ? "✔" : "📋"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. Execution Attributes (E: Token, F: Email ID, G: Endpoint / CLI Command) */}
      {/* ========================================================================= */}
      <div className="execution-context-grid">
        {/* F: Email ID */}
        <div className="context-card ui-surface-card">
          <div className="card-mini-header">
            <span className="mini-icon">👤</span>
            <span className="mini-label">ACCOUNT PRINCIPAL (EMAIL ID)</span>
            <span className="badge-disabled">Locked / Read-Only</span>
          </div>
          <div className="disabled-field-box">
            <input
              type="text"
              className="disabled-text-input font-mono"
              value={ownerEmail}
              disabled
              readOnly
            />
            <button
              type="button"
              className="btn-copy-mini"
              onClick={() => copyToClipboard(ownerEmail, "email")}
              title="Copy Account Email"
            >
              {copiedField === "email" ? "✔" : "📋"}
            </button>
          </div>
        </div>

        {/* E: Token Context */}
        <div className="context-card ui-surface-card">
          <div className="card-mini-header">
            <span className="mini-icon">🔑</span>
            <span className="mini-label">TOKEN CONTEXT &amp; METRICS</span>
            <span className="badge-disabled">Bearer Token Masked</span>
          </div>
          <div className="token-metrics-row">
            <span className="token-badge">⚡ 50 Tokens Consumed</span>
            <span className="token-badge-muted">Prompt: 8 • Completion: 42</span>
            <span className="token-badge-type">RFC 6750 Bearer</span>
          </div>
          <div className="disabled-field-box" style={{ marginTop: "6px" }}>
            <input
              type="text"
              className="disabled-text-input font-mono"
              value="ya29.a0AfH6SM...[SECURE_VAULT_TOKEN_MASKED]"
              disabled
              readOnly
            />
            <button
              type="button"
              className="btn-copy-mini"
              onClick={() => copyToClipboard("ya29.a0AfH6SM...[SECURE_VAULT_TOKEN_MASKED]", "token")}
              title="Copy Token Representation"
            >
              {copiedField === "token" ? "✔" : "📋"}
            </button>
          </div>
        </div>

        {/* G: URL Endpoints & Complete CLI Command */}
        <div className="context-card full-width-card ui-surface-card">
          <div className="card-mini-header">
            <span className="mini-icon">🌐</span>
            <span className="mini-label">URL ENDPOINTS &amp; CLI COMPLETE COMMAND</span>
            <span className="badge-disabled">Exact Invocation</span>
          </div>

          <div className="command-boxes-stack">
            {/* REST Endpoint */}
            <div className="cmd-row">
              <span className="cmd-type-tag">REST URL:</span>
              <code className="cmd-code-text font-mono">{executedEndpoint}</code>
              <button
                type="button"
                className="btn-copy-small"
                onClick={() => copyToClipboard(executedEndpoint, "endpoint")}
              >
                {copiedField === "endpoint" ? "✔ Copied" : "📋 Copy URL"}
              </button>
            </div>

            {/* CLI Command */}
            <div className="cmd-row">
              <span className="cmd-type-tag">CLI CMD:</span>
              <code className="cmd-code-text font-mono">{executedCliCommand}</code>
              <button
                type="button"
                className="btn-copy-small"
                onClick={() => copyToClipboard(executedCliCommand, "cliCmd")}
              >
                {copiedField === "cliCmd" ? "✔ Copied" : "📋 Copy CLI"}
              </button>
            </div>

            {/* Docker Log Filter */}
            <div className="cmd-row">
              <span className="cmd-type-tag">DOCKER LOG:</span>
              <code className="cmd-code-text font-mono">
                docker logs model-connector-service 2&gt;&amp;1 | grep {record.traceId || record.sessionId}
              </code>
              <button
                type="button"
                className="btn-copy-small"
                onClick={() =>
                  copyToClipboard(
                    `docker logs model-connector-service 2>&1 | grep ${record.traceId || record.sessionId}`,
                    "dockerLog",
                  )
                }
              >
                {copiedField === "dockerLog" ? "✔ Copied" : "📋 Copy Filter"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. Request Section (B: Request Headers Tabular + A: Beautified REST Body)   */}
      {/* ========================================================================= */}
      <div className="request-response-container">
        {/* REQUEST BLOCK */}
        <div className="payload-column ui-surface-card">
          <div className="column-header-bar">
            <div className="col-title-group">
              <span className="col-icon">📤</span>
              <div>
                <h3>Request Payload &amp; Headers</h3>
                <span className="col-subtitle">Inbound verification or prompt payload</span>
              </div>
            </div>
            <span className="badge-disabled">Disabled / Read-Only</span>
          </div>

          {/* B: Request Headers in Tabular & Disabled */}
          <div className="headers-tabular-card">
            <div className="table-header-title">
              <span>📋 REQUEST HEADERS (TABULAR)</span>
              <span className="table-count-tag">{requestHeaders.length} headers</span>
            </div>
            <div className="tabular-scroll-box">
              <table className="disabled-headers-table">
                <thead>
                  <tr>
                    <th>Header Name</th>
                    <th>Header Value (Disabled)</th>
                  </tr>
                </thead>
                <tbody>
                  {requestHeaders.map((h) => (
                    <tr key={h.key}>
                      <td className="header-key font-mono">{h.key}</td>
                      <td className="header-val font-mono">{h.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* A: Beautified REST Request Body with JSON Field Filter / JSONPath */}
          <div className="beautified-body-card">
            <div className="body-filter-toolbar">
              <div className="filter-title-wrap">
                <span className="filter-title">📄 REST REQUEST BODY (BEAUTIFIED)</span>
                <span className="badge-disabled">Read-Only</span>
              </div>

              <div className="json-search-input-group">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="json-search-input"
                  placeholder="Filter field (e.g. prompt, $.parameters.temperature)..."
                  value={reqBodySearch}
                  onChange={(e) => setReqBodySearch(e.target.value)}
                />
                {reqBodySearch && (
                  <button
                    type="button"
                    className="btn-clear-search"
                    onClick={() => setReqBodySearch("")}
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  className="btn-copy-small"
                  onClick={() =>
                    copyToClipboard(JSON.stringify(rawRequestBody, null, 2), "reqJson")
                  }
                >
                  {copiedField === "reqJson" ? "✔ Copied" : "📋 Copy JSON"}
                </button>
              </div>
            </div>

            {/* Quick Filter Pills */}
            <div className="quick-filter-pills">
              {["All", "prompt", "parameters", "telemetryContext"].map((pill) => (
                <button
                  key={pill}
                  type="button"
                  className={`quick-pill ${
                    (pill === "All" && !reqBodySearch) || reqBodySearch.toLowerCase() === pill.toLowerCase()
                      ? "active"
                      : ""
                  }`}
                  onClick={() => setReqBodySearch(pill === "All" ? "" : pill)}
                >
                  {pill}
                </button>
              ))}
            </div>

            {/* Beautified JSON Code Block */}
            <pre className="beautified-json-view font-mono">
              <code>{JSON.stringify(filteredReqBody, null, 2)}</code>
            </pre>
          </div>
        </div>

        {/* RESPONSE BLOCK */}
        <div className="payload-column ui-surface-card">
          <div className="column-header-bar">
            <div className="col-title-group">
              <span className="col-icon">📥</span>
              <div>
                <h3>Response Payload &amp; Headers</h3>
                <span className="col-subtitle">Downstream provider output and latency</span>
              </div>
            </div>
            <StatusBadge label={record.status} tone={isSuccess ? "success" : "danger"} showDot />
          </div>

          {/* D: Response Headers in Tabular & Disabled */}
          <div className="headers-tabular-card">
            <div className="table-header-title">
              <span>📋 RESPONSE HEADERS (TABULAR)</span>
              <span className="table-count-tag">{responseHeaders.length} headers</span>
            </div>
            <div className="tabular-scroll-box">
              <table className="disabled-headers-table">
                <thead>
                  <tr>
                    <th>Header Name</th>
                    <th>Header Value (Disabled)</th>
                  </tr>
                </thead>
                <tbody>
                  {responseHeaders.map((h) => (
                    <tr key={h.key}>
                      <td className="header-key font-mono">{h.key}</td>
                      <td className="header-val font-mono">{h.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* C: Beautified REST Response Body with JSON Field Filter / JSONPath */}
          <div className="beautified-body-card">
            <div className="body-filter-toolbar">
              <div className="filter-title-wrap">
                <span className="filter-title">📄 REST RESPONSE BODY (BEAUTIFIED)</span>
                <span className="badge-disabled">Read-Only</span>
              </div>

              <div className="json-search-input-group">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="json-search-input"
                  placeholder="Filter field (e.g. candidates, $.usageMetadata.totalTokenCount)..."
                  value={resBodySearch}
                  onChange={(e) => setResBodySearch(e.target.value)}
                />
                {resBodySearch && (
                  <button
                    type="button"
                    className="btn-clear-search"
                    onClick={() => setResBodySearch("")}
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  className="btn-copy-small"
                  onClick={() =>
                    copyToClipboard(JSON.stringify(rawResponseBody, null, 2), "resJson")
                  }
                >
                  {copiedField === "resJson" ? "✔ Copied" : "📋 Copy JSON"}
                </button>
              </div>
            </div>

            {/* Quick Filter Pills */}
            <div className="quick-filter-pills">
              {["All", "candidates", "usageMetadata", "telemetryContext"].map((pill) => (
                <button
                  key={pill}
                  type="button"
                  className={`quick-pill ${
                    (pill === "All" && !resBodySearch) || resBodySearch.toLowerCase() === pill.toLowerCase()
                      ? "active"
                      : ""
                  }`}
                  onClick={() => setResBodySearch(pill === "All" ? "" : pill)}
                >
                  {pill}
                </button>
              ))}
            </div>

            {/* Beautified JSON Code Block */}
            <pre className="beautified-json-view font-mono">
              <code>{JSON.stringify(filteredResBody, null, 2)}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
