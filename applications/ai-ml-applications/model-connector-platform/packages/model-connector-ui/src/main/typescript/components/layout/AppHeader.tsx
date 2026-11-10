import React, { useState, useRef, useEffect } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import type { UiTheme } from "@/utils/hooks/useTheme";
import { ROUTE_BREADCRUMB_MAP, getUserInitials } from "@/constants/navigationConstants";
import { ThemeToggle, StatusBadge } from "@/components/common";

export interface AppHeaderProps {
  readonly state: ModelConnectorState;
  readonly theme: UiTheme;
  readonly isMobileMode: boolean;
  readonly globalSearch: string;
  readonly onGlobalSearchChange: (value: string) => void;
  readonly onToggleTheme: () => void;
  readonly onOpenMobileDrawer: () => void;
  readonly onOpenModelPicker?: () => void;
  readonly onSwitchDeviceMode?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  state,
  theme,
  isMobileMode,
  globalSearch,
  onGlobalSearchChange,
  onToggleTheme,
  onOpenMobileDrawer,
  onOpenModelPicker,
  onSwitchDeviceMode,
}) => {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const crumb = ROUTE_BREADCRUMB_MAP[state.activeTab] || {
    parent: "Workspace",
    label: state.activeTab,
    shortLabel: state.activeTab,
  };
  const isOnline = state.upstreamHealth.status === "ONLINE";
  const initials = getUserInitials(state.currentUser?.fullName);

  return (
    <header className="desktop-header app-header">
      <div className="header-left-cluster">
        <button
          type="button"
          className="header-menu-btn"
          onClick={onOpenMobileDrawer}
          aria-label="Open navigation menu"
          title="Open navigation menu"
        >
          ☰
        </button>

        <nav className="header-breadcrumbs" aria-label="Breadcrumb">
          <span className="root-crumb">Home</span>
          <span className="separator" aria-hidden="true">
            ›
          </span>
          <span className="root-crumb hide-xs">{crumb.parent}</span>
          <span className="separator hide-xs" aria-hidden="true">
            ›
          </span>
          <span className="active-crumb">{crumb.label}</span>
        </nav>

        <StatusBadge
          label={isOnline ? "Production" : "Development"}
          tone={isOnline ? "success" : "info"}
          showDot
          className="header-env-badge"
        />
      </div>

      <div className="header-actions">
        <div className="header-search-box">
          <span className="search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            className="header-search-input"
            placeholder="Search resources..."
            value={globalSearch}
            onChange={(e) => {
              onGlobalSearchChange(e.target.value);
              if (e.target.value.trim() && state.activeTab !== "models" && state.activeTab !== "model-config") {
                state.setActiveTab("model-config");
              }
            }}
            aria-label="Search resources"
          />
        </div>

        {isMobileMode && onOpenModelPicker && (
          <button
            type="button"
            className="mobile-model-pill"
            onClick={onOpenModelPicker}
            title="Select active AI model"
          >
            <span className="model-dot" aria-hidden="true" />
            <span className="model-text">{state.selectedModel}</span>
            <span className="arrow-down" aria-hidden="true">
              ▾
            </span>
          </button>
        )}

        {isMobileMode && onSwitchDeviceMode && (
          <button
            type="button"
            className="header-icon-btn mobile-desktop-toggle"
            onClick={onSwitchDeviceMode}
            title="Switch to Desktop"
            aria-label="Switch to Desktop"
          >
            💻
          </button>
        )}

        <ThemeToggle theme={theme} onToggle={onToggleTheme} />

        <button
          type="button"
          className="header-icon-btn header-refresh-btn"
          onClick={() => void state.refreshData()}
          title="Refresh Service Data"
          aria-label="Refresh Service Data"
        >
          🔄
        </button>

        {/* Enterprise Profile Menu */}
        <div className="header-profile-menu-container" ref={profileMenuRef}>
          <button
            type="button"
            className={`header-profile-trigger ${isProfileMenuOpen ? "active" : ""}`}
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            aria-expanded={isProfileMenuOpen}
            title="Profile & Account Settings"
          >
            <span className="trigger-avatar-circle">
              <span className="avatar-initials">{initials}</span>
              <span className="status-indicator-dot online" />
            </span>
            <div className="trigger-user-info">
              <span className="trigger-user-name">{state.currentUser?.fullName || "Platform Admin"}</span>
              <span className="trigger-role-badge">{state.currentUser?.roleName || "Administrator"}</span>
            </div>
            <span className="trigger-caret" aria-hidden="true">
              {isProfileMenuOpen ? "▴" : "▾"}
            </span>
          </button>

          {isProfileMenuOpen && (
            <div className="header-profile-popover">
              <div className="popover-user-card">
                <div className="popover-avatar">{state.currentUser?.avatarUrl || initials}</div>
                <div className="popover-details">
                  <div className="popover-name">{state.currentUser?.fullName || "Platform Admin"}</div>
                  <div className="popover-email">{state.currentUser?.userEmail || "auth@modelbox.local"}</div>
                  <div className="popover-badges">
                    <span className="company-badge">🏢 {state.currentUser?.companyName || "Acme Global"}</span>
                    <span className="role-badge">🛡️ {state.currentUser?.roleName || "Administrator"}</span>
                  </div>
                </div>
              </div>

              <div className="popover-divider" />

              <div className="popover-menu-list">
                <button
                  type="button"
                  className="popover-menu-item"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    state.setIsLoginModalOpen(true);
                  }}
                >
                  <span className="item-icon">🔄</span>
                  <div className="item-text">
                    <span className="item-title">Switch Account / Role</span>
                    <span className="item-sub">Switch user identity, permissions & tenant</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="popover-menu-item"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    state.setActiveTab("admin-rbac");
                  }}
                >
                  <span className="item-icon">🛡️</span>
                  <div className="item-text">
                    <span className="item-title">Access & RBAC Matrix</span>
                    <span className="item-sub">Manage user roles, tenant policies & permissions</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="popover-menu-item"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    state.setActiveTab("model-config");
                  }}
                >
                  <span className="item-icon">🪪</span>
                  <div className="item-text">
                    <span className="item-title">Integration Hub</span>
                    <span className="item-sub">Configure OAuth 2.0, API keys & CLI integrations</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="popover-menu-item"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    state.setActiveTab("sessions");
                  }}
                >
                  <span className="item-icon">🗂️</span>
                  <div className="item-text">
                    <span className="item-title">Session Lineage Vault</span>
                    <span className="item-sub">Audit persistent multi-turn conversations</span>
                  </div>
                </button>
              </div>

              <div className="popover-footer">
                <button
                  type="button"
                  className="sign-out-btn"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    state.setIsLoginModalOpen(true);
                  }}
                >
                  <span className="sign-out-icon">🔒</span>
                  <span>Switch User / Login</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

