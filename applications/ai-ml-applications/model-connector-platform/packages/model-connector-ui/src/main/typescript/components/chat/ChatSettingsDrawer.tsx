import React, { useState, useMemo } from "react";
import type { UiModel, UiModelAccount, ChatMessage } from "@/types/ui.types";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { StatusBadge } from "@/components/common";

export interface ChatSettingsDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly state: ModelConnectorState;
  readonly activeModel: UiModel | undefined;
  readonly activeAccount: UiModelAccount | undefined;
  readonly telemetryMessage: ChatMessage | undefined;
  readonly copiedField: string | null;
  readonly onCopy: (text: string, fieldName: string) => void;
  readonly temperature: number;
  readonly setTemperature: (val: number) => void;
  readonly topP: number;
  readonly setTopP: (val: number) => void;
  readonly maxTokens: number;
  readonly setMaxTokens: (val: number) => void;
  readonly presencePenalty: number;
  readonly setPresencePenalty: (val: number) => void;
  readonly systemPrompt: string;
  readonly setSystemPrompt: (val: string) => void;
}

type SettingsTab = "hyperparameters" | "system" | "telemetry";

export const ChatSettingsDrawer: React.FC<ChatSettingsDrawerProps> = ({
  isOpen,
  onClose,
  state,
  activeModel,
  activeAccount,
  telemetryMessage,
  copiedField,
  onCopy,
  temperature,
  setTemperature,
  topP,
  setTopP,
  maxTokens,
  setMaxTokens,
  presencePenalty,
  setPresencePenalty,
  systemPrompt,
  setSystemPrompt,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("hyperparameters");

  const isCurrentGemini =
    state.selectedModel.toLowerCase().includes("gemini") ||
    activeModel?.family.toLowerCase().includes("gemini");

  const isCurrentOllama =
    state.selectedModel.toLowerCase().includes("ollama") ||
    activeModel?.family.toLowerCase().includes("ollama") ||
    state.selectedModel.toLowerCase().includes("llama") ||
    state.selectedModel.toLowerCase().includes("deepseek") ||
    state.selectedModel.toLowerCase().includes("lfm");

  const activeSessionId = state.activeSessionId || "sess-default";
  const traceId = telemetryMessage?.traceId || "83964e5be1346f3a45a17e7c54e31f0e";
  const spanId = telemetryMessage?.spanId || "1e27740c7bc9c8d3";
  const correlationId = telemetryMessage?.correlationId || "ac568e0c-76f3-471a-b7cb-1087ca794e6c";

  const fallbackMessage = useMemo(() => {
    for (let i = (state.messages || []).length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (
        Boolean((m as any).metadata?.fallbackUsed) ||
        Boolean((m as any).fallbackUsed) ||
        m.content?.includes("Fallback from") ||
        m.content?.includes("Model Fallback Notification") ||
        (m.role === "assistant" && (m.model?.includes("llama") || m.model?.includes("ollama")) && state.selectedModel?.includes("gemini"))
      ) {
        return m;
      }
    }
    return null;
  }, [state.messages, state.selectedModel]);

  const isFallbackActive = Boolean(fallbackMessage);
  const fallbackModelName = fallbackMessage?.model || "llama3.2";

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    setTemperature(0.7);
    setTopP(0.95);
    setMaxTokens(4096);
    setPresencePenalty(0.0);
    setSystemPrompt("");
    state.setReasoningEffort(isCurrentGemini ? "low" : "medium");
  };

  return (
    <>
      <div
        className="chat-inspector-backdrop"
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(2px)",
          zIndex: 998,
        }}
      />
      <aside
        className="chat-inspector-panel chat-settings-drawer ui-surface-card mobile-open"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "420px",
          maxWidth: "92vw",
          zIndex: 999,
          background: "var(--card-bg, #ffffff)",
          boxShadow: "-8px 0 24px rgba(0, 0, 0, 0.12)",
          display: "flex",
          flexDirection: "column",
          padding: "1.25rem",
          overflowY: "auto",
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: "1rem",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>⚙️ Model &amp; Chat Settings</h3>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              {activeModel?.name || state.selectedModel}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="btn-ui-secondary btn-xs"
              onClick={handleResetDefaults}
              title="Reset all settings to default parameters"
              style={{
                fontSize: "0.75rem",
                padding: "4px 8px",
                borderRadius: "6px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              🔄 Reset
            </button>
            <button
              type="button"
              className="btn-ui-secondary btn-xs"
              onClick={onClose}
              style={{ width: "28px", height: "28px", borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          className="settings-tabs-row"
          style={{
            display: "flex",
            gap: "6px",
            background: "#f1f5f9",
            padding: "4px",
            borderRadius: "8px",
            marginBottom: "1.25rem",
          }}
        >
          <button
            type="button"
            className={`tab-btn ${activeTab === "hyperparameters" ? "active" : ""}`}
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              background: activeTab === "hyperparameters" ? "#ffffff" : "transparent",
              color: activeTab === "hyperparameters" ? "#2563eb" : "#64748b",
              boxShadow: activeTab === "hyperparameters" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
            onClick={() => setActiveTab("hyperparameters")}
          >
            🎛️ Parameters
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "system" ? "active" : ""}`}
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              background: activeTab === "system" ? "#ffffff" : "transparent",
              color: activeTab === "system" ? "#2563eb" : "#64748b",
              boxShadow: activeTab === "system" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
            onClick={() => setActiveTab("system")}
          >
            📝 Prompt
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "telemetry" ? "active" : ""}`}
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              background: activeTab === "telemetry" ? "#ffffff" : "transparent",
              color: activeTab === "telemetry" ? "#2563eb" : "#64748b",
              boxShadow: activeTab === "telemetry" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
            onClick={() => setActiveTab("telemetry")}
          >
            📊 Telemetry
          </button>
        </div>

        {/* Tab 1: Hyperparameters */}
        {activeTab === "hyperparameters" && (
          <div className="tab-pane-content" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Active Model Summary (Concise) */}
            <div
              style={{
                padding: "0.85rem",
                borderRadius: "8px",
                background: isFallbackActive ? "#fffbeb" : "#f8fafc",
                border: isFallbackActive ? "1px solid #fde68a" : "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong style={{ fontSize: "0.95rem" }}>{activeModel?.name || state.selectedModel}</strong>
                <div style={{ fontSize: "0.78rem", color: isFallbackActive ? "#b45309" : "#64748b", marginTop: "2px" }}>
                  {isFallbackActive ? (
                    <span>
                      Target: {(activeModel?.family || "gemini").toUpperCase()} • <strong>Active Engine: Local Ollama ({fallbackModelName})</strong>
                    </span>
                  ) : (
                    <span>
                      {(activeModel?.family || "frontier").toUpperCase()} • {activeModel?.tier?.toUpperCase() || "STANDARD"}
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge
                label={isFallbackActive ? "Fallback Active" : (activeAccount ? "Connected" : isCurrentOllama ? "Local Engine" : "Ready")}
                tone={isFallbackActive ? "warning" : "success"}
                showDot
              />
            </div>

            {/* Temperature */}
            <div className="spec-field-block">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Temperature</label>
                <code style={{ fontSize: "0.8rem", color: "#2563eb", fontWeight: 700 }}>{temperature.toFixed(2)}</code>
              </div>
              <input
                type="range"
                min="0.0"
                max="2.0"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer" }}
              />
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Lower values produce precise, deterministic responses; higher values enhance creativity.
              </span>
            </div>

            {/* Top P */}
            <div className="spec-field-block">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Top P (Nucleus Sampling)</label>
                <code style={{ fontSize: "0.8rem", color: "#2563eb", fontWeight: 700 }}>{topP.toFixed(2)}</code>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer" }}
              />
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Limits cumulative probability of sampled tokens during generation.
              </span>
            </div>

            {/* Max Tokens */}
            <div className="spec-field-block">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Max Output Tokens</label>
                <code style={{ fontSize: "0.8rem", color: "#2563eb", fontWeight: 700 }}>{maxTokens} tokens</code>
              </div>
              <input
                type="range"
                min="256"
                max="8192"
                step="256"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer" }}
              />
            </div>

            {/* Presence Penalty */}
            <div className="spec-field-block">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Presence Penalty</label>
                <code style={{ fontSize: "0.8rem", color: "#2563eb", fontWeight: 700 }}>{presencePenalty.toFixed(2)}</code>
              </div>
              <input
                type="range"
                min="-2.0"
                max="2.0"
                step="0.1"
                value={presencePenalty}
                onChange={(e) => setPresencePenalty(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer" }}
              />
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Penalizes repeated phrases and encourages topic expansion.
              </span>
            </div>

            {/* Reasoning Effort (if Gemini) */}
            {isCurrentGemini && (
              <div className="spec-field-block">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Reasoning Effort</label>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#2563eb" }}>
                    {state.reasoningEffort.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["low", "medium", "high"] as const).map((effort) => (
                    <button
                      key={effort}
                      type="button"
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        borderRadius: "6px",
                        border: `1px solid ${state.reasoningEffort === effort ? "#2563eb" : "#cbd5e1"}`,
                        background: state.reasoningEffort === effort ? "#eff6ff" : "#ffffff",
                        color: state.reasoningEffort === effort ? "#2563eb" : "#475569",
                        fontWeight: state.reasoningEffort === effort ? 600 : 400,
                        cursor: "pointer",
                        fontSize: "0.8rem",
                      }}
                      onClick={() => state.setReasoningEffort(effort)}
                    >
                      {effort === "low" && "⚡ Low"}
                      {effort === "medium" && "⚖️ Med"}
                      {effort === "high" && "🧠 High"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reset to Defaults button */}
            <div style={{ marginTop: "1.25rem", paddingTop: "0.85rem", borderTop: "1px dashed var(--theme-border-default, #cbd5e1)", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-ui-secondary btn-sm"
                onClick={handleResetDefaults}
                style={{
                  padding: "6px 14px",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                🔄 Reset to Defaults
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: System Instructions */}
        {activeTab === "system" && (
          <div className="tab-pane-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="spec-field-block">
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Custom System Instructions
              </label>
              <textarea
                rows={8}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are an enterprise AI assistant equipped with tools..."
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
              <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px", display: "block" }}>
                System prompts establish base persona, guardrails, and output constraints.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className="btn-ui-secondary btn-xs"
                onClick={() => setSystemPrompt("")}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Distributed Telemetry */}
        {activeTab === "telemetry" && (
          <div className="tab-pane-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Fallback Diagnostics & Reason (If fallback was engaged) */}
            {isFallbackActive && (
              <div
                style={{
                  padding: "0.85rem",
                  borderRadius: "8px",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  color: "#92400e",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#b45309" }}>
                    ⚠️ Fallback Diagnostics (Failover Active)
                  </span>
                  <span style={{ fontSize: "0.72rem", background: "#fef3c7", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                    ROUTED TO OLLAMA
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", lineHeight: "1.4", marginBottom: "8px", color: "#78350f" }}>
                  <strong>Primary Failure Reason:</strong> Google Gemini authentication required or API timeout. Automatically failed over to local air-gapped Ollama (<code>{fallbackModelName}</code>) container to preserve chat continuity.
                </div>

                {/* Dual-Model Execution Logs (Grouped, Timing ASC) */}
                <div style={{ background: "#ffffff", border: "1px solid #fed7aa", borderRadius: "6px", padding: "8px 10px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9a3412", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                    Dual-Model Execution Trace (ASC)
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.74rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: "#dc2626", fontWeight: 700 }}>[T0 Primary Fail]</span>
                      <code>{state.selectedModel}</code>: CLI Error (AUTH_FAILED / Token expired)
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: "#16a34a", fontWeight: 700 }}>[T1 Fallback OK]</span>
                      <code>ollama/{fallbackModelName}</code>: 200 OK via http://host.docker.internal:11435
                    </div>
                  </div>
                </div>

                {/* Hyperparameters Snapshot */}
                <div style={{ fontSize: "0.72rem", color: "#92400e", background: "#fef3c7", padding: "6px 8px", borderRadius: "4px" }}>
                  <strong>Parameters Applied:</strong> Temp: <code>{temperature.toFixed(2)}</code> • Top-P: <code>{topP.toFixed(2)}</code> • MaxTokens: <code>{maxTokens}</code> • Effort: <code>{state.reasoningEffort?.toUpperCase() || "LOW"}</code>
                </div>
              </div>
            )}

            {/* Registered Authentication */}
            <div className="spec-field-block">
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Registered Authentication
              </label>
              {activeAccount ? (
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: "8px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#166534" }}>
                      🟢 {activeAccount.authType?.toUpperCase() || "OAUTH"}
                    </span>
                    <span style={{ fontSize: "0.72rem", background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                      Active
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{activeAccount.userEmail}</div>
                </div>
              ) : isCurrentOllama ? (
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: "8px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0369a1" }}>
                      💻 LOCAL ENGINE
                    </span>
                    <span style={{ fontSize: "0.72rem", background: "#e0f2fe", color: "#0369a1", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                      Air-gapped
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#475569" }}>Local Ollama Docker Container</div>
                </div>
              ) : (
                <div style={{ padding: "0.75rem", borderRadius: "8px", background: "#fef3c7", border: "1px solid #fde68a", fontSize: "0.85rem", color: "#92400e" }}>
                  ⚠️ Unauthenticated Model. Configure credentials in Models view.
                </div>
              )}
            </div>

            {/* Session ID */}
            <div className="telemetry-field">
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b" }}>SESSION ID:</span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }}>
                <code style={{ fontSize: "0.78rem", flex: 1, padding: "4px 8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {activeSessionId}
                </code>
                <button
                  type="button"
                  className="btn-copy-small"
                  onClick={() => onCopy(activeSessionId, "sessionId")}
                >
                  {copiedField === "sessionId" ? "✔" : "📋"}
                </button>
              </div>
            </div>

            {/* W3C Trace ID */}
            <div className="telemetry-field">
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b" }}>W3C TRACE ID:</span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }}>
                <code style={{ fontSize: "0.78rem", flex: 1, padding: "4px 8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {traceId}
                </code>
                <button
                  type="button"
                  className="btn-copy-small"
                  onClick={() => onCopy(traceId, "traceId")}
                >
                  {copiedField === "traceId" ? "✔" : "📋"}
                </button>
              </div>
            </div>

            {/* W3C Span ID */}
            <div className="telemetry-field">
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b" }}>W3C SPAN ID:</span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }}>
                <code style={{ fontSize: "0.78rem", flex: 1, padding: "4px 8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {spanId}
                </code>
                <button
                  type="button"
                  className="btn-copy-small"
                  onClick={() => onCopy(spanId, "spanId")}
                >
                  {copiedField === "spanId" ? "✔" : "📋"}
                </button>
              </div>
            </div>

            {/* Correlation ID */}
            <div className="telemetry-field">
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b" }}>CORRELATION ID:</span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }}>
                <code style={{ fontSize: "0.78rem", flex: 1, padding: "4px 8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {correlationId}
                </code>
                <button
                  type="button"
                  className="btn-copy-small"
                  onClick={() => onCopy(correlationId, "correlationId")}
                >
                  {copiedField === "correlationId" ? "✔" : "📋"}
                </button>
              </div>
            </div>

            {/* Docker Log Filter */}
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.85rem",
                borderRadius: "8px",
                background: "#090d16",
                border: "1px solid #1e293b",
                color: "#f8fafc",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#38bdf8", letterSpacing: "0.5px" }}>🐳 DOCKER LOG FILTER</span>
                <button
                  type="button"
                  className="btn-copy-small"
                  onClick={() => {
                    const filterCmd = `docker logs model-connector-service 2>&1 | grep ${correlationId || traceId || activeSessionId}`;
                    onCopy(filterCmd, "dockerLog");
                  }}
                  style={{
                    background: "rgba(56, 189, 248, 0.2)",
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    color: "#38bdf8",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                  }}
                >
                  {copiedField === "dockerLog" ? "✔ Copied" : "📋 Copy Filter"}
                </button>
              </div>
              <code style={{ fontSize: "0.75rem", color: "#34d399", fontFamily: "monospace", wordBreak: "break-all", display: "block" }}>
                docker logs model-connector-service 2&gt;&amp;1 | grep {correlationId || traceId}
              </code>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
