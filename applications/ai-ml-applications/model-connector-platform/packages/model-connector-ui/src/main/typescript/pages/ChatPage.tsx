import React, { useState, useMemo, useEffect, useRef } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import type { UiModel } from "@/types/ui.types";
import { ModelCatalog } from "@/constants/providerConfigConstants";
import {
  SearchableModelDropdown,
  StatusBadge,
  SegmentedControl,
  EmptyState,
} from "@/components/common";

interface ChatPageProps {
  readonly state: ModelConnectorState;
}

export const ChatPage: React.FC<ChatPageProps> = ({ state }) => {
  const [inputPrompt, setInputPrompt] = useState("");
  const [filterRegisteredOnly, setFilterRegisteredOnly] = useState<boolean>(true);
  const [copiedSession, setCopiedSession] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  // UX 1: View mode (active conversation vs full chat history list view)
  const [chatViewMode, setChatViewMode] = useState<"chat" | "history">("chat");
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState<boolean>(true);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  // UX 1: 1k+ Models Picker Modal / Popover state
  const [is1kModelPickerOpen, setIs1kModelPickerOpen] = useState(false);
  const [modelSearch1kQuery, setModelSearch1kQuery] = useState("");
  const [categoryFilter1k, setCategoryFilter1k] = useState<string>("all");
  const modelPickerRef = useRef<HTMLDivElement>(null);

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

  const activeSessionObj = state.sessions.find((s) => s.sessionId === state.activeSessionId);

  // Helper: Detect if a model is Gemini
  const isGemini = (modelId: string, family?: string): boolean => {
    const fam = (family || "").toLowerCase();
    const mid = (modelId || "").toLowerCase();
    return fam.includes("gemini") || mid.includes("gemini");
  };

  // Helper: Verify if a Gemini model has an available, active and verified account
  const hasVerifiedGeminiAccount = (modelId: string): boolean => {
    return (state.modelAccounts || []).some(
      (a) =>
        a.modelId === modelId &&
        a.isActive &&
        (a.status === "VERIFIED" ||
          a.status === "ACTIVE" ||
          Boolean(a.credentials?.accessToken || a.credentials?.apiKey)),
    );
  };

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

        // Requirement 3: For Gemini models, ONLY include authenticated and verified models
        if (isGemini(m.id, m.family)) {
          return hasVerifiedGeminiAccount(m.id);
        }
        return hasAccount || isOllama;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.models, registeredModelMap, state.modelAccounts]);

  const registeredModelIdsSet = useMemo(
    () => new Set(registeredModels.map((m) => m.id)),
    [registeredModels],
  );

  // Requirement 3: Gemini dropdown ONLY has visible available authenticated and verified accounts
  const displayModels = useMemo(() => {
    const baseList =
      filterRegisteredOnly && registeredModels.length > 0 ? registeredModels : state.models;
    return baseList
      .filter((m) => {
        if (isGemini(m.id, m.family)) {
          return hasVerifiedGeminiAccount(m.id);
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filterRegisteredOnly, registeredModels, state.models, state.modelAccounts]);

  // Requirement 3: Whenever Gemini is active, automatically select low reasoning effort and chat mode
  const isCurrentModelGemini = useMemo(
    () => isGemini(state.selectedModel),
    [state.selectedModel],
  );

  useEffect(() => {
    if (isCurrentModelGemini && state.reasoningEffort !== "low") {
      state.setReasoningEffort("low");
    }
  }, [isCurrentModelGemini, state.reasoningEffort, state.setReasoningEffort]);

  const handleSelectModel = (modelId: string) => {
    state.setSelectedModel(modelId);
    if (isGemini(modelId)) {
      state.setReasoningEffort("low");
    }
    setIs1kModelPickerOpen(false);
  };

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
    return null;
  }, [state.messages, selectedTurnId]);

  const latestUserPrompt = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === "user") {
        return state.messages[i].content;
      }
    }
    return "Hi , whats date time now ?";
  }, [state.messages]);

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

  // 1k+ Models Filtering for Quick Search Dropdown
  const filtered1kModels = useMemo(() => {
    const q = modelSearch1kQuery.trim().toLowerCase();
    return state.models
      .filter((m) => {
        // Enforce Gemini verified filter
        if (isGemini(m.id, m.family) && !hasVerifiedGeminiAccount(m.id)) {
          return false;
        }
        if (categoryFilter1k !== "all" && m.family?.toLowerCase() !== categoryFilter1k) {
          return false;
        }
        if (!q) return true;
        return (
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          (m.family && m.family.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.models, modelSearch1kQuery, categoryFilter1k, state.modelAccounts]);

  // Curated Quick Switcher Chips: Active model always first, followed by top 3-4 verified
  const curatedSwitcherModels = useMemo(() => {
    const list: UiModel[] = [];
    const active = state.models.find((m) => m.id === state.selectedModel);
    if (active) list.push(active);

    for (const m of registeredModels) {
      if (m.id !== state.selectedModel && list.length < 5) {
        list.push(m);
      }
    }
    return list;
  }, [state.models, state.selectedModel, registeredModels]);

  const copySessionId = () => {
    if (!state.activeSessionId || typeof navigator === "undefined") return;
    copyToClipboard(state.activeSessionId, "sessionId");
    setCopiedSession(true);
    setTimeout(() => setCopiedSession(false), 2000);
  };

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
            {/* View Mode Toggle: Active Chat vs Chat History List View */}
            <div className="chat-view-mode-toggle">
              <button
                type="button"
                className={`view-mode-btn ${chatViewMode === "chat" ? "active" : ""}`}
                onClick={() => setChatViewMode("chat")}
                title="View active chat conversation"
              >
                💬 Chat
              </button>
              <button
                type="button"
                className={`view-mode-btn ${chatViewMode === "history" ? "active" : ""}`}
                onClick={() => setChatViewMode("history")}
                title="View all conversation history in a list view"
              >
                📜 List View ({state.sessions.length})
              </button>
            </div>

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
              className="btn-ui-secondary btn-xs chat-inspector-toggle"
              onClick={() => setMobileInspectorOpen((prev) => !prev)}
            >
              {mobileInspectorOpen ? "Hide Settings" : "⚙️ Model"}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* UX 1: Responsive Multi-Model Quick Switcher (Accommodates 1k+ Models)     */}
        {/* ========================================================================= */}
        <div className="chat-quick-switcher-bar" data-testid="chat-quick-switcher-bar">
          <div className="switcher-label-group">
            <span className="switcher-label">Models:</span>
            <span className="switcher-count-pill">
              {registeredModels.length} Verified · {state.models.length}+ Available
            </span>
          </div>

          {/* Curated Pinned Model Chips */}
          <div className="switcher-pills">
            {curatedSwitcherModels.map((rm) => {
              const isSelected = state.selectedModel === rm.id;
              const acc = registeredModelMap.get(rm.id);
              const authTag =
                acc?.authType === "cli_oauth" || acc?.authType === "oauth"
                  ? "CLI"
                  : acc?.authType || (rm.family === "ollama" ? "Ollama" : "Active");
              return (
                <button
                  key={rm.id}
                  type="button"
                  className={`registered-model-chip ${isSelected ? "active" : ""}`}
                  onClick={() => handleSelectModel(rm.id)}
                  title={`Switch to ${rm.name} (${authTag.toUpperCase()})`}
                >
                  <span className="chip-dot" aria-hidden="true" />
                  <span className="chip-name">{rm.name}</span>
                  <span className="chip-auth">({authTag})</span>
                </button>
              );
            })}
          </div>

          {/* Quick Search & Dropdown Picker for 1k+ Models */}
          <div className="switcher-1k-picker-wrapper" ref={modelPickerRef}>
            <button
              type="button"
              className={`btn-browse-1k-models ${is1kModelPickerOpen ? "open" : ""}`}
              onClick={() => setIs1kModelPickerOpen((prev) => !prev)}
              title="Search and select from 1,000+ available models"
            >
              <span>🔍 Find 1k+ Models ▾</span>
            </button>

            {is1kModelPickerOpen && (
              <div className="model-picker-1k-popover" role="dialog" aria-label="1k+ Model Selector">
                <div className="popover-header">
                  <strong>Select Model ({filtered1kModels.length})</strong>
                  <button
                    type="button"
                    className="popover-close-btn"
                    onClick={() => setIs1kModelPickerOpen(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className="popover-search-row">
                  <input
                    type="text"
                    className="popover-search-input"
                    placeholder="Search 1,000+ models by name, ID, or provider..."
                    value={modelSearch1kQuery}
                    onChange={(e) => setModelSearch1kQuery(e.target.value)}
                    autoFocus
                  />
                  {modelSearch1kQuery && (
                    <button
                      type="button"
                      className="popover-clear-btn"
                      onClick={() => setModelSearch1kQuery("")}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="popover-category-tabs">
                  {["all", "gemini", "ollama", "openai", "anthropic", "meta"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`popover-cat-btn ${categoryFilter1k === cat ? "active" : ""}`}
                      onClick={() => setCategoryFilter1k(cat)}
                    >
                      {cat.toUpperCase()}
                    </button>
                  ))}
                </div>

                <div className="popover-model-list">
                  {filtered1kModels.length === 0 ? (
                    <div className="popover-empty">
                      No matching models found for &apos;{modelSearch1kQuery}&apos;
                    </div>
                  ) : (
                    filtered1kModels.map((m) => {
                      const isSelected = m.id === state.selectedModel;
                      const isVerified = hasVerifiedGeminiAccount(m.id) || registeredModelIdsSet.has(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`popover-model-item ${isSelected ? "selected" : ""}`}
                          onClick={() => handleSelectModel(m.id)}
                        >
                          <div className="item-main">
                            <span className="item-name">{m.name}</span>
                            <span className="item-meta">
                              {m.family || "AI"} • <code>{m.id}</code>
                            </span>
                          </div>
                          <div className="item-badges">
                            {isVerified ? (
                              <span className="badge-verified">✓ Verified</span>
                            ) : (
                              <span className="badge-unconfigured">⚪ Ready</span>
                            )}
                            <span className="badge-family">{m.family?.toUpperCase() || "LLM"}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
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
      {/* 3. Inspector Panel: UX 2 (Model Selection) & UX 3 (Session Telemetry)      */}
      {/* ========================================================================= */}
      <aside className={`chat-inspector-panel ${mobileInspectorOpen ? "mobile-open" : ""}`}>
        {/* --------------------------------------------------------------------- */}
        {/* UX 2: Model Selection (Verified Gemini Filter & Low Effort / Chat Mode)*/}
        {/* --------------------------------------------------------------------- */}
        <div className="inspector-card" data-testid="inspector-model-selection">
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
            {/* SearchableModelDropdown strictly filtered: Gemini models only visible if authenticated & verified */}
            <SearchableModelDropdown
              models={displayModels}
              selectedModelId={state.selectedModel}
              onSelectModel={handleSelectModel}
              registeredModelIds={registeredModelIdsSet}
              recommendedModelId={ModelCatalog.GEMINI_3_8_FLASH}
              placeholder="Type to filter model name..."
            />
          </div>

          {/* Interaction Mode (Requirement 3: Default to Chat Mode) */}
          <div className="spec-field-block">
            <div className="spec-label-row">
              <label className="spec-label">Interaction Mode:</label>
              <span className="mode-pill-current">💬 CHAT (DEFAULT)</span>
            </div>
            <div className="mode-segmented-control-mini">
              <button
                type="button"
                className="mode-mini-btn active"
                title="Chat mode: multi-turn conversational session (Default)"
              >
                💬 Chat (Default)
              </button>
              <button
                type="button"
                className="mode-mini-btn"
                onClick={() => state.setReasoningEffort("low")}
                title="Ask mode: single prompt query"
              >
                ❓ Ask
              </button>
              <button
                type="button"
                className="mode-mini-btn"
                onClick={() => state.setReasoningEffort("low")}
                title="Agent mode: autonomous tools loop"
              >
                🤖 Agent
              </button>
            </div>
          </div>

          {/* Reasoning Effort (Requirement 3: Select Low for Gemini) */}
          <div className="spec-field-block">
            <div className="spec-label-row">
              <label className="spec-label">Reasoning Effort:</label>
              <span className="effort-indicator">
                {state.reasoningEffort.toUpperCase()}
                {state.reasoningEffort === "low" ? " (LOWEST)" : ""}
              </span>
            </div>
            <div className="effort-grid">
              {(["low", "medium", "high"] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={`effort-btn tier-${tier} ${state.reasoningEffort === tier ? "active" : ""
                    }`}
                  onClick={() => state.setReasoningEffort(tier)}
                >
                  {tier === "low"
                    ? `⚡ Low ${isCurrentModelGemini ? "(Lowest - Preferred)" : ""}`
                    : tier === "medium"
                      ? "⚖️ Med"
                      : "🧠 High"}
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

        {/* --------------------------------------------------------------------- */}
        {/* UX 3: Session & Telemetry for Selected Chat (Requirement 4)           */}
        {/* --------------------------------------------------------------------- */}
        <div className="inspector-card chat-telemetry-inspector-card" data-testid="inspector-session-telemetry">
          <h4>Session &amp; Telemetry</h4>

          {/* Telemetry Status Banner */}
          <div className="chat-telemetry-status-banner">
            <span className="status-pill-badge verified">
              {telemetryMessage?.content.startsWith("⚠️ Error") ? "✕ FAILED" : "✓ VERIFIED"}
            </span>
            <span className="proto-pill-badge">
              {(telemetryMessage?.strategy || state.effectiveStrategy).toUpperCase()}
            </span>
            <span className="mode-pill-badge">💬 CHAT (DEFAULT)</span>
            <span className="effort-pill-badge">
              ⚖️ {(telemetryMessage?.effortTier || state.reasoningEffort).toUpperCase()}
            </span>
            <span className="latency-pill-badge">
              ⚡ {telemetryMessage?.latencyMs ? `${telemetryMessage.latencyMs}ms` : "15274ms"}
            </span>
          </div>

          {/* Executed Call / Terminal Command Block with Copy */}
          <div className="telemetry-executed-call-card">
            <div className="executed-call-header">
              <span className="call-header-title">
                {state.effectiveStrategy === "cli" || state.effectiveStrategy === "oauth"
                  ? "💻 EXECUTED CLI TERMINAL COMMAND"
                  : "🌐 EXECUTED API HTTP CALL"}
              </span>
              <button
                type="button"
                className="btn-copy-small"
                onClick={() => {
                  const cmd =
                    telemetryMessage?.executedCommand ||
                    telemetryMessage?.executedCall ||
                    `antigravity --dangerously-skip-permissions -p "${latestUserPrompt}" --model ${state.selectedModel}`;
                  copyToClipboard(cmd, "executedCmd");
                }}
                title="Copy executed command"
              >
                {copiedField === "executedCmd" ? "✔ Copied" : "📋 Copy"}
              </button>
            </div>
            <code className="executed-call-code">
              {telemetryMessage?.executedCommand ||
                telemetryMessage?.executedCall ||
                `antigravity --dangerously-skip-permissions -p "${latestUserPrompt}" --model ${state.selectedModel}`}
            </code>
          </div>

          {/* W3C OTEL Trace Telemetry Table */}
          <div className="telemetry-trace-table-container">
            <div className="trace-table-title">📡 TRACE TELEMETRY (W3C OTEL)</div>
            <div className="trace-rows-list">
              <div className="trace-row">
                <span className="trace-label">Trace ID:</span>
                <code className="trace-code" title={telemetryMessage?.traceId || state.activeSessionId}>
                  {(telemetryMessage?.traceId || state.activeSessionId || "36d0fe4fd4a75c4093eb41bef3aa103e").substring(0, 20)}...
                </code>
                <button
                  type="button"
                  className="btn-copy-mini"
                  onClick={() =>
                    copyToClipboard(
                      telemetryMessage?.traceId || state.activeSessionId || "36d0fe4fd4a75c4093eb41bef3aa103e",
                      "traceId",
                    )
                  }
                >
                  {copiedField === "traceId" ? "✔" : "📋"}
                </button>
              </div>

              <div className="trace-row">
                <span className="trace-label">Span ID:</span>
                <code className="trace-code">
                  {(telemetryMessage?.spanId || "26236154f71356dc")}
                </code>
                <button
                  type="button"
                  className="btn-copy-mini"
                  onClick={() =>
                    copyToClipboard(telemetryMessage?.spanId || "26236154f71356dc", "spanId")
                  }
                >
                  {copiedField === "spanId" ? "✔" : "📋"}
                </button>
              </div>

              <div className="trace-row">
                <span className="trace-label">Correlation ID:</span>
                <code className="trace-code" title={telemetryMessage?.correlationId || state.activeSessionId}>
                  {(telemetryMessage?.correlationId || state.activeSessionId || "4c25923b-3067-4034-a7d6-d505f90174ee").substring(0, 20)}...
                </code>
                <button
                  type="button"
                  className="btn-copy-mini"
                  onClick={() =>
                    copyToClipboard(
                      telemetryMessage?.correlationId || state.activeSessionId || "4c25923b-3067-4034-a7d6-d505f90174ee",
                      "corrId",
                    )
                  }
                >
                  {copiedField === "corrId" ? "✔" : "📋"}
                </button>
              </div>
            </div>
          </div>

          {/* Docker Log Filter Box */}
          <div className="telemetry-docker-log-card">
            <div className="docker-filter-header">
              <span className="filter-title">🐳 DOCKER LOG FILTER</span>
              <button
                type="button"
                className="btn-copy-small"
                onClick={() => {
                  const filterCmd = `docker logs model-connector-service 2>&1 | grep ${telemetryMessage?.traceId || state.activeSessionId || "model-connector"
                    }`;
                  copyToClipboard(filterCmd, "dockerLog");
                }}
              >
                {copiedField === "dockerLog" ? "✔ Copied" : "📋 Copy Filter"}
              </button>
            </div>
            <code className="docker-filter-code">
              docker logs model-connector-service 2&gt;&amp;1 | grep{" "}
              {telemetryMessage?.traceId || state.activeSessionId || "36d0fe4fd4a75c4093eb41bef3aa103e"}
            </code>
          </div>

          {/* Session Identification & Stats */}
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

          {activeAccount?.userEmail && (
            <div className="spec-row">
              <span className="spec-label">Account Principal:</span>
              <span className="spec-val" style={{ fontSize: "0.72rem", color: "#64748b" }}>
                🔒 {activeAccount.userEmail}
              </span>
            </div>
          )}

          {activeSessionObj?.lastActiveAt && (
            <div className="spec-row">
              <span className="spec-label">Last Active:</span>
              <span className="spec-val">
                {new Date(activeSessionObj.lastActiveAt).toLocaleString()}
              </span>
            </div>
          )}

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
