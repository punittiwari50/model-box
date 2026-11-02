import React from "react";
import { useDeviceMode } from "@/utils/hooks/useDeviceMode";
import { useModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { DesktopLayout } from "@/desktop/layout/DesktopLayout";
import { MobileLayout } from "@/mobile/layout/MobileLayout";

export const App: React.FC = () => {
  const { isMobile, toggleMode, mode } = useDeviceMode();
  const state = useModelConnectorState();

  return (
    <div className={`platform-viewport ${mode}-mode`}>
      {isMobile ? (
        <MobileLayout state={state} onSwitchToDesktop={toggleMode} />
      ) : (
        <DesktopLayout state={state} onSwitchToMobile={toggleMode} />
      )}
    </div>
  );
};
