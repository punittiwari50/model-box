import React, { useState, useMemo, useEffect } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import {
  StatusBadge,
  EmptyState,
} from "@/components/common";
import { ChatSettingsDrawer } from "@/components/chat/ChatSettingsDrawer";

interface ChatPageProps {
  readonly state: ModelConnectorState;
}

export const ChatPage: React.FC<ChatPageProps> = ({ state }) => {
  const [inputPrompt, setInputPrompt] = useState("");
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  // Hyperparameters & Configuration state (Requirement 8)
  const [temperature, setTemperature] = useState<number>(0.7);
  const [topP, setTopP] = useState<number>(0.95);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  const [presencePenalty, setPresencePenalty] = useState<number>(0.0);
  const [systemPrompt, setSystemPrompt] = useState<string>("");

  // UX 1: View mode (active conversation vs full chat history list view)
  const [chatViewMode, setChatViewMode] = useState<"chat" | "history">("chat");
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState<boolean>(true);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  // UX 4: Interactive selected message turn for telemetry
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldName: string) => {
    if (!text || typeof navigator === "undefined") return;
    void navigator.clipboard?.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSend = () => {
    if (!inputPrompt.trim() || state.isLoading) return;
    void state.handleSendMessage(inputPrompt);
    setInputPrompt("");
    setChatViewMode("chat");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Helper: Detect if a model is Gemini
  const isGemini = (modelId: string, family?: string): boolean => {
    const fam = (family || "").toLowerCase();
    const mid = (modelId || "").toLowerCase();
    return fam.includes("gemini") || mid.includes("gemini");
  };

  // Requirement 3: Set initial default reasoning effort to "low" when switching to Gemini
  const previousModelRef = React.useRef(state.selectedModel);
  useEffect(() => {
    if (previousModelRef.current !== state.selectedModel) {
      previousModelRef.current = state.selectedModel;
      if (isGemini(state.selectedModel)) {
        state.setReasoningEffort("low");
      }
    }
  }, [state.selectedModel, state.setReasoningEffort]);

  const activeModel = useMemo(
    () => state.models.find((m) => m.id === state.selectedModel),
    [state.models, state.selectedModel],
  );

  const activeAccount = useMemo(
    () => state.modelAccounts.find((a) => a.modelId === state.selectedModel && a.isActive),
    [state.modelAccounts, state.selectedModel],
  );

  const totalSessionTokens = useMemo(
    () => state.messages.reduce((acc, msg) => acc + (msg.tokenCount || 0), 0),
    [state.messages],
  );

  // Requirement 4: Latest / Selected assistant message for live chat telemetry
  const telemetryMessage = useMemo(() => {
    if (selectedTurnId) {
      const found = state.messages.find((m) => m.id === selectedTurnId);
      if (found) return found;
    }
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === "assistant") {
        return state.messages[i];
      }
    }
    return undefined;
  }, [state.messages, selectedTurnId]);

  // Filtered Sessions for Chat History List View
  const filteredSessions = useMemo(() => {
    const q = historySearchQuery.trim().toLowerCase();
    if (!q) return state.sessions;
    return state.sessions.filter(
      (s) =>
        s.sessionId.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q) ||
        s.strategy.toLowerCase().includes(q),
    );
  }, [state.sessions, historySearchQuery]);

  const isSessionFallbackActive = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (
        Boolean((m as any).metadata?.fallbackUsed) ||
        Boolean((m as any).fallbackUsed) ||
        m.content?.includes("Fallback from") ||
        m.content?.includes("Model Fallback Notification") ||
        (m.role === "assistant" && (m.model?.includes("llama") || m.model?.includes("ollama")) && state.selectedModel?.includes("gemini"))
      ) {
        return true;
      }
    }
    return false;
  }, [state.messages, state.selectedModel]);

  const handleSelectSessionFromList = (sessionId: string) => {
    state.setActiveSessionId(sessionId);
    setChatViewMode("chat");
  };

  return (
    <div className={`desktop-chat-layout desktop-chat-view ${isHistorySidebarOpen ? "with-history-sidebar" : ""}`}>
      {/* ========================================================================= */}
      {/* 1. Collapsible Chat History Sidebar (Requirement 1: Chat History in List) */}
      {/* ========================================================================= */}
      {isHistorySidebarOpen && (
        <aside className="chat-history-sidebar ui-surface-card" data-testid="chat-history-sidebar">
          <div className="history-sidebar-header">
            <div className="history-title-group">
              <span className="history-icon" aria-hidden="true">📜</span>
              <h4>Chat History</h4>
              <span className="history-count-badge">{state.sessions.length}</span>
            </div>
            <button
              type="button"
              className="btn-history-close"
              onClick={() => setIsHistorySidebarOpen(false)}
              title="Collapse History Sidebar"
            >
              ✕
            </button>
          </div>

          <div className="history-actions-bar">
            <button
              type="button"
              className="btn-spawn-new-chat"
              onClick={() => void state.handleNewSession()}
              title="Spawn fresh new conversation"
            >
              ➕ New Chat
            </button>
          </div>

          <div className="history-search-box">
            <span className="history-search-icon">🔍</span>
            <input
              type="text"
              className="history-search-input"
              placeholder="Filter sessions..."
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
            />
            {historySearchQuery && (
              <button
                type="button"
                className="history-search-clear"
                onClick={() => setHistorySearchQuery("")}
              >
                ✕
              </button>
            )}
          </div>

          <div className="history-session-list">
            {filteredSessions.length === 0 ? (
              <div className="history-empty-state">
                <p>No chat sessions found</p>
                <button
                  type="button"
                  className="btn-ui-secondary btn-xs"
                  onClick={() => void state.handleNewSession()}
                >
                  Start New Session
                </button>
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isActive = state.activeSessionId === s.sessionId;
                return (
                  <div
                    key={s.sessionId}
                    className={`history-session-item ${isActive ? "active-session" : ""}`}
                    onClick={() => handleSelectSessionFromList(s.sessionId)}
                    title={`Model: ${s.model} • ${s.turnCount} turns • Click to load history`}
                  >
                    <div className="session-item-top">
                      <span className="session-model-name">
                        <span className="session-dot" />
                        {s.model}
                      </span>
                      {isActive && <span className="active-session-pill">Active</span>}
                      <button
                        type="button"
                        className="btn-session-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          void state.handleDeleteSession(s.sessionId);
                        }}
                        title="Delete chat session"
                      >
                        🗑️
                      </button>
                    </div>
                    <div className="session-item-meta">
                      <span className="session-turn-badge">{s.turnCount} turns</span>
                      <span className="session-strat-tag">{s.strategy.toUpperCase()}</span>
                      <span className="session-time">
                        {new Date(s.lastActiveAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* ========================================================================= */}
      {/* 2. Main Conversation / Chat History List Panel                            */}
      {/* ========================================================================= */}
      <div className="chat-conversation-panel">
        {/* Top Chat Header */}
        <div className="chat-panel-header">
          <div className="chat-header-left">
            <button
              type="button"
              className={`btn-ui-secondary btn-xs btn-toggle-history ${isHistorySidebarOpen ? "history-active" : ""}`}
              onClick={() => setIsHistorySidebarOpen((prev) => !prev)}
              title="Toggle Chat History list on the left"
            >
              📜 History ({state.sessions.length})
            </button>

            <span className="chat-header-icon" aria-hidden="true">💬</span>
            <div className="chat-header-title-block">
              <label htmlFor="chat-header-model-select" className="visually-hidden">Active Model</label>
              <select
                id="chat-header-model-select"
                className="chat-model-select"
                value={state.selectedModel}
                onChange={(e) => state.setSelectedModel(e.target.value)}
                title="Select model to chat with"
                aria-label="Select Model"
              >
                {state.models.length > 0 ? (
                  state.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.id} ({m.family || "model"}) {m.status === "ACTIVE" ? "• Active" : ""}
                    </option>
                  ))
                ) : (
                  <option value={state.selectedModel}>{state.selectedModel}</option>
                )}
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className="chat-strategy-subtitle">
                  via {state.effectiveStrategy.toUpperCase()}
                </span>
                {isSessionFallbackActive && (
                  <span
                    className="fallback-indicator-badge"
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      background: "#fef3c7",
                      color: "#92400e",
                      border: "1px solid #fde68a",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                    title="Conversation automatically routed to local Ollama fallback container"
                  >
                    ⚡ Ollama Fallback Active
                  </span>
                )}
              </div>
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
                label={`AUTH: ${activeAccount.authType === "cli_oauth" || activeAccount.authType === "oauth"
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
              className="btn-ui-secondary btn-xs chat-inspector-toggle btn-toggle-inspector"
              onClick={() => setMobileInspectorOpen((prev) => !prev)}
              title="Open Settings & Telemetry"
            >
              ⚙️ <span className="inspector-btn-text">{mobileInspectorOpen ? "Close Settings" : "Settings"}</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Content Area: Either History List View OR Conversation Messages Stream   */}
        {/* ========================================================================= */}
        {chatViewMode === "history" ? (
          <div className="chat-history-list-view" data-testid="chat-history-list-view">
            <div className="history-list-toolbar">
              <div className="toolbar-left">
                <h3>Conversation History ({filteredSessions.length})</h3>
                <p>Browse past conversation sessions with turn counts and token contexts.</p>
              </div>
              <div className="toolbar-right">
                <button
                  type="button"
                  className="btn-ui-primary btn-sm"
                  onClick={() => {
                    void state.handleNewSession();
                    setChatViewMode("chat");
                  }}
                >
                  ➕ Start Fresh Session
                </button>
              </div>
            </div>

            {filteredSessions.length === 0 ? (
              <EmptyState
                title="No Conversation Sessions Found"
                description="You haven't initiated any conversations yet. Click below to begin chatting."
                action={
                  <button
                    type="button"
                    className="btn-ui-primary"
                    onClick={() => {
                      void state.handleNewSession();
                      setChatViewMode("chat");
                    }}
                  >
                    Start Chatting
                  </button>
                }
              />
            ) : (
              <div className="history-sessions-grid">
                {filteredSessions.map((s) => {
                  const isActive = state.activeSessionId === s.sessionId;
                  return (
                    <div
                      key={s.sessionId}
                      className={`history-card-item ${isActive ? "active-card" : ""}`}
                      onClick={() => handleSelectSessionFromList(s.sessionId)}
                    >
                      <div className="card-top-row">
                        <span className="card-model-badge">🤖 {s.model}</span>
                        <div className="card-top-actions">
                          {isActive && <StatusBadge label="ACTIVE" tone="success" showDot />}
                          <button
                            type="button"
                            className="btn-card-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              void state.handleDeleteSession(s.sessionId);
                            }}
                            title="Delete conversation"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <div className="card-session-id">
                        <code>{s.sessionId}</code>
                      </div>

                      <div className="card-stats-row">
                        <span className="stat-pill">💬 {s.turnCount} turns</span>
                        <span className="stat-pill">⚡ {s.strategy.toUpperCase()}</span>
                        <span className="stat-pill">
                          🕒 {new Date(s.lastActiveAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="card-action-bar">
                        <button
                          type="button"
                          className="btn-resume-chat"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectSessionFromList(s.sessionId);
                          }}
                        >
                          {isActive ? "Viewing Session ✔" : "Resume Conversation →"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Messages Stream */
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
                const isSelectedTurn = selectedTurnId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`desktop-message-card ${msg.role} ${isFallback ? "fallback-message" : ""
                      } ${isSelectedTurn ? "turn-selected" : ""}`}
                    onClick={() => setSelectedTurnId(msg.id)}
                    title="Click to view live execution telemetry in the inspector"
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
        )}

        {/* Composer (Visible during chat conversation mode) */}
        {chatViewMode === "chat" && (
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
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. Settings & Telemetry Slide-over Drawer / Modal (Requirements 1, 2, 8)  */}
      {/* ========================================================================= */}
      <ChatSettingsDrawer
        isOpen={mobileInspectorOpen}
        onClose={() => setMobileInspectorOpen(false)}
        state={state}
        activeModel={activeModel}
        activeAccount={activeAccount}
        telemetryMessage={telemetryMessage}
        copiedField={copiedField}
        onCopy={copyToClipboard}
        temperature={temperature}
        setTemperature={setTemperature}
        topP={topP}
        setTopP={setTopP}
        maxTokens={maxTokens}
        setMaxTokens={setMaxTokens}
        presencePenalty={presencePenalty}
        setPresencePenalty={setPresencePenalty}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
      />
    </div>
  );
};
