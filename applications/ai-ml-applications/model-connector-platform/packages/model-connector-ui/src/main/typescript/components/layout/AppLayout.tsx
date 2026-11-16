import React, { useState } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { useTheme } from "@/utils/hooks/useTheme";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { LoginModal } from "@/components/auth/LoginModal";
import {
  AdministrationPage,
  ChatPage,
  IntegrationsPage,
  ModelsPage,
  OnboardingPage,
  SessionsPage,
  TelemetryPage,
  WorkflowsPage,
} from "@/pages";

export interface AppLayoutProps {
  readonly state: ModelConnectorState;
  readonly isMobileMode: boolean;
  readonly onSwitchDeviceMode: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  state,
  isMobileMode,
  onSwitchDeviceMode,
}) => {
  const { theme, setTheme, toggleTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  return (
    <div className={`app-shell desktop-layout ${isMobileMode ? "mobile-layout is-mobile-mode" : "is-desktop-mode"}`}>
      <AppSidebar
        state={state}
        isCollapsed={sidebarCollapsed && !isMobileMode}
        isMobileOpen={mobileDrawerOpen}
        isMobileMode={isMobileMode}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onCloseMobile={() => setMobileDrawerOpen(false)}
        onSwitchDeviceMode={onSwitchDeviceMode}
      />

      <main className="desktop-main app-main">
        <AppHeader
          state={state}
          theme={theme}
          isMobileMode={isMobileMode}
          globalSearch={globalSearch}
          onGlobalSearchChange={setGlobalSearch}
          onToggleTheme={toggleTheme}
          onSetTheme={setTheme}
          onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
          onOpenModelPicker={() => setModelPickerOpen(true)}
          onSwitchDeviceMode={onSwitchDeviceMode}
        />

        <div className={`desktop-view-container app-content-area ${isMobileMode ? "mobile-content-area" : ""}`}>
          {state.activeTab === "chat" && <ChatPage state={state} />}
          {state.activeTab === "models" && (
            <ModelsPage state={state} externalSearchQuery={globalSearch} />
          )}
          {state.activeTab === "model-config" && (
            <IntegrationsPage state={state} externalSearchQuery={globalSearch} />
          )}
          {state.activeTab === "sessions" && <SessionsPage state={state} />}
          {state.activeTab === "upstream" && <TelemetryPage state={state} />}
          {state.activeTab === "workflows" && <WorkflowsPage state={state} />}
          {state.activeTab === "onboarding" && <OnboardingPage state={state} />}
          {state.activeTab === "admin-rbac" && <AdministrationPage state={state} />}
        </div>
      </main>

      {isMobileMode && (
        <MobileBottomNav
          activeTab={state.activeTab}
          menus={state.menus}
          onTabChange={state.setActiveTab}
          onOpenLogin={() => state.setIsLoginModalOpen(true)}
        />
      )}

      {modelPickerOpen && (
        <div className="mobile-bottom-sheet-backdrop" onClick={() => setModelPickerOpen(false)}>
          <div className="mobile-bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h4>Select AI Model</h4>
              <button
                type="button"
                className="sheet-close-btn"
                onClick={() => setModelPickerOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="sheet-model-list">
              {state.models.map((m) => (
                <button
                  key={m.id}
                  type="button"
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
