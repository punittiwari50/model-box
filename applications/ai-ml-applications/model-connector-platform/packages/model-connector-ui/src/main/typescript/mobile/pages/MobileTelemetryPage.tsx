import React from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";

interface MobileTelemetryPageProps {
  readonly state: ModelConnectorState;
}

export const MobileTelemetryPage: React.FC<MobileTelemetryPageProps> = ({ state }) => {
  return (
    <div className="mobile-telemetry-view">
      <div className="mobile-section-header">
        <h3>System Telemetry</h3>
        <button className="mobile-refresh-btn" onClick={() => state.refreshData()}>
          🔄 Refresh
        </button>
      </div>

      <div className="mobile-stat-card">
        <div className="stat-label">Core Microservice Health</div>
        <div className="stat-value green">{state.upstreamHealth.status}</div>
        <div className="stat-sub">{state.upstreamHealth.service} (Port 8095)</div>
      </div>

      <div className="mobile-stat-card">
        <div className="stat-label">Total Active Models</div>
        <div className="stat-value cyan">{state.models.length} Models Loaded</div>
      </div>

      <div className="mobile-stat-card">
        <div className="stat-label">Recent Audit Trail</div>
        <div className="stat-sub">Audit Events Logged: {state.auditLogs.length}</div>
      </div>
    </div>
  );
};
