import React from "react";
import type { ActiveTab, UiMenuItem } from "@/types/ui.types";

interface MobileBottomNavProps {
  readonly activeTab: ActiveTab;
  readonly menus: readonly UiMenuItem[];
  readonly onTabChange: (tab: ActiveTab) => void;
  readonly onOpenLogin: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  menus,
  onTabChange,
  onOpenLogin,
}) => {
  return (
    <nav className="mobile-bottom-nav">
      {menus.map((m) => (
        <button
          key={m.menuId}
          data-route={m.routePath}
          className={`mobile-tab-btn ${activeTab === m.routePath ? "active" : ""}`}
          onClick={() => onTabChange(m.routePath)}
          title={m.menuLabel}
        >
          <span className="tab-icon">{m.menuIcon}</span>
          <span className="tab-label">{m.menuLabel.split(" ")[0]}</span>
        </button>
      ))}

      <button className="mobile-tab-btn user-btn" onClick={onOpenLogin} title="Switch User / Account">
        <span className="tab-icon">👤</span>
        <span className="tab-label">Account</span>
      </button>
    </nav>
  );
};
