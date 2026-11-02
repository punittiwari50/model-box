import React, { useState } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { Pagination } from "@/components/common/Pagination";

interface DesktopSessionPageProps {
  readonly state: ModelConnectorState;
}

export const DesktopSessionPage: React.FC<DesktopSessionPageProps> = ({ state }) => {
  const [sessionPage, setSessionPage] = useState(1);
  const pageSize = 5;

  const paginatedSessions = state.sessions.slice((sessionPage - 1) * pageSize, sessionPage * pageSize);

  return (
    <div className="desktop-sessions-view">
      <div className="sessions-header">
        <h3>Active Cookie & Lineage Sessions ({state.sessions.length})</h3>
        <button className="desktop-new-session-btn" onClick={() => state.handleNewSession()}>
          + Create New Session
        </button>
      </div>

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
            {paginatedSessions.map((s) => (
              <tr key={s.sessionId} className={state.activeSessionId === s.sessionId ? "selected-row" : ""}>
                <td className="font-mono">{s.sessionId}</td>
                <td>{s.model}</td>
                <td>
                  <span className="strategy-tag">{s.strategy.toUpperCase()}</span>
                </td>
                <td>{s.turnCount}</td>
                <td>{s.cookies?.length || 0}</td>
                <td>{new Date(s.lastActiveAt).toLocaleString()}</td>
                <td>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      className="select-model-btn"
                      onClick={() => {
                        state.setActiveSessionId(s.sessionId);
                        state.setActiveTab("chat");
                      }}
                    >
                      {state.activeSessionId === s.sessionId ? "Active ✔" : "Switch To"}
                    </button>
                    <button
                      className="manage-accounts-btn"
                      style={{ color: "#f87171", borderColor: "rgba(239, 68, 68, 0.3)" }}
                      onClick={() => {
                        if (window.confirm(`Delete session ${s.sessionId}?`)) {
                          state.handleDeleteSession(s.sessionId);
                        }
                      }}
                      title="Delete session from database"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
