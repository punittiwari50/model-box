import React, { useState, useMemo } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { ModelCatalog } from "@/constants/providerConfigConstants";

interface DesktopChatPageProps {
  readonly state: ModelConnectorState;
}

interface ModelGuide {
  readonly title: string;
  readonly badge: string;
  readonly reason: string;
  readonly badgeColor: string;
  readonly recommendedUseCase: string;
}

const MODEL_SELECTION_GUIDE: Record<string, ModelGuide> = {
  [ModelCatalog.GEMINI_3_8_FLASH]: {
    title: "Google Gemini 3.8 Flash",
    badge: "⭐ RECOMMENDED FOR GENERAL USE",
    reason: "Best balance of lightning-fast speed (<200ms), deep multimodal reasoning, live date/time queries, and cost-free CLI OAuth bearer tokens.",
    badgeColor: "#10b981",
    recommendedUseCase: "Everyday queries, structured JSON extraction, rapid date/time inspection, and general AI assistance.",
  },
  "gemini-3.5-flash": {
    title: "Google Gemini 3.5 Flash",
    badge: "⚡ HIGH-THROUGHPUT ENGINE",
    reason: "Ultra low-latency reasoning model designed for high-concurrency streaming and background task pipelines.",
    badgeColor: "#06b6d4",
    recommendedUseCase: "Batch operations, automated pipelines, and fast summarization.",
  },
  "claude-3-7-sonnet": {
    title: "Anthropic Claude 3.7 Sonnet",
    badge: "🧠 COMPLEX AGENTIC REASONING",
    reason: "Frontier hybrid reasoning and nuanced agentic architecture. Excels at long context, deep code refactoring, and multi-step math.",
    badgeColor: "#f59e0b",
    recommendedUseCase: "Architectural synthesis, multi-file code editing, and deep mathematical analysis.",
  },
  "claude-3-5-haiku": {
    title: "Anthropic Claude 3.5 Haiku",
    badge: "🚀 FAST LIGHTWEIGHT INTELLIGENCE",
    reason: "Compact Anthropic model engineered for quick conversational responsiveness and low latency.",
    badgeColor: "#8b5cf6",
    recommendedUseCase: "Lightweight conversational tasks and quick feedback loops.",
  },
  "gpt-4o": {
    title: "OpenAI GPT-4o",
    badge: "🌐 FRONTIER GENERAL INTELLIGENCE",
    reason: "Omni-channel reasoning flagship model by OpenAI for complex instruction following and general knowledge.",
    badgeColor: "#10a37f",
    recommendedUseCase: "Complex general reasoning, multimodal vision, and comprehensive writing.",
  },
  "gpt-4o-mini": {
    title: "OpenAI GPT-4o Mini",
    badge: "💡 EFFICIENT OMNI MODEL",
    reason: "Compact, affordable omni model by OpenAI for high-frequency conversational queries.",
    badgeColor: "#64748b",
    recommendedUseCase: "Cost-sensitive chatbot tasks and everyday questions.",
  },
  "llama3.2": {
    title: "LLaMA 3.2 (Ollama Local)",
    badge: "🛡️ PRIVATE LOCAL EXECUTION",
    reason: "Runs 100% locally on-device with zero cloud credentials required and complete data privacy.",
    badgeColor: "#eab308",
    recommendedUseCase: "Confidential data processing and air-gapped offline environments.",
  },
  "tinyllama": {
    title: "TinyLlama 1.1B",
    badge: "🔌 HERMETIC FALLBACK RUNNER",
    reason: "Hermetic lightweight fallback model running without API keys when remote services are unreachable.",
    badgeColor: "#94a3b8",
    recommendedUseCase: "Offline emergency fallback and edge devices.",
  },
};

export const DesktopChatPage: React.FC<DesktopChatPageProps> = ({ state }) => {
  const [inputPrompt, setInputPrompt] = useState("");

  const handleSend = () => {
    if (!inputPrompt.trim() || state.isLoading) return;
    state.handleSendMessage(inputPrompt);
    setInputPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeSessionObj = state.sessions.find((s) => s.sessionId === state.activeSessionId);

  // Group models by category (Requirement 4)
  const groupedModels = useMemo(() => {
    const groups: Record<string, { label: string; icon: string; models: typeof state.models }> = {
      gemini: { label: "Google Gemini", icon: "✦", models: [] },
      claude: { label: "Anthropic Claude", icon: "🧠", models: [] },
      openai: { label: "OpenAI ChatGPT", icon: "🤖", models: [] },
      grok: { label: "xAI Grok", icon: "⚡", models: [] },
      ollama: { label: "Local Fallback (Ollama)", icon: "🛡️", models: [] },
    };

    for (const m of state.models) {
      const fam = m.family?.toLowerCase() || "";
      const mid = m.id.toLowerCase();
      if (fam.includes("gemini") || mid.includes("gemini")) {
        groups.gemini.models.push(m);
      } else if (fam.includes("claude") || mid.includes("claude")) {
        groups.claude.models.push(m);
      } else if (fam.includes("openai") || fam.includes("gpt") || mid.includes("gpt")) {
        groups.openai.models.push(m);
      } else if (fam.includes("grok") || mid.includes("grok")) {
        groups.grok.models.push(m);
      } else if (fam.includes("ollama") || mid.includes("llama")) {
        groups.ollama.models.push(m);
      } else {
        if (!groups.other) groups.other = { label: "Other Models", icon: "✨", models: [] };
        groups.other.models.push(m);
      }
    }
    return groups;
  }, [state.models]);

  // Active authentication status for the selected model (Requirement 4)
  const activeAccount = useMemo(() => {
    return state.modelAccounts.find(
      (a) => a.modelId === state.selectedModel && a.isActive,
    );
  }, [state.modelAccounts, state.selectedModel]);

  // Total session tokens consumed (Requirement 4)
  const totalSessionTokens = useMemo(() => {
    return state.messages.reduce((acc, msg) => acc + (msg.tokenCount || 0), 0);
  }, [state.messages]);

  // Selection recommendation details for currently selected model
  const currentGuide: ModelGuide = useMemo(() => {
    return (
      MODEL_SELECTION_GUIDE[state.selectedModel] || {
        title: state.selectedModel,
        badge: "✨ STANDARD INFERENCE",
        reason: "Available model for distributed multi-model inference across supported strategies.",
        badgeColor: "#3b82f6",
        recommendedUseCase: "General AI tasks and custom prompts.",
      }
    );
  }, [state.selectedModel]);

  return (
    <div className="desktop-chat-layout">
      <div className="chat-conversation-panel">
        {/* Top Chat Header with Active Auth Badge & Token Metric */}
        <div
          style={{
            padding: "10px 16px",
            background: "rgba(15, 23, 42, 0.75)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.1rem" }}>💬</span>
            <div>
              <strong style={{ fontSize: "0.85rem", color: "#f8fafc" }}>
                {state.selectedModel}
              </strong>
              <span style={{ fontSize: "0.72rem", color: "#94a3b8", marginLeft: "6px" }}>
                via {state.activeStrategy.toUpperCase()}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Active Authentication Badge */}
            {activeAccount ? (
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: "100px",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#6ee7b7",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                title={`Active Credential: ${activeAccount.accountName} (${activeAccount.userEmail})`}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "#10b981",
                    boxShadow: "0 0 6px #10b981",
                  }}
                />
                AUTH: {activeAccount.authType === "cli_oauth" || activeAccount.authType === "oauth" ? "CLI OAuth" : activeAccount.authType.toUpperCase()} ({activeAccount.userEmail || "Connected"})
              </span>
            ) : (
              <button
                type="button"
                onClick={() => state.setActiveTab("model-config")}
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: "100px",
                  background: "rgba(234, 179, 8, 0.15)",
                  color: "#fde047",
                  border: "1px solid rgba(234, 179, 8, 0.35)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>⚠️</span>
                <span>AUTH: Not Configured (Click to Setup)</span>
              </button>
            )}

            {/* Total Session Tokens Consumed Counter */}
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: "100px",
                background: "rgba(59, 130, 246, 0.15)",
                color: "#93c5fd",
                border: "1px solid rgba(59, 130, 246, 0.35)",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>⚡</span>
              <span>Tokens Consumed: {totalSessionTokens}</span>
            </span>
          </div>
        </div>

        <div className="messages-stream">
          {state.messages.length === 0 ? (
            <div className="chat-empty-state">
              <div className="empty-icon">🤖</div>
              <h3>Ready for Multi-Model Inference</h3>
              <p>
                Selected model: <strong>{state.selectedModel}</strong> via{" "}
                <strong>{state.activeStrategy.toUpperCase()}</strong> strategy.
              </p>
              <div className="quick-suggestions">
                <button onClick={() => state.handleSendMessage("Hi , whats date time now ?")}>
                  Hi , whats date time now ? ⏱️
                </button>
                <button onClick={() => state.handleSendMessage("Explain quantum computing in one sentence")}>
                  Quantum Computing 🚀
                </button>
                <button onClick={() => state.handleSendMessage("Write a high-performance TypeScript debounce function")}>
                  TypeScript Snippet 💻
                </button>
                <button onClick={() => state.handleSendMessage("Verify fallback runtime connectivity")}>
                  Verify Fallback 🛡️
                </button>
              </div>
            </div>
          ) : (
            state.messages.map((msg) => (
              <div key={msg.id} className={`desktop-message-card ${msg.role}`}>
                <div className="msg-header">
                  <span className="msg-author">{msg.role === "user" ? "👤 User" : `🤖 ${msg.model}`}</span>
                  <span className="msg-meta">
                    {msg.strategy && <span className="strategy-tag">{msg.strategy.toUpperCase()}</span>}
                    {msg.latencyMs && <span className="latency-tag">{msg.latencyMs}ms</span>}
                    {msg.tokenCount && (
                      <span
                        className="token-tag"
                        style={{
                          background: "rgba(59, 130, 246, 0.2)",
                          color: "#93c5fd",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontWeight: 600,
                        }}
                      >
                        ⚡ {msg.tokenCount} tokens consumed
                      </span>
                    )}
                    <span className="time-tag">{msg.timestamp}</span>
                  </span>
                </div>
                <div className="msg-body">{msg.content}</div>
              </div>
            ))
          )}
          {state.isLoading && (
            <div className="desktop-loading-card">
              <div className="spinner" />
              <span>Processing multi-model inference via {state.activeStrategy.toUpperCase()} strategy...</span>
            </div>
          )}
        </div>

        <div className="chat-composer-bar">
          <textarea
            className="desktop-chat-input"
            rows={2}
            placeholder="Enter prompt... (e.g. 'Hi , whats date time now ?', Press Enter to send, Shift+Enter for new line)"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={state.isLoading}
          />
          <button className="desktop-send-btn" onClick={handleSend} disabled={state.isLoading || !inputPrompt.trim()}>
            {state.isLoading ? "Sending..." : "Send 🚀"}
          </button>
        </div>
      </div>

      <div className="chat-inspector-panel">
        {/* Model Selection & Recommendation Card (Requirement 4) */}
        <div className="inspector-card">
          <h4>Category-Wise Model Selection</h4>
          <div className="spec-row" style={{ flexDirection: "column", alignItems: "stretch", gap: "6px" }}>
            <label className="spec-label" style={{ marginBottom: "2px" }}>
              Active Model (Grouped by Category):
            </label>
            <select
              className="desktop-select"
              value={state.selectedModel}
              onChange={(e) => state.setSelectedModel(e.target.value)}
              style={{ width: "100%", padding: "8px 10px" }}
            >
              {Object.entries(groupedModels).map(([key, group]) =>
                group.models.length > 0 ? (
                  <optgroup key={key} label={`${group.icon} ${group.label}`}>
                    {group.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.id === ModelCatalog.GEMINI_3_8_FLASH ? "⭐ (Recommended)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null,
              )}
            </select>
          </div>

          {/* Which Model Should Be Selected: Recommendation Guide */}
          <div
            style={{
              marginTop: "12px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: "rgba(15, 23, 42, 0.7)",
              border: `1px solid ${currentGuide.badgeColor}40`,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  color: currentGuide.badgeColor,
                  letterSpacing: "0.05em",
                }}
              >
                {currentGuide.badge}
              </span>
            </div>
            <strong style={{ fontSize: "0.82rem", color: "#f8fafc" }}>
              {currentGuide.title}
            </strong>
            <p style={{ margin: 0, fontSize: "0.74rem", color: "#cbd5e1", lineHeight: 1.4 }}>
              {currentGuide.reason}
            </p>
            <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "2px" }}>
              <strong>Best for:</strong> {currentGuide.recommendedUseCase}
            </div>
          </div>

          <div className="spec-row" style={{ marginTop: "12px" }}>
            <span className="spec-label">Strategy:</span>
            <span className="spec-val uppercase">{state.activeStrategy}</span>
          </div>
          <div className="spec-row">
            <span className="spec-label">Active Session:</span>
            <span className="spec-val truncate">{state.activeSessionId || "None"}</span>
          </div>
          <button className="desktop-new-session-btn" onClick={() => state.handleNewSession()}>
            + Spawn Fresh Session
          </button>
        </div>

        {/* Authentication & Credential Status Inspector Card */}
        <div className="inspector-card">
          <h4>Authentication & Token Metrics</h4>
          <div className="spec-row">
            <span className="spec-label">Auth Status:</span>
            <span
              className="spec-val"
              style={{
                color: activeAccount ? "#10b981" : "#eab308",
                fontWeight: 600,
              }}
            >
              {activeAccount ? "AUTHENTICATED ✔" : "UNCONFIGURED ⚠️"}
            </span>
          </div>
          {activeAccount && (
            <>
              <div className="spec-row">
                <span className="spec-label">Auth Protocol:</span>
                <span className="spec-val uppercase">{activeAccount.authType}</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">User Account:</span>
                <span className="spec-val truncate">{activeAccount.userEmail || activeAccount.accountName}</span>
              </div>
            </>
          )}
          <div className="spec-row">
            <span className="spec-label">Tokens Consumed:</span>
            <span className="spec-val" style={{ color: "#38bdf8", fontWeight: 700 }}>
              ⚡ {totalSessionTokens} tokens
            </span>
          </div>
          <button
            type="button"
            onClick={() => state.setActiveTab("model-config")}
            style={{
              marginTop: "10px",
              width: "100%",
              padding: "6px 12px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "6px",
              color: "#93c5fd",
              fontSize: "0.76rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ⚙️ Manage Model Accounts & Auth
          </button>
        </div>

        {activeSessionObj && (
          <div className="inspector-card">
            <h4>Session Lineage Details</h4>
            <div className="spec-row">
              <span className="spec-label">Turns Count:</span>
              <span className="spec-val">{activeSessionObj.turnCount}</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Cookies Count:</span>
              <span className="spec-val">{activeSessionObj.cookies?.length || 0}</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Created At:</span>
              <span className="spec-val">{new Date(activeSessionObj.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
