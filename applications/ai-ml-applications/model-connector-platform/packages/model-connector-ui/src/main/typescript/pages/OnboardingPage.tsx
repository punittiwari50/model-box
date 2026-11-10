import React, { useState } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { JobOnboardingStepper } from "@/components/onboarding/JobOnboardingStepper";
import { AppsBuilderStepper } from "@/components/onboarding/AppsBuilderStepper";
import { StorytellerStepper } from "@/components/onboarding/StorytellerStepper";
import { PageHeader, SegmentedControl } from "@/components/common";

interface OnboardingPageProps {
  readonly state: ModelConnectorState;
}

type OnboardingTab = "job" | "apps" | "story";

export const OnboardingPage: React.FC<OnboardingPageProps> = () => {
  const [activeTab, setActiveTab] = useState<OnboardingTab>("job");

  return (
    <div className="desktop-page desktop-onboarding-page page-stack">
      <PageHeader
        title="Domain Onboarding & 5-Frame Stepper Studio"
        subtitle="Universal Idea-to-Execution Flows for Job Portals, Apps Builder, and Storyteller"
        actions={
          <div className="stepper-tab-pills">
            <SegmentedControl
              ariaLabel="Onboarding Domain Flows"
              value={activeTab}
              onChange={setActiveTab}
              size="md"
              options={[
                { value: "job", label: "Job Portal", icon: "💼" },
                { value: "apps", label: "Apps Builder", icon: "🛠️" },
                { value: "story", label: "Storyteller", icon: "🎬" },
              ]}
            />
          </div>
        }
      />

      <div className="onboarding-flow-host">
        {activeTab === "job" && <JobOnboardingStepper />}
        {activeTab === "apps" && <AppsBuilderStepper />}
        {activeTab === "story" && <StorytellerStepper />}
      </div>
    </div>
  );
};
