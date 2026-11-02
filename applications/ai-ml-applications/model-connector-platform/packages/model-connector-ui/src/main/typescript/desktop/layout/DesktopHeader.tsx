import React from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";

interface DesktopHeaderProps {
  readonly state: ModelConnectorState;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({ state }) => {
  return (
    <header className="desktop-header">
      <div className="header-breadcrumbs">
        <span className="root-crumb">Workspace</span>
        <span className="separator">/</span>
        <span className="active-crumb">
          {state.activeTab === "chat" && "Multi-Model Conversational Engine"}
          {state.activeTab === "models" && "Omni-Channel Model Catalog"}
          {state.activeTab === "model-config" && "Protocol & Model Credential Studio"}
          {state.activeTab === "sessions" && "Cookie Session Lineage Vault"}
          {state.activeTab === "workflows" && "Distributed Workflow DAG & AST Resumption"}
          {state.activeTab === "upstream" && "Distributed Telemetry & Resilience"}
          {state.activeTab === "onboarding" && "Domain Onboarding & Ast Compilation"}
          {state.activeTab === "admin-rbac" && "Tenant RBAC Governance Matrix"}
        </span>
      </div>

      <div className="header-actions">
        {/* User Identity Chip */}
        <button
          className="header-user-chip"
          onClick={() => state.setIsLoginModalOpen(true)}
          title="Click to Switch User / Login"
        >
          <span className="user-icon">{state.currentUser?.avatarUrl || "👤"}</span>
          <div className="user-header-text">
            <span className="chip-value">{state.currentUser?.fullName || "Guest"}</span>
            <span className="chip-role">({state.currentUser?.roleName || "Public"})</span>
          </div>
        </button>

        <div className="model-chip">
          <span className="chip-label">Active Model:</span>
          <span className="chip-value">{state.selectedModel}</span>
        </div>

        <div className="strategy-chip">
          <span className="chip-label">Strategy:</span>
          <span className="chip-value uppercase">{state.activeStrategy}</span>
        </div>

        <button className="header-refresh-btn" onClick={() => state.refreshData()} title="Refresh Service Data">
          🔄
        </button>
      </div>
    </header>
  );
};
