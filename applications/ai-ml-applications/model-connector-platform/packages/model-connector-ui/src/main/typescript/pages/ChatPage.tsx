import React, { useState, useMemo } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { ModelCatalog } from "@/constants/providerConfigConstants";
import {
  SearchableModelDropdown,
  StatusBadge,
  SegmentedControl,
} from "@/components/common";

interface ChatPageProps {
  readonly state: ModelConnectorState;
}

export const ChatPage: React.FC<ChatPageProps> = ({ state }) => {
  const [inputPrompt, setInputPrompt] = useState("");
  const [filterRegisteredOnly, setFilterRegisteredOnly] = useState<boolean>(true);
  const [copiedSession, setCopiedSession] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  const handleSend = () => {
    if (!inputPrompt.trim() || state.isLoading) return;
    void state.handleSendMessage(inputPrompt);
    setInputPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeSessionObj = state.sessions.find((s) => s.sessionId === state.activeSessionId);

  const registeredModelMap = useMemo(() => {
    const map = new Map<string, (typeof state.modelAccounts)[0]>();
    for (const acc of state.modelAccounts || []) {
      if (acc.isActive || !map.has(acc.modelId)) {
        map.set(acc.modelId, acc);
      }
    }
    return map;
  }, [state.modelAccounts]);

  const registeredModels = useMemo(() => {
    return state.models
      .filter((m) => {
        const hasAccount = registeredModelMap.has(m.id);
        const mid = m.id.toLowerCase();
        const fam = m.family?.toLowerCase() || "";
        const isOllama =
          fam.includes("ollama") ||
          mid.includes("llama") ||
          mid.includes("ollama") ||
          mid.includes("deepseek");
        return hasAccount || isOllama;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.models, registeredModelMap]);

  const registeredModelIdsSet = useMemo(
    () => new Set(registeredModels.map((m) => m.id)),
    [registeredModels],
  );

  const displayModels = useMemo(() => {
    const list =
      filterRegisteredOnly && registeredModels.length > 0 ? registeredModels : state.models;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [filterRegisteredOnly, registeredModels, state.models]);

  const activeAccount = useMemo(
    () => state.modelAccounts.find((a) => a.modelId === state.selectedModel && a.isActive),
    [state.modelAccounts, state.selectedModel],
  );

  const totalSessionTokens = useMemo(
    () => state.messages.reduce((acc, msg) => acc + (msg.tokenCount || 0), 0),
    [state.messages],
  );

  const copySessionId = () => {
    if (!state.activeSessionId || typeof navigator === "undefined") return;
    void navigator.clipboard?.writeText(state.activeSessionId);
    setCopiedSession(true);
    setTimeout(() => setCopiedSession(false), 2000);
  };

  return (
    <div className="desktop-chat-layout desktop-chat-view">
      <div className="chat-conversation-panel">
        {/* Top Chat Header */}
        <div className="chat-panel-header">
          <div className="chat-header-left">
            <span className="chat-header-icon" aria-hidden="true">💬</span>
            <div className="chat-header-title-block">
              <strong className="chat-model-title">{state.selectedModel}</strong>
              <span className="chat-strategy-subtitle">
                via {state.effectiveStrategy.toUpperCase()}
              </span>
            </div>
            <button
              type="button"
              className="btn-ui-secondary btn-xs"
              onClick={() => void state.handleNewSession()}
              title="Spawn fresh new conversation session"
            >
              ➕ New Chat
            </button>
          </div>

          <div className="chat-header-right">
            {activeAccount ? (
              <StatusBadge
                label={`AUTH: ${
                  activeAccount.authType === "cli_oauth" || activeAccount.authType === "oauth"
                    ? "CLI OAuth"
                    : activeAccount.authType.toUpperCase()
                }`}
                tone="success"
                showDot
                title={`Active Credential: ${activeAccount.accountName} (${activeAccount.userEmail})`}
              />
            ) : (
              <button
                type="button"
                className="chat-auth-setup-btn"
                onClick={() => state.setActiveTab("model-config")}
              >
                ⚠️ Setup Auth
              </button>
            )}

            <StatusBadge label={`⚡ ${totalSessionTokens} tokens`} tone="info" />

            <button
              type="button"
              className="btn-ui-secondary btn-xs chat-inspector-toggle"
              onClick={() => setMobileInspectorOpen((prev) => !prev)}
            >
              {mobileInspectorOpen ? "Hide Settings" : "⚙️ Model"}
            </button>
          </div>
        </div>

        {/* Registered Models Quick Switcher Bar */}
        {registeredModels.length > 0 && (
          <div className="chat-quick-switcher-bar">
            <span className="switcher-label">Registered:</span>
            <div className="switcher-pills">
              {registeredModels.map((rm) => {
                const isSelected = state.selectedModel === rm.id;
                const acc = registeredModelMap.get(rm.id);
                const authTag =
                  acc?.authType === "cli_oauth" || acc?.authType === "oauth"
                    ? "CLI"
                    : acc?.authType || "Active";
                return (
                  <button
                    key={rm.id}
                    type="button"
                    className={`registered-model-chip ${isSelected ? "active" : ""}`}
                    onClick={() => state.setSelectedModel(rm.id)}
                    title={`Switch to ${rm.name} (${authTag.toUpperCase()})`}
                  >
                    <span className="chip-dot" aria-hidden="true" />
                    <span className="chip-name">{rm.name}</span>
                    <span className="chip-auth">({authTag})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Messages Stream */}
        <div className="messages-stream">
          {state.messages.length === 0 ? (
            <div className="chat-empty-state">
              <div className="empty-icon" aria-hidden="true">🤖</div>
              <h3>Ready for Multi-Model Inference</h3>
              <p>
                Selected model: <strong>{state.selectedModel}</strong> via{" "}
                <strong>{state.effectiveStrategy.toUpperCase()}</strong> strategy.
              </p>
              <div className="quick-suggestions">
                <button
                  type="button"
                  onClick={() => void state.handleSendMessage("Hi , whats date time now ?")}
                >
                  Hi , whats date time now ? ⏱️
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void state.handleSendMessage("Explain quantum computing in one sentence")
                  }
                >
                  Quantum Computing 🚀
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void state.handleSendMessage(
                      "Write a high-performance TypeScript debounce function",
                    )
                  }
                >
                  TypeScript Snippet 💻
                </button>
                <button
                  type="button"
                  onClick={() => void state.handleSendMessage("Verify fallback runtime connectivity")}
                >
                  Verify Fallback 🛡️
                </button>
              </div>
            </div>
          ) : (
            state.messages.map((msg) => {
              const isFallback = Boolean(
                msg.fallbackOccurred ||
                  (msg.requestedModel && msg.requestedModel !== msg.model) ||
                  (msg.role === "assistant" &&
                    msg.model.includes("llama") &&
                    !state.selectedModel.includes("llama")),
              );
              const originalRequestedModel = msg.requestedModel || state.selectedModel;

              return (
                <div
                  key={msg.id}
                  className={`desktop-message-card ${msg.role} ${
                    isFallback ? "fallback-message" : ""
                  }`}
                >
                  <div className="msg-header">
                    <span className="msg-author">
                      {msg.role === "user" ? (
                        "👤 User"
                      ) : isFallback ? (
                        <span className="fallback-author-wrapper">
                          <span>🤖 {msg.model}</span>
                          <span
                            className="fallback-pill-badge"
                            title={`Original requested model: ${originalRequestedModel}`}
                          >
                            🔄 Fallback from {originalRequestedModel}
                          </span>
                        </span>
                      ) : (
                        `🤖 ${msg.model}`
                      )}
                    </span>
                    <span className="msg-meta">
                      {isFallback && (
                        <span
                          className="fallback-engine-tag"
                          title="Local air-gapped Ollama container fallback executed"
                        >
                          🛡️ OLLAMA DOCKER
                        </span>
                      )}
                      {msg.strategy && (
                        <span className="strategy-tag">{msg.strategy.toUpperCase()}</span>
                      )}
                      {msg.latencyMs ? <span className="latency-tag">{msg.latencyMs}ms</span> : null}
                      {msg.tokenCount ? (
                        <span className="token-tag">⚡ {msg.tokenCount} tokens</span>
                      ) : null}
                      <span className="time-tag">{msg.timestamp}</span>
                    </span>
                  </div>

                  {isFallback && (
                    <div className="chat-fallback-notice">
                      <div className="notice-header">
                        <span className="notice-icon">⚠️</span>
                        <span className="notice-title">Model Fallback Notification</span>
                        <span className="notice-badge">Local Ollama Active</span>
                      </div>
                      <p className="notice-desc">
                        {msg.fallbackReason ||
                          `Token expired or authentication failed for '${originalRequestedModel}'. Automatically routed to local air-gapped Ollama (${msg.model}) container.`}
                      </p>
                    </div>
                  )}

                  <div className="msg-body">{msg.content}</div>
                </div>
              );
            })
          )}
          {state.isLoading && (
            <div className="desktop-loading-card">
              <div className="spinner" />
              <span>
                Processing multi-model inference via {state.effectiveStrategy.toUpperCase()}{" "}
                strategy...
              </span>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="chat-composer-bar">
          <textarea
            className="desktop-chat-input"
            rows={2}
            placeholder="Enter prompt... (Press Enter to send, Shift+Enter for new line)"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={state.isLoading}
          />
          <button
            type="button"
            className="desktop-send-btn"
            onClick={handleSend}
            disabled={state.isLoading || !inputPrompt.trim()}
          >
            {state.isLoading ? "Sending..." : "Send 🚀"}
          </button>
        </div>
      </div>

      {/* Inspector Panel (Docked on Desktop, Toggleable on Mobile/Tablet) */}
      <aside className={`chat-inspector-panel ${mobileInspectorOpen ? "mobile-open" : ""}`}>
        <div className="inspector-card">
          <div className="inspector-card-header">
            <h4>Model Selection</h4>
            {registeredModels.length > 0 && (
              <SegmentedControl
                ariaLabel="Filter model list"
                value={filterRegisteredOnly ? "registered" : "all"}
                onChange={(val) => setFilterRegisteredOnly(val === "registered")}
                options={[
                  { value: "registered", label: `Registered (${registeredModels.length})` },
                  { value: "all", label: `All (${state.models.length})` },
                ]}
              />
            )}
          </div>

          <div className="spec-field-block">
            <label className="spec-label">
              Active Model (
              {filterRegisteredOnly && registeredModels.length > 0
                ? "Registered Only"
                : "All Models"}
              ):
            </label>
            <SearchableModelDropdown
              models={displayModels}
              selectedModelId={state.selectedModel}
              onSelectModel={(id) => state.setSelectedModel(id)}
              registeredModelIds={registeredModelIdsSet}
              recommendedModelId={ModelCatalog.GEMINI_3_8_FLASH}
              placeholder="Type to filter model name..."
            />
          </div>

          <div className="spec-field-block">
            <div className="spec-label-row">
              <label className="spec-label">Reasoning Effort:</label>
              <span className="effort-indicator">{state.reasoningEffort}</span>
            </div>
            <div className="effort-grid">
              {(["low", "medium", "high"] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={`effort-btn tier-${tier} ${
                    state.reasoningEffort === tier ? "active" : ""
                  }`}
                  onClick={() => state.setReasoningEffort(tier)}
                >
                  {tier === "low" ? "⚡ Low" : tier === "medium" ? "⚖️ Med" : "🧠 High"}
                </button>
              ))}
            </div>
          </div>

          <div className="spec-field-block">
            <label className="spec-label">Registered Authentication:</label>
            {activeAccount ? (
              <div className="inspector-auth-box is-connected">
                <div className="auth-box-row">
                  <span className="auth-type-label">
                    🟢{" "}
                    {activeAccount.authType === "cli_oauth"
                      ? "CLI OAuth 2.0"
                      : activeAccount.authType.toUpperCase()}
                  </span>
                  <StatusBadge label="Active" tone="success" />
                </div>
                <span className="auth-account-email truncate">
                  {activeAccount.userEmail || activeAccount.accountName || "Account Connected"}
                </span>
              </div>
            ) : (
              <div className="inspector-auth-box is-missing">
                <span className="auth-missing-text">⚠️ No Credentials Bound</span>
                <button
                  type="button"
                  className="btn-ui-secondary btn-xs"
                  onClick={() => state.setActiveTab("model-config")}
                >
                  Setup
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="inspector-card">
          <h4>Session &amp; Telemetry</h4>
          <div className="spec-field-block">
            <span className="spec-label">Active Session ID:</span>
            <div className="session-copy-row">
              <code className="session-id-code" title={state.activeSessionId}>
                {state.activeSessionId || "None (Fresh)"}
              </code>
              <button
                type="button"
                className="btn-ui-secondary btn-xs"
                onClick={copySessionId}
                title="Copy Session ID"
              >
                {copiedSession ? "✔" : "📋"}
              </button>
            </div>
          </div>

          <div className="spec-row">
            <span className="spec-label">Turns Count:</span>
            <span className="spec-val">
              {activeSessionObj?.turnCount || state.messages.length}
            </span>
          </div>

          <div className="spec-row">
            <span className="spec-label">Tokens Consumed:</span>
            <span className="spec-val accent">⚡ {totalSessionTokens}</span>
          </div>

          <button
            type="button"
            className="desktop-new-session-btn"
            onClick={() => void state.handleNewSession()}
          >
            + Spawn Fresh Session
          </button>

          <div className="inspector-shortcuts-grid">
            <button
              type="button"
              className="btn-ui-secondary btn-xs"
              onClick={() => state.setActiveTab("model-config")}
            >
              ⚙️ Config Studio
            </button>
            <button
              type="button"
              className="btn-ui-secondary btn-xs"
              onClick={() => state.setActiveTab("upstream")}
            >
              📊 Telemetry Logs
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
