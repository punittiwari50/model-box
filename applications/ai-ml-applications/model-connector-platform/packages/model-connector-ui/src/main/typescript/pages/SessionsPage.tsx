import React, { useState } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import type { UiSession } from "@/types/ui.types";
import {
  PageHeader,
  StatCard,
  StatCardGrid,
  SegmentedControl,
  ResourceCard,
  StatusBadge,
  EmptyState,
  Pagination,
  DeleteRecordModal,
} from "@/components/common";

interface SessionsPageProps {
  readonly state: ModelConnectorState;
}

export const SessionsPage: React.FC<SessionsPageProps> = ({ state }) => {
  const [sessionPage, setSessionPage] = useState(1);
  const [filterMode, setFilterMode] = useState<"all" | "model">("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [sessionToDelete, setSessionToDelete] = useState<UiSession | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const pageSize = 5;

  const displayedSessions =
    filterMode === "model"
      ? state.sessions.filter((s) => s.model === state.selectedModel)
      : state.sessions;

  const paginatedSessions = displayedSessions.slice(
    (sessionPage - 1) * pageSize,
    sessionPage * pageSize,
  );

  const totalTurns = state.sessions.reduce((sum, s) => sum + (s.turnCount || 0), 0);

  const handleConfirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    setIsDeletingSession(true);
    try {
      await state.handleDeleteSession(sessionToDelete.sessionId);
      setSessionToDelete(null);
    } finally {
      setIsDeletingSession(false);
    }
  };

  return (
    <div className="desktop-sessions-view page-stack">
      <PageHeader
        title={`Session Lineage Vault (${displayedSessions.length})`}
        subtitle="Inspect, resume, and manage persistent multi-turn conversation sessions and bound cookies."
        actions={
          <button
            type="button"
            className="desktop-new-session-btn btn-ui-dark"
            onClick={() => void state.handleNewSession()}
          >
            + New Session
          </button>
        }
      />

      <StatCardGrid>
        <StatCard label="Total Sessions" value={state.sessions.length} icon="🗂️" tone="primary" />
        <StatCard label="Filtered Results" value={displayedSessions.length} icon="🔍" tone="info" />
        <StatCard label="Total Turns" value={totalTurns} icon="💬" tone="success" />
        <StatCard label="Selected Model" value={state.selectedModel} icon="⚡" tone="warning" />
      </StatCardGrid>

      <div className="sessions-toolbar ui-surface-card">
        <SegmentedControl
          ariaLabel="Filter sessions"
          value={filterMode}
          onChange={(val) => {
            setFilterMode(val);
            setSessionPage(1);
          }}
          options={[
            { value: "all", label: `All (${state.sessions.length})` },
            { value: "model", label: `Model: ${state.selectedModel}` },
          ]}
        />

        <SegmentedControl
          ariaLabel="Session view mode"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: "table", label: "List", icon: "☰" },
            { value: "cards", label: "Cards", icon: "▦" },
          ]}
        />
      </div>

      {paginatedSessions.length === 0 ? (
        <EmptyState
          title="No Active Sessions"
          description="Start a fresh conversation or switch the filter to view all sessions."
          action={
            <button
              type="button"
              className="btn-ui-primary"
              onClick={() => void state.handleNewSession()}
            >
              + Spawn Fresh Session
            </button>
          }
        />
      ) : viewMode === "cards" ? (
        <div className="model-card-grid">
          {paginatedSessions.map((s) => {
            const isActive = state.activeSessionId === s.sessionId;
            return (
              <ResourceCard
                key={s.sessionId}
                icon="💬"
                iconTone="gemini"
                title={s.model}
                subtitle={s.sessionId}
                topRightSlot={
                  <StatusBadge label={`${s.turnCount} turns`} tone="info" />
                }
                statusSlot={
                  <StatusBadge
                    label={isActive ? "Active Session" : s.strategy.toUpperCase()}
                    tone={isActive ? "success" : "neutral"}
                    showDot
                  />
                }
                metaText={`${s.cookies?.length || 0} cookies`}
                footerLeft={<span>{new Date(s.lastActiveAt).toLocaleDateString()}</span>}
                footerActions={
                  <>
                    <button
                      type="button"
                      className="btn-ui-primary btn-sm"
                      onClick={() => {
                        state.setActiveSessionId(s.sessionId);
                        state.setActiveTab("chat");
                      }}
                    >
                      {isActive ? "Active ✔" : "Resume"}
                    </button>
                    <button
                      type="button"
                      className="btn-ui-danger btn-sm"
                      onClick={() => setSessionToDelete(s)}
                      title="Delete session"
                    >
                      🗑️
                    </button>
                  </>
                }
                selected={isActive}
              />
            );
          })}
        </div>
      ) : (
        <div className="sessions-table-wrapper">
          <table className="desktop-table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Model</th>
                <th>Strategy</th>
                <th>Turns</th>
                <th>Cookies</th>
                <th>Last Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSessions.map((s) => {
                const isActive = state.activeSessionId === s.sessionId;
                return (
                  <tr key={s.sessionId} className={isActive ? "selected-row" : ""}>
                    <td className="font-mono">{s.sessionId}</td>
                    <td>{s.model}</td>
                    <td>
                      <StatusBadge label={s.strategy.toUpperCase()} tone="primary" />
                    </td>
                    <td>{s.turnCount}</td>
                    <td>{s.cookies?.length || 0}</td>
                    <td>{new Date(s.lastActiveAt).toLocaleString()}</td>
                    <td>
                      <div className="table-actions-cell">
                        <button
                          type="button"
                          className={`select-model-btn ${isActive ? "active" : ""}`}
                          onClick={() => {
                            state.setActiveSessionId(s.sessionId);
                            state.setActiveTab("chat");
                          }}
                        >
                          {isActive ? "Active ✔" : "Switch To"}
                        </button>
                        <button
                          type="button"
                          className="btn-ui-danger btn-sm"
                          onClick={() => setSessionToDelete(s)}
                          title="Delete session from database"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        currentPage={sessionPage}
        totalPages={Math.max(1, Math.ceil(displayedSessions.length / pageSize))}
        totalItems={displayedSessions.length}
        pageSize={pageSize}
        onPageChange={setSessionPage}
        itemName="sessions"
        className="session-pagination"
        ariaLabel="Session Lineage Navigation"
      />

      <DeleteRecordModal
        isOpen={Boolean(sessionToDelete)}
        onClose={() => setSessionToDelete(null)}
        onConfirm={handleConfirmDeleteSession}
        session={sessionToDelete}
        title="Delete Chat Session"
        description={
          sessionToDelete
            ? `Are you sure you want to permanently delete session '${sessionToDelete.sessionId}'? All multi-turn lineage will be lost.`
            : undefined
        }
        isDeleting={isDeletingSession}
      />
    </div>
  );
};
