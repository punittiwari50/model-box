import React from "react";
import type { UiUpstreamHealth } from "@/types/ui.types";

interface UpstreamStatusCardProps {
  readonly health: UiUpstreamHealth;
  readonly onRefresh: () => void;
}

export const UpstreamStatusCard: React.FC<UpstreamStatusCardProps> = ({ health, onRefresh }) => {
  const isHealthy = health.status === "HEALTHY" || health.status === "ONLINE";

  return (
    <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontSize: "1.1rem" }}>Upstream Gemini Connector Status</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Service: {health.service}
          </span>
        </div>

        <button onClick={onRefresh} className="glass-pill" style={{ padding: "6px 12px", color: "var(--cyan-primary)", cursor: "pointer", border: "1px solid var(--border-glass)" }}>
          🔄 Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
        <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "12px", borderRadius: "var(--radius-sm)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Connection State</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: isHealthy ? "var(--emerald-primary)" : "var(--rose-primary)", marginTop: "4px" }}>
            {health.status}
          </div>
        </div>

        <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "12px", borderRadius: "var(--radius-sm)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Uptime</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
            {health.uptimeSeconds ? `${Math.round(health.uptimeSeconds)}s` : "Continuous"}
          </div>
        </div>

        <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "12px", borderRadius: "var(--radius-sm)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Protocol Bridge</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--cyan-primary)", marginTop: "4px" }}>
            REST + CLI + Cookie
          </div>
        </div>
      </div>
    </div>
  );
};
