import React, { useState } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { JobOnboardingStepper } from "@/components/onboarding/JobOnboardingStepper";
import { AppsBuilderStepper } from "@/components/onboarding/AppsBuilderStepper";
import { StorytellerStepper } from "@/components/onboarding/StorytellerStepper";

interface DesktopOnboardingPageProps {
  readonly state: ModelConnectorState;
}

type OnboardingTab = "job" | "apps" | "story";

export const DesktopOnboardingPage: React.FC<DesktopOnboardingPageProps> = () => {
  const [activeTab, setActiveTab] = useState<OnboardingTab>("job");

  return (
    <div className="desktop-page desktop-onboarding-page">
      <div className="page-header">
        <div>
          <h2>Domain Onboarding & 5-Frame Stepper Studio</h2>
          <p className="page-subtitle">
            Universal Idea-to-Execution Flows for Job Portals, Apps Builder, and Storyteller
          </p>
        </div>
        <div className="stepper-tab-pills" style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className={`view-mode-pill ${activeTab === "job" ? "active" : ""}`}
            onClick={() => setActiveTab("job")}
          >
            💼 Job Portal
          </button>
          <button
            className={`view-mode-pill ${activeTab === "apps" ? "active" : ""}`}
            onClick={() => setActiveTab("apps")}
          >
            🛠️ Apps Builder
          </button>
          <button
            className={`view-mode-pill ${activeTab === "story" ? "active" : ""}`}
            onClick={() => setActiveTab("story")}
          >
            🎬 Storyteller Studio
          </button>
        </div>
      </div>

      <div className="onboarding-flow-host" style={{ marginTop: "1rem" }}>
        {activeTab === "job" && <JobOnboardingStepper />}
        {activeTab === "apps" && <AppsBuilderStepper />}
        {activeTab === "story" && <StorytellerStepper />}
      </div>
    </div>
  );
};
