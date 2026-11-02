import React from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";

interface MobileHeaderProps {
  readonly state: ModelConnectorState;
  readonly onOpenModelPicker: () => void;
  readonly onSwitchToDesktop: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  state,
  onOpenModelPicker,
  onSwitchToDesktop,
}) => {
  return (
    <header className="mobile-header">
      <div className="mobile-brand">
        <span className="brand-icon">⚡</span>
        <span className="brand-name">ModelConnector</span>
      </div>

      <div className="mobile-header-actions">
        <button className="mobile-model-pill" onClick={onOpenModelPicker}>
          <span className="model-dot" />
          <span className="model-text">{state.selectedModel}</span>
          <span className="arrow-down">▾</span>
        </button>

        <button className="mobile-desktop-toggle" onClick={onSwitchToDesktop} title="Switch to Desktop View">
          💻
        </button>
      </div>
    </header>
  );
};
