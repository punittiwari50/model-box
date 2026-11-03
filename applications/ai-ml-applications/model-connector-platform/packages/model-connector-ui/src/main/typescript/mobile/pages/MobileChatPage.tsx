import React, { useState, useMemo } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { ModelCatalog } from "@/constants/providerConfigConstants";

interface MobileChatPageProps {
  readonly state: ModelConnectorState;
}

export const MobileChatPage: React.FC<MobileChatPageProps> = ({ state }) => {
  const [inputPrompt, setInputPrompt] = useState("");

  const handleSend = () => {
    if (!inputPrompt.trim() || state.isLoading) return;
    state.handleSendMessage(inputPrompt);
    setInputPrompt("");
  };

  // Group models by category (Requirement 4)
  const groupedModels = useMemo(() => {
    const groups: Record<string, { label: string; icon: string; models: typeof state.models }> = {
      gemini: { label: "Google Gemini", icon: "✦", models: [] },
      claude: { label: "Anthropic Claude", icon: "🧠", models: [] },
      openai: { label: "OpenAI ChatGPT", icon: "🤖", models: [] },
      grok: { label: "xAI Grok", icon: "⚡", models: [] },
      ollama: { label: "Local Fallback", icon: "🛡️", models: [] },
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

  // Active authentication status for selected model
  const activeAccount = useMemo(() => {
    return state.modelAccounts.find(
      (a) => a.modelId === state.selectedModel && a.isActive,
    );
  }, [state.modelAccounts, state.selectedModel]);

  // Total session tokens consumed
  const totalSessionTokens = useMemo(() => {
    return state.messages.reduce((acc, msg) => acc + (msg.tokenCount || 0), 0);
  }, [state.messages]);

  return (
    <div className="mobile-chat-view">
      {/* Mobile Top Header: Model Selector (Category Grouped) & Auth Status */}
      <div
        style={{
          padding: "8px 12px",
          background: "rgba(15, 23, 42, 0.9)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <select
            value={state.selectedModel}
            onChange={(e) => state.setSelectedModel(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 8px",
              background: "rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "0.78rem",
            }}
          >
            {Object.entries(groupedModels).map(([key, group]) =>
              group.models.length > 0 ? (
                <optgroup key={key} label={`${group.icon} ${group.label}`}>
                  {group.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.id === ModelCatalog.GEMINI_3_8_FLASH ? "⭐" : ""}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </select>

          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: "100px",
              background: "rgba(59, 130, 246, 0.2)",
              color: "#93c5fd",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              whiteSpace: "nowrap",
            }}
          >
            ⚡ {totalSessionTokens} tk
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              fontSize: "0.68rem",
              color: activeAccount ? "#6ee7b7" : "#fde047",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: activeAccount ? "#10b981" : "#eab308",
              }}
            />
            {activeAccount
              ? `Auth: ${activeAccount.authType.toUpperCase()} (${activeAccount.userEmail || "Connected"})`
              : "Auth: Not Configured"}
          </span>

          <span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>
            {state.selectedModel === ModelCatalog.GEMINI_3_8_FLASH
              ? "⭐ Recommended Model"
              : state.selectedModel.startsWith("claude")
              ? "🧠 Agentic Reasoning"
              : "Standard Inference"}
          </span>
        </div>
      </div>

      <div className="mobile-strategy-bar">
        <span className="strategy-label">Strategy:</span>
        {(["api", "cli", "cookie"] as const).map((strat) => (
          <button
            key={strat}
            className={`mobile-strategy-chip ${state.activeStrategy === strat ? "active" : ""}`}
            onClick={() => state.setActiveStrategy(strat)}
          >
            {strat.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="mobile-messages-container">
        {state.messages.length === 0 ? (
          <div className="mobile-chat-empty">
            <div className="empty-icon">🤖</div>
            <h4>Ready for Mobile AI Inference</h4>
            <p>Model: {state.selectedModel}</p>
            <div className="mobile-suggestions">
              <button onClick={() => state.handleSendMessage("Hi , whats date time now ?")}>
                Hi , whats date time now ? ⏱️
              </button>
              <button onClick={() => state.handleSendMessage("Hello! Summarize key AI trends.")}>
                AI Trends 💡
              </button>
              <button onClick={() => state.handleSendMessage("Verify local fallback connectivity")}>
                Fallback Runner 🛡️
              </button>
            </div>
          </div>
        ) : (
          state.messages.map((msg) => (
            <div key={msg.id} className={`mobile-msg-bubble ${msg.role}`}>
              <div className="bubble-header">
                <span className="bubble-author">{msg.role === "user" ? "You" : msg.model}</span>
                {msg.latencyMs && <span className="bubble-latency">{msg.latencyMs}ms</span>}
              </div>
              <div className="bubble-content">{msg.content}</div>
              <div className="bubble-footer">
                {msg.strategy && <span className="bubble-tag">{msg.strategy.toUpperCase()}</span>}
                {msg.tokenCount && <span className="bubble-tag" style={{ color: "#93c5fd" }}>⚡ {msg.tokenCount} tk</span>}
                <span className="bubble-time">{msg.timestamp}</span>
              </div>
            </div>
          ))
        )}

        {state.isLoading && (
          <div className="mobile-loading-indicator">
            <div className="spinner-dots">
              <span />
              <span />
              <span />
            </div>
            <span>Running inference via {state.activeStrategy.toUpperCase()}...</span>
          </div>
        )}
      </div>

      <div className="mobile-input-bar">
        <input
          type="text"
          className="mobile-text-input"
          placeholder={`Ask ${state.selectedModel}... (e.g. 'Hi , whats date time now ?')`}
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={state.isLoading}
        />
        <button
          className="mobile-send-button"
          onClick={handleSend}
          disabled={state.isLoading || !inputPrompt.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
};
