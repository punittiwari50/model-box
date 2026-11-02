import React from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import type { UiMenuItem } from "@/types/ui.types";

interface DesktopSidebarProps {
  readonly state: ModelConnectorState;
  readonly onSwitchToMobile: () => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ state, onSwitchToMobile }) => {
  const getBadgeCount = (menu: UiMenuItem): number | undefined => {
    switch (menu.badgeCountKey) {
      case "messages":
        return state.messages.length;
      case "models":
        return state.models.length;
      case "sessions":
        return state.sessions.length;
      case "auditLogs":
        return state.auditLogs.length;
      case "accounts":
        return state.modelAccounts.length;
      default:
        return undefined;
    }
  };

  return (
    <aside className="desktop-sidebar">
      <div className="desktop-brand">
        <div className="brand-logo">⚡</div>
        <div className="brand-info">
          <span className="brand-title">ModelConnector</span>
          <span className="brand-subtitle">Enterprise Desktop Studio</span>
        </div>
      </div>

      {/* User RBAC Profile Card */}
      <div className="desktop-user-profile-card">
        <div className="profile-main-row">
          <div className="user-avatar">{state.currentUser?.avatarUrl || "👤"}</div>
          <div className="user-text-info">
            <span className="user-name">{state.currentUser?.fullName || "Guest User"}</span>
            <span className="user-email">{state.currentUser?.userEmail || "auth@modelbox.local"}</span>
          </div>
        </div>
        <div className="profile-badge-row">
          <span className="role-badge-pill">{state.currentUser?.roleName || "Public Access"}</span>
          <span className="company-badge-pill">{state.currentUser?.companyName || "Acme Global"}</span>
        </div>
        <div className="profile-actions">
          <button
            className="switch-user-btn"
            onClick={() => state.setIsLoginModalOpen(true)}
            title="Switch User / Login with different Role"
          >
            🔄 Switch Account
          </button>
        </div>
      </div>

      <div className="desktop-health-badge">
        <span className="pulse-dot green" />
        <span className="health-text">Core Service Online (8095)</span>
      </div>

      <div className="desktop-section-title">
        <span>Authorized Navigation</span>
        <span className="menu-count-tag">{state.menus.length} Menus</span>
      </div>

      <nav className="desktop-nav">
        {state.menus.map((menu) => {
          const badgeCount = getBadgeCount(menu);
          const isActive = state.activeTab === menu.routePath;
          const isDefault = menu.isDefault;

          return (
            <button
              key={menu.menuId}
              data-route={menu.routePath}
              className={`desktop-nav-item ${isActive ? "active" : ""}`}
              onClick={() => state.setActiveTab(menu.routePath)}
              title={menu.descriptionText || menu.menuLabel}
            >
              <span className="nav-icon">{menu.menuIcon}</span>
              <span className="nav-label">{menu.menuLabel}</span>
              {isDefault && <span className="default-indicator" title="Default menu available to each user login">★</span>}
              {badgeCount !== undefined && <span className="nav-count">{badgeCount}</span>}
            </button>
          );
        })}
      </nav>

      <div className="desktop-section-title">Active Strategy</div>
      <div className="desktop-strategy-selector">
        {(["api", "cli", "cookie"] as const).map((strat) => (
          <button
            key={strat}
            className={`strategy-pill ${state.activeStrategy === strat ? "active" : ""}`}
            onClick={() => state.setActiveStrategy(strat)}
          >
            {strat.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="desktop-sidebar-footer">
        <button className="view-mode-toggle" onClick={onSwitchToMobile} title="Switch to Mobile View Preview">
          📱 Switch to Mobile View
        </button>
        <div className="system-spec">Node 22 • Express • Nginx • SQLite RBAC</div>
      </div>
    </aside>
  );
};
