import React, { useState, useMemo } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import type { UiMenuItem } from "@/types/ui.types";
import { groupSidebarMenus, resolveMenuDisplayLabel } from "@/constants/navigationConstants";

export interface AppSidebarProps {
  readonly state: ModelConnectorState;
  readonly isCollapsed: boolean;
  readonly isMobileOpen: boolean;
  readonly isMobileMode: boolean;
  readonly onToggleCollapse: () => void;
  readonly onCloseMobile: () => void;
  readonly onSwitchDeviceMode: () => void;
}

const resolveBadgeCount = (state: ModelConnectorState, menu: UiMenuItem): number | undefined => {
  const counts: Record<string, number> = {
    messages: state.messages.length,
    models: state.models.length,
    sessions: state.sessions.length,
    auditLogs: state.auditLogs.length,
    accounts: state.modelAccounts.length,
  };
  return menu.badgeCountKey ? counts[menu.badgeCountKey] : undefined;
};

export const AppSidebar: React.FC<AppSidebarProps> = ({
  state,
  isCollapsed,
  isMobileOpen,
  isMobileMode,
  onToggleCollapse,
  onCloseMobile,
  onSwitchDeviceMode,
}) => {
  const [connectionsExpanded, setConnectionsExpanded] = useState(true);
  const grouped = useMemo(() => groupSidebarMenus(state.menus), [state.menus]);

  const handleSelectRoute = (menu: UiMenuItem) => {
    state.setActiveTab(menu.routePath);
    if (isMobileOpen) {
      onCloseMobile();
    }
  };

  const renderNavItem = (menu: UiMenuItem, isNested = false) => {
    const badgeCount = resolveBadgeCount(state, menu);
    const isActive = state.activeTab === menu.routePath;
    const displayLabel = resolveMenuDisplayLabel(menu);

    return (
      <button
        key={menu.menuId}
        type="button"
        data-route={menu.routePath}
        className={`desktop-nav-item ${isActive ? "active" : ""} ${isNested ? "nested-item" : ""}`}
        onClick={() => handleSelectRoute(menu)}
        title={menu.descriptionText || displayLabel}
      >
        <span className="nav-icon" aria-hidden="true">
          {menu.routePath === "model-config" ? "🪪" : menu.menuIcon}
        </span>
        {!isCollapsed && (
          <>
            <span className="nav-label">{displayLabel}</span>
            <span className="nav-meta">
              {menu.isDefault && (
                <span className="default-indicator" title="Default system route">
                  ★
                </span>
              )}
              {badgeCount !== undefined && <span className="nav-count">{badgeCount}</span>}
            </span>
          </>
        )}
      </button>
    );
  };

  const isConnectionsActive = grouped.connectionMenus.some((m) => m.routePath === state.activeTab);

  return (
    <>
      {isMobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`desktop-sidebar app-sidebar ${isCollapsed ? "collapsed" : ""} ${isMobileOpen ? "drawer-open" : ""}`}
        aria-label="Primary Sidebar Navigation"
      >
        {/* Brand Header with Collapse / Close Controls */}
        <div className="desktop-brand">
          <div className="brand-identity">
            <div className="brand-logo" aria-hidden="true">
              ⚡
            </div>
            {!isCollapsed && (
              <div className="brand-info">
                <span className="brand-title">ModelConnector</span>
                <span className="brand-subtitle">PLATFORM</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="sidebar-collapse-btn desktop-only-control"
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? "▸" : "◧"}
          </button>

          <button
            type="button"
            className="sidebar-close-btn mobile-only-control"
            onClick={onCloseMobile}
            title="Close navigation menu"
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>

        {/* Workspace Section Title */}
        {!isCollapsed && (
          <div className="desktop-section-title">
            <span>WORKSPACE</span>
            <span className="menu-count-tag">{state.menus.length}</span>
          </div>
        )}

        {/* Grouped Navigation */}
        <nav className="desktop-nav">
          {grouped.primaryMenus.map((m) => renderNavItem(m))}

          {grouped.connectionMenus.length > 0 && (
            <div className={`nav-group ${connectionsExpanded ? "expanded" : ""} ${isConnectionsActive ? "has-active" : ""}`}>
              {!isCollapsed && (
                <button
                  type="button"
                  className="nav-group-trigger"
                  onClick={() => setConnectionsExpanded((prev) => !prev)}
                  aria-expanded={connectionsExpanded}
                >
                  <span className="nav-icon" aria-hidden="true">
                    🔌
                  </span>
                  <span className="nav-label">Connections</span>
                  <span className="group-caret" aria-hidden="true">
                    {connectionsExpanded ? "▾" : "▸"}
                  </span>
                </button>
              )}

              {(connectionsExpanded || isCollapsed) && (
                <div className="nav-group-items">
                  {grouped.connectionMenus.map((m) => renderNavItem(m, !isCollapsed))}
                </div>
              )}
            </div>
          )}

          {grouped.workspaceMenus.map((m) => renderNavItem(m))}
        </nav>

        {/* Footer Actions */}
        <div className="desktop-sidebar-footer">
          <button
            type="button"
            className="view-mode-toggle"
            onClick={() => {
              onSwitchDeviceMode();
              if (isMobileOpen) onCloseMobile();
            }}
            title={isMobileMode ? "Switch to Desktop Studio" : "Switch to Mobile View Preview"}
          >
            <span aria-hidden="true">{isMobileMode ? "💻" : "📱"}</span>
            {!isCollapsed && (
              <span>{isMobileMode ? "Switch to Desktop" : "Switch to Mobile View"}</span>
            )}
          </button>

          {!isCollapsed && (
            <div className="system-spec">
              <span className={`health-dot ${state.upstreamHealth.status === "ONLINE" ? "online" : "fallback"}`} />
              <span>
                {state.upstreamHealth.status === "ONLINE" ? "PostgreSQL 17" : "H2 Fallback"}
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

