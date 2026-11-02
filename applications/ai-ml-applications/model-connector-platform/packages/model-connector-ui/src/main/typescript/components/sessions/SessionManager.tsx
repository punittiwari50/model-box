import React, { useState } from "react";
import type { UiSession } from "@/types/ui.types";
import { Pagination } from "@/components/common/Pagination";

interface SessionManagerProps {
  readonly sessions: readonly UiSession[];
  readonly activeSessionId?: string;
  readonly onSelectSession: (sessionId: string) => void;
  readonly onNewSession: () => void;
}

export const SessionManager: React.FC<SessionManagerProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
}) => {
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
  const paginatedSessions = sessions.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "1.4rem" }}>Cookie & Session Lineage Vault</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Inspect stateful cookies, conversation turns, and multi-turn session lineage
          </p>
        </div>

        <button onClick={onNewSession} className="send-btn">
          <span>+ New Session</span>
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
        {paginatedSessions.map((sess) => {
          const isActive = sess.sessionId === activeSessionId;
          return (
            <div
              key={sess.sessionId}
              className="glass-panel"
              style={{
                padding: "20px",
                borderColor: isActive ? "var(--emerald-primary)" : "var(--border-glass)",
                boxShadow: isActive ? "0 0 20px var(--emerald-glow)" : "none",
                cursor: "pointer",
              }}
              onClick={() => onSelectSession(sess.sessionId)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span className="strategy-badge badge-cookie">Session {sess.turnCount} turns</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {new Date(sess.lastActiveAt).toLocaleTimeString()}
                </span>
              </div>

              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--cyan-primary)", marginBottom: "8px" }}>
                {sess.sessionId}
              </div>

              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "14px" }}>
                Active Model: <strong style={{ color: "var(--text-primary)" }}>{sess.model}</strong>
              </div>

              <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "10px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                <div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>Lineage Root Hash:</div>
                <div style={{ color: "var(--emerald-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                  sha256:{sess.sessionId.replace(/-/g, "").slice(0, 16)}...
                </div>
              </div>

              <button
                className="send-btn"
                style={{ width: "100%", padding: "8px", fontSize: "0.8rem", opacity: isActive ? 1 : 0.7 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSession(sess.sessionId);
                }}
              >
                <span>{isActive ? "Active Session" : "Switch to Session"}</span>
              </button>
            </div>
          );
        })}

        {sessions.length === 0 && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
            No sessions available. Click "+ New Session" to begin.
          </div>
        )}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={sessions.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        pageSizeOptions={[6, 12, 24]}
        itemName="sessions"
        className="session-pagination"
        ariaLabel="Session Lineage Navigation"
      />
    </div>
  );
};
