import React, { useState } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { MobileHeader } from "@/mobile/layout/MobileHeader";
import { MobileBottomNav } from "@/mobile/layout/MobileBottomNav";
import { MobileChatPage } from "@/mobile/pages/MobileChatPage";
import { MobileModelPage } from "@/mobile/pages/MobileModelPage";
import { MobileSessionPage } from "@/mobile/pages/MobileSessionPage";
import { MobileTelemetryPage } from "@/mobile/pages/MobileTelemetryPage";
import { DesktopWorkflowPage } from "@/desktop/pages/DesktopWorkflowPage";
import { DesktopOnboardingPage } from "@/desktop/pages/DesktopOnboardingPage";
import { DesktopModelConfigPage } from "@/desktop/pages/DesktopModelConfigPage";
import { DesktopRbacPage } from "@/desktop/pages/DesktopRbacPage";
import { LoginModal } from "@/components/auth/LoginModal";

interface MobileLayoutProps {
  readonly state: ModelConnectorState;
  readonly onSwitchToDesktop: () => void;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({ state, onSwitchToDesktop }) => {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  return (
    <div className="mobile-layout">
      <MobileHeader
        state={state}
        onOpenModelPicker={() => setModelPickerOpen(true)}
        onSwitchToDesktop={onSwitchToDesktop}
      />

      <div className="mobile-content-area">
        {state.activeTab === "chat" && <MobileChatPage state={state} />}
        {state.activeTab === "models" && <MobileModelPage state={state} />}
        {state.activeTab === "model-config" && <DesktopModelConfigPage state={state} />}
        {state.activeTab === "sessions" && <MobileSessionPage state={state} />}
        {state.activeTab === "upstream" && <MobileTelemetryPage state={state} />}
        {state.activeTab === "workflows" && <DesktopWorkflowPage state={state} />}
        {state.activeTab === "onboarding" && <DesktopOnboardingPage state={state} />}
        {state.activeTab === "admin-rbac" && <DesktopRbacPage state={state} />}
      </div>

      {modelPickerOpen && (
        <div className="mobile-bottom-sheet-backdrop" onClick={() => setModelPickerOpen(false)}>
          <div className="mobile-bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h4>Select AI Model</h4>
              <button className="sheet-close-btn" onClick={() => setModelPickerOpen(false)}>
                ✕
              </button>
            </div>
            <div className="sheet-model-list">
              {state.models.map((m) => (
                <button
                  key={m.id}
                  className={`sheet-model-item ${state.selectedModel === m.id ? "selected" : ""}`}
                  onClick={() => {
                    state.setSelectedModel(m.id);
                    setModelPickerOpen(false);
                  }}
                >
                  <div className="item-info">
                    <span className="item-name">{m.name}</span>
                    <span className="item-id">{m.id}</span>
                  </div>
                  {state.selectedModel === m.id && <span className="item-check">✔</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <MobileBottomNav
        activeTab={state.activeTab}
        menus={state.menus}
        onTabChange={state.setActiveTab}
        onOpenLogin={() => state.setIsLoginModalOpen(true)}
      />

      <LoginModal
        isOpen={state.isLoginModalOpen}
        onClose={() => state.setIsLoginModalOpen(false)}
        onLogin={state.login}
        onSwitchUser={state.switchUser}
        demoUsers={state.demoUsers}
        currentUserId={state.currentUser?.userId}
      />
    </div>
  );
};
