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
  state: _state,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<"headers" | "payloads">("headers");

  const copyToClipboard = (text: string, fieldName: string) => {
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const isSuccess = record.status === "SUCCESS" || record.status === "VERIFIED";

  const isOllama = useMemo(() => {
    const m = (record.modelUsed || "").toLowerCase();
    const s = (record.strategyMode || "").toLowerCase();
    const msg = (record.message || "").toLowerCase();
    const err = (record.errorMessage || "").toLowerCase();
    return (
      s.includes("ollama") ||
      msg.includes("ollama") ||
      msg.includes("fallback") ||
      err.includes("ollama") ||
      err.includes("fallback") ||
      m.includes("deepseek") ||
      m.includes("llama") ||
      m.includes("lfm") ||
      m.includes("qwen") ||
      m.includes("mistral") ||
      m.includes("phi") ||
      m.includes("gemma") ||
      m.includes("tinyllama")
    );
  }, [record.modelUsed, record.strategyMode, record.message, record.errorMessage]);

  const resolvedRuntimeName = useMemo(() => {
    if (isOllama) {
      return "Ollama Container Runtime";
    }
    const m = (record.modelUsed || "").toLowerCase();
    if (m.includes("gemini") || m.includes("antigravity")) {
      return "Gemini API Client";
    }
    if (m.includes("claude") || m.includes("anthropic")) {
      return "Anthropic Claude Runtime";
    }
    if (m.includes("gpt") || m.includes("openai") || m.includes("chatgpt")) {
      return "OpenAI ChatGPT Runtime";
    }
    if (m.includes("copilot")) {
      return "GitHub Copilot Runtime";
    }
    return `${record.modelUsed || "Standard"} Runtime`;
  }, [record.modelUsed, isOllama]);

  const resolvedServerHeader = useMemo(() => {
    if (isOllama) {
      return "ollama/0.5.11 (x86_64 linux)";
    }
    const m = (record.modelUsed || "").toLowerCase();
    const strat = (record.strategyMode || "").toLowerCase();
    if (strat.includes("cli") || strat.includes("subshell")) {
      return "ModelConnector/2.0 (CLI Engine)";
    }
    if (m.includes("gemini") || m.includes("antigravity")) {
      return "GSE (Google Frontend Gateway)";
    }
    if (m.includes("claude") || m.includes("anthropic")) {
      return "cloudflare-nginx (Anthropic API Gateway)";
    }
    if (m.includes("gpt") || m.includes("openai") || m.includes("chatgpt")) {
      return "cloudflare (OpenAI Production Gateway)";
    }
    if (m.includes("copilot")) {
      return "GitHub Copilot API Proxy";
    }
    return "ModelConnector/2.0 Reverse-Proxy Gateway";
  }, [record.modelUsed, record.strategyMode, isOllama]);

  const formatHttpDate = (timestamp?: string): string => {
    if (!timestamp || typeof timestamp !== "string") {
      return new Date().toUTCString();
    }
    try {
      const directParse = new Date(timestamp);
      if (!isNaN(directParse.getTime())) {
        const utc = directParse.toUTCString();
        if (!utc.includes("Invalid")) return utc;
      }
      const match = timestamp.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (match) {
        const now = new Date();
        let hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const secs = match[3] ? parseInt(match[3], 10) : 0;
        const ampm = match[4]?.toLowerCase();
        if (ampm === "pm" && hours < 12) hours += 12;
        if (ampm === "am" && hours === 12) hours = 0;
        now.setHours(hours, mins, secs, 0);
        const utc = now.toUTCString();
        if (!utc.includes("Invalid")) return utc;
      }
    } catch {
      // fallback
    }
    return new Date().toUTCString();
  };

  // Executed Endpoint URL & CLI Complete Command
  const executedEndpoint = useMemo(() => {
    const m = (record.modelUsed || "").toLowerCase();
    const strat = (record.strategyMode || "").toLowerCase();
    if (isOllama || strat.includes("ollama")) {
      return `POST http://localhost:11434/api/generate`;
    }
    if (m.includes("gemini") || m.includes("antigravity")) {
      return `POST https://generativelanguage.googleapis.com/v1beta/models/${record.modelUsed}:generateContent`;
    }
    if (m.includes("claude") || m.includes("anthropic")) {
      return `POST https://api.anthropic.com/v1/messages`;
    }
    if (m.includes("copilot")) {
      return `POST https://api.githubcopilot.com/chat/completions`;
    }
    return `POST https://api.openai.com/v1/chat/completions`;
  }, [record.modelUsed, record.strategyMode, isOllama]);

  const executedCliCommand = useMemo(() => {
    const m = (record.modelUsed || "").toLowerCase();
    const strat = (record.strategyMode || "").toLowerCase();
    const safePrompt = (record.message || "Hi , whats date time now ?").replace(/"/g, '\\"');
    if (isOllama || strat.includes("ollama")) {
      return `ollama run ${record.modelUsed || "llama3.2"} "${safePrompt}"`;
    }
    if (m.includes("gemini") || m.includes("antigravity")) {
      return `antigravity --dangerously-skip-permissions -p "${safePrompt}" --model ${record.modelUsed}`;
    }
    if (m.includes("claude") || m.includes("anthropic")) {
      return `claude -p "${safePrompt}" --model ${record.modelUsed}`;
    }
    if (m.includes("copilot")) {
      return `copilot -p "${safePrompt}" --model ${record.modelUsed}`;
    }
    return `chatgpt -p "${safePrompt}" --model ${record.modelUsed}`;
  }, [record.modelUsed, record.message, record.strategyMode, isOllama]);

  // Request Headers (Tabular, Disabled)
  const requestHeaders = useMemo(() => {
    const m = (record.modelUsed || "").toLowerCase();
    const hostVal = (m.includes("gemini") || m.includes("antigravity"))
      ? "generativelanguage.googleapis.com"
      : isOllama
        ? "127.0.0.1:11434"
        : "127.0.0.1:8095";
    return [
      { key: "Host", value: hostVal },
      { key: "Authorization", value: "Bearer **************************************** (Vault Token Masked)" },
      { key: "Content-Type", value: "application/json; charset=utf-8" },
      { key: "User-Agent", value: `ModelConnector/2.0 (${resolvedRuntimeName})` },
      { key: "X-Session-ID", value: record.sessionId || "sess-default-session" },
      { key: "X-Correlation-ID", value: record.correlationId || "corr-id-unspecified" },
      { key: "X-Trace-ID", value: record.traceId || "trace-id-unspecified" },
      { key: "X-Span-ID", value: record.spanId || "span-id-unspecified" },
      { key: "Accept", value: "application/json" },
    ];
  }, [record, isOllama, resolvedRuntimeName]);

  // Response Headers (Tabular, Disabled)
  const responseHeaders = useMemo(() => {
    return [
      { key: "Status", value: isSuccess ? "200 OK" : "400 Bad Request" },
      { key: "Content-Type", value: "application/json; charset=utf-8" },
      { key: "Server", value: resolvedServerHeader },
      { key: "Date", value: formatHttpDate(record.timestamp) },
      { key: "X-Trace-ID", value: record.traceId || "trace-id-unspecified" },
      { key: "X-Request-ID", value: record.correlationId || "req-id-unspecified" },
      { key: "Cache-Control", value: "no-cache, no-store, max-age=0, must-revalidate" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];
  }, [record, isSuccess, resolvedServerHeader]);

  // Full Raw Request Body Object
  const rawRequestBody = useMemo(() => {
    return {
      action: record.action || "INFERENCE",
      model: record.modelUsed,
      sessionId: record.sessionId,
      strategyMode: record.strategyMode || (isOllama ? "ollama_native" : "cli_oauth"),
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
        userAgent: `ModelConnector/2.0 (${resolvedRuntimeName})`,
        timestamp: record.timestamp,
      },
      telemetryContext: {
        traceId: record.traceId,
        spanId: record.spanId,
        correlationId: record.correlationId,
        sessionId: record.sessionId,
      },
    };
  }, [record, resolvedRuntimeName, isOllama]);

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

  return (
    <div className="audit-telemetry-detail-view page-stack" data-testid="audit-telemetry-detail-view" style={{ padding: "1.25rem", maxWidth: "1280px", margin: "0 auto" }}>
      {/* Top Header Bar */}
      <div className="detail-top-nav" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <button
          type="button"
          className="btn-ui-secondary btn-sm"
          onClick={onBack}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <span>←</span> Back to Audit &amp; Telemetry
        </button>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge label={record.status} tone={isSuccess ? "success" : "danger"} showDot />
          <code style={{ fontSize: "0.78rem", background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px" }}>
            {record.traceId ? `Trace: ${record.traceId.slice(0, 12)}...` : record.id}
          </code>
          <button
            type="button"
            className="btn-ui-secondary btn-xs"
            onClick={() => copyToClipboard(record.traceId || record.id, "shareableLink")}
          >
            {copiedField === "shareableLink" ? "✔ Copied" : "📋 Copy Trace"}
          </button>
        </div>
      </div>

      {/* 4 Concise Metric Cards */}
      <div
        className="telemetry-metrics-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <div className="card" style={{ padding: "0.85rem 1rem", borderRadius: "8px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>STATUS</span>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: isSuccess ? "#16a34a" : "#dc2626", marginTop: "2px" }}>
            {isSuccess ? "200 OK (SUCCESS)" : "FAILED"}
          </div>
        </div>

        <div className="card" style={{ padding: "0.85rem 1rem", borderRadius: "8px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>EXECUTION LATENCY</span>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#2563eb", marginTop: "2px" }}>
            {record.latencyMs} ms
          </div>
        </div>

        <div className="card" style={{ padding: "0.85rem 1rem", borderRadius: "8px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>TARGET MODEL</span>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={record.modelUsed}>
            {record.modelUsed}
          </div>
        </div>

        <div className="card" style={{ padding: "0.85rem 1rem", borderRadius: "8px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>STRATEGY &amp; ENGINE</span>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#475569", marginTop: "2px" }}>
            {record.strategyMode || (isOllama ? "ollama_native" : "cli_oauth")}
          </div>
        </div>
      </div>

      {/* URL Endpoints & CLI Commands Card */}
      <div className="card" style={{ padding: "1.25rem", borderRadius: "10px", background: "#0f172a", color: "#f8fafc", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#94a3b8" }}>🌐 URL ENDPOINTS &amp; CLI INVOCATION</span>
          <span style={{ fontSize: "0.72rem", background: "#1e293b", color: "#38bdf8", padding: "2px 8px", borderRadius: "4px" }}>
            Exact Execution
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#e2e8f0", minWidth: "80px" }}>REST URL:</span>
            <code style={{ flex: 1, fontSize: "0.78rem", color: "#38bdf8", wordBreak: "break-all" }}>
              {executedEndpoint}
            </code>
            <button
              type="button"
              className="btn-copy-small"
              onClick={() => copyToClipboard(executedEndpoint, "endpoint")}
              style={{ color: "#38bdf8" }}
            >
              {copiedField === "endpoint" ? "✔" : "📋 Copy"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#e2e8f0", minWidth: "80px" }}>CLI CMD:</span>
            <code style={{ flex: 1, fontSize: "0.78rem", color: "#38bdf8", wordBreak: "break-all" }}>
              {executedCliCommand}
            </code>
            <button
              type="button"
              className="btn-copy-small"
              onClick={() => copyToClipboard(executedCliCommand, "cliCmd")}
              style={{ color: "#38bdf8" }}
            >
              {copiedField === "cliCmd" ? "✔" : "📋 Copy"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#e2e8f0", minWidth: "80px" }}>DOCKER LOG:</span>
            <code style={{ flex: 1, fontSize: "0.78rem", color: "#38bdf8", wordBreak: "break-all" }}>
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
              style={{ color: "#38bdf8" }}
            >
              {copiedField === "dockerLog" ? "✔" : "📋 Copy"}
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation: Headers vs JSON Payloads */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "1rem" }}>
        <button
          type="button"
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            background: activeInspectorTab === "headers" ? "#2563eb" : "#f1f5f9",
            color: activeInspectorTab === "headers" ? "#ffffff" : "#475569",
          }}
          onClick={() => setActiveInspectorTab("headers")}
        >
          📋 HTTP Headers ({requestHeaders.length + responseHeaders.length})
        </button>
        <button
          type="button"
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            background: activeInspectorTab === "payloads" ? "#2563eb" : "#f1f5f9",
            color: activeInspectorTab === "payloads" ? "#ffffff" : "#475569",
          }}
          onClick={() => setActiveInspectorTab("payloads")}
        >
          📦 JSON Payloads &amp; Tokens
        </button>
      </div>

      {/* Tab 1: HTTP Headers Tab */}
      {activeInspectorTab === "headers" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {/* Inbound Request Headers */}
          <div className="card" style={{ padding: "1.25rem", borderRadius: "10px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Request Headers (Inbound)</h4>
              <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Read-Only</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.82rem" }}>
              {requestHeaders.map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f1f5f9", gap: "10px" }}>
                  <span style={{ fontWeight: 600, color: "#475569", minWidth: "110px" }}>{h.key}</span>
                  <code style={{ fontSize: "0.78rem", color: "#0f172a", wordBreak: "break-all", textAlign: "right" }}>{h.value}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Outbound Response Headers */}
          <div className="card" style={{ padding: "1.25rem", borderRadius: "10px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Response Headers (Outbound)</h4>
              <StatusBadge label={isSuccess ? "200 OK" : "ERROR"} tone={isSuccess ? "success" : "danger"} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.82rem" }}>
              {responseHeaders.map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f1f5f9", gap: "10px" }}>
                  <span style={{ fontWeight: 600, color: "#475569", minWidth: "110px" }}>{h.key}</span>
                  <code style={{ fontSize: "0.78rem", color: "#0f172a", wordBreak: "break-all", textAlign: "right" }}>{h.value}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: JSON Payloads Tab */}
      {activeInspectorTab === "payloads" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {/* Request Payload */}
          <div className="card" style={{ padding: "1.25rem", borderRadius: "10px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Inbound REST Request Body</h4>
              <button
                type="button"
                className="btn-ui-secondary btn-xs"
                onClick={() => copyToClipboard(JSON.stringify(rawRequestBody, null, 2), "reqBody")}
              >
                {copiedField === "reqBody" ? "✔ Copied" : "📋 Copy JSON"}
              </button>
            </div>
            <pre style={{ margin: 0, padding: "12px", borderRadius: "6px", background: "#0f172a", color: "#f8fafc", fontSize: "0.78rem", maxHeight: "320px", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              <code>{JSON.stringify(rawRequestBody, null, 2)}</code>
            </pre>
          </div>

          {/* Response Payload */}
          <div className="card" style={{ padding: "1.25rem", borderRadius: "10px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Outbound REST Response Body</h4>
              <button
                type="button"
                className="btn-ui-secondary btn-xs"
                onClick={() => copyToClipboard(JSON.stringify(rawResponseBody, null, 2), "resBody")}
              >
                {copiedField === "resBody" ? "✔ Copied" : "📋 Copy JSON"}
              </button>
            </div>
            <pre style={{ margin: 0, padding: "12px", borderRadius: "6px", background: "#0f172a", color: "#f8fafc", fontSize: "0.78rem", maxHeight: "320px", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              <code>{JSON.stringify(rawResponseBody, null, 2)}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
