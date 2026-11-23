import React from "react";
import type { ActiveTab, UiMenuItem } from "@/types/ui.types";
import { ROUTE_BREADCRUMB_MAP } from "@/constants/navigationConstants";

interface MobileBottomNavProps {
  readonly activeTab: ActiveTab;
  readonly menus: readonly UiMenuItem[];
  readonly onTabChange: (tab: ActiveTab) => void;
  readonly onOpenLogin: () => void;
}

const getShortTabLabel = (routePath: ActiveTab, menuLabel: string): string => {
  return ROUTE_BREADCRUMB_MAP[routePath]?.shortLabel || menuLabel.split(" ")[0];
};

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  menus,
  onTabChange,
  onOpenLogin,
}) => {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Bottom Navigation">
      {menus.map((m) => {
        const isActive = activeTab === m.routePath;
        return (
          <button
            key={m.menuId}
            type="button"
            data-route={m.routePath}
            className={`mobile-tab-btn ${isActive ? "active" : ""}`}
            onClick={() => onTabChange(m.routePath)}
            title={m.menuLabel}
          >
            <span className="tab-icon" aria-hidden="true">
              {m.routePath === "model-config" ? "🪪" : m.menuIcon}
            </span>
            <span className="tab-label">{getShortTabLabel(m.routePath, m.menuLabel)}</span>
            {isActive && <span className="tab-active-dot" />}
          </button>
        );
      })}

      <button
        type="button"
        className="mobile-tab-btn user-btn"
        onClick={onOpenLogin}
        title="Switch User / Account"
      >
        <span className="tab-icon" aria-hidden="true">👤</span>
        <span className="tab-label">Account</span>
      </button>
    </nav>
  );
};

