import React from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { DesktopSidebar } from "@/desktop/layout/DesktopSidebar";
import { DesktopHeader } from "@/desktop/layout/DesktopHeader";
import { DesktopChatPage } from "@/desktop/pages/DesktopChatPage";
import { DesktopModelPage } from "@/desktop/pages/DesktopModelPage";
import { DesktopModelConfigPage } from "@/desktop/pages/DesktopModelConfigPage";
import { DesktopSessionPage } from "@/desktop/pages/DesktopSessionPage";
import { DesktopTelemetryPage } from "@/desktop/pages/DesktopTelemetryPage";
import { DesktopWorkflowPage } from "@/desktop/pages/DesktopWorkflowPage";
import { DesktopOnboardingPage } from "@/desktop/pages/DesktopOnboardingPage";
import { DesktopRbacPage } from "@/desktop/pages/DesktopRbacPage";
import { LoginModal } from "@/components/auth/LoginModal";

interface DesktopLayoutProps {
  readonly state: ModelConnectorState;
  readonly onSwitchToMobile: () => void;
}

export const DesktopLayout: React.FC<DesktopLayoutProps> = ({ state, onSwitchToMobile }) => {
  return (
    <div className="desktop-layout">
      <DesktopSidebar state={state} onSwitchToMobile={onSwitchToMobile} />

      <main className="desktop-main">
        <DesktopHeader state={state} />

        <div className="desktop-view-container">
          {state.activeTab === "chat" && <DesktopChatPage state={state} />}
          {state.activeTab === "models" && <DesktopModelPage state={state} />}
          {state.activeTab === "model-config" && <DesktopModelConfigPage state={state} />}
          {state.activeTab === "sessions" && <DesktopSessionPage state={state} />}
          {state.activeTab === "upstream" && <DesktopTelemetryPage state={state} />}
          {state.activeTab === "workflows" && <DesktopWorkflowPage state={state} />}
          {state.activeTab === "onboarding" && <DesktopOnboardingPage state={state} />}
          {state.activeTab === "admin-rbac" && <DesktopRbacPage state={state} />}
        </div>
      </main>

      {/* RBAC Login & Switch User Modal */}
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
