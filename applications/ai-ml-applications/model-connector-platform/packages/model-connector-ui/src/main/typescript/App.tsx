import React from "react";
import { useDeviceMode } from "@/utils/hooks/useDeviceMode";
import { useModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { AppLayout } from "@/components/layout/AppLayout";

export const App: React.FC = () => {
  const { isMobile, toggleMode, mode } = useDeviceMode();
  const state = useModelConnectorState();

  return (
    <div className={`platform-viewport ${mode}-mode`}>
      <AppLayout
        state={state}
        isMobileMode={isMobile}
        onSwitchDeviceMode={toggleMode}
      />
    </div>
  );
};
