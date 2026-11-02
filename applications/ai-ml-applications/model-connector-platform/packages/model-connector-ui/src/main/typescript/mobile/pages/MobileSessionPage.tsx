import React, { useState } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { Pagination } from "@/components/common/Pagination";

interface MobileSessionPageProps {
  readonly state: ModelConnectorState;
}

export const MobileSessionPage: React.FC<MobileSessionPageProps> = ({ state }) => {
  const [sessionPage, setSessionPage] = useState(1);
  const pageSize = 4;

  const paginatedSessions = state.sessions.slice((sessionPage - 1) * pageSize, sessionPage * pageSize);

  return (
    <div className="mobile-sessions-view">
      <div className="mobile-section-header">
        <h3>Active Sessions ({state.sessions.length})</h3>
        <button className="mobile-add-btn" onClick={() => state.handleNewSession()}>
          + New
        </button>
      </div>

      <div className="mobile-cards-list">
        {paginatedSessions.map((s) => (
          <div
            key={s.sessionId}
            className={`mobile-session-card ${state.activeSessionId === s.sessionId ? "active" : ""}`}
          >
            <div className="card-top">
              <div className="session-id font-mono">{s.sessionId}</div>
              <span className="turns-badge">{s.turnCount} turns</span>
            </div>
            <div className="session-meta">
              <span>Model: {s.model}</span>
              <span>•</span>
              <span>Strategy: {s.strategy.toUpperCase()}</span>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <button
                className="mobile-select-btn"
                style={{ flex: 1 }}
                onClick={() => {
                  state.setActiveSessionId(s.sessionId);
                  state.setActiveTab("chat");
                }}
              >
                {state.activeSessionId === s.sessionId ? "Active Session ✔" : "Switch To Session"}
              </button>
              <button
                className="mobile-select-btn"
                style={{ background: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#f87171" }}
                onClick={() => {
                  if (window.confirm(`Delete session ${s.sessionId}?`)) {
                    state.handleDeleteSession(s.sessionId);
                  }
                }}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      <Pagination
        currentPage={sessionPage}
        totalPages={Math.max(1, Math.ceil(state.sessions.length / pageSize))}
        totalItems={state.sessions.length}
        pageSize={pageSize}
        onPageChange={setSessionPage}
        itemName="sessions"
        className="session-pagination"
        ariaLabel="Session Lineage Navigation"
      />
    </div>
  );
};
