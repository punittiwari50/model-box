import React, { useState, useMemo } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { ModelAccountsModal } from "@/components/models/ModelAccountsModal";
import {
  CategoryMapper,
  modelFilterStrategy,
} from "@/utils";
import { ControlPanel, ModelCardGrid, ModelListView, type ViewType } from "@/components/views";

interface DesktopModelPageProps {
  readonly state: ModelConnectorState;
}

export const DesktopModelPage: React.FC<DesktopModelPageProps> = ({ state }) => {
  const [modelSearch, setModelSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("all");

  // View Mode: "list" vs "card"
  const [viewMode, setViewMode] = useState<ViewType>("list");
  const [groupBy, setGroupBy] = useState<"family" | "none">("family");

  const [selectedModelForAccounts, setSelectedModelForAccounts] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const categories = useMemo(() => {
    return CategoryMapper.extractFilterList(state.categories);
  }, [state.categories]);

  const filteredModels = useMemo(() => {
    return modelFilterStrategy.filter(state.models, {
      searchQuery: modelSearch,
      family: familyFilter,
    });
  }, [state.models, modelSearch, familyFilter]);

  const handleOpenModelSaveView = (modelId: string) => {
    state.setSelectedModel(modelId);
    state.setActiveTab("model-config");
  };

  const handleCreateNewConfiguration = () => {
    state.setSelectedModel("");
    state.setActiveTab("model-config");
  };

  return (
    <div className="desktop-model-catalog" data-testid="desktop-model-catalog">
      {/* 1. Unified Control Panel with Create, Search, Filter, Group By & View Switcher */}
      <ControlPanel
        viewType={viewMode}
        title="AI Model Catalog"
        onCreateClick={handleCreateNewConfiguration}
        onViewTypeChange={(type) => setViewMode(type)}
        searchQuery={modelSearch}
        onSearchChange={(q) => setModelSearch(q)}
        searchPlaceholder="Filter models by name, family, or ID..."
        activeFilter={familyFilter}
        onFilterChange={(f) => setFamilyFilter(f)}
        filterOptions={categories}
        activeGroupBy={groupBy}
        onGroupByChange={(g) => setGroupBy(g as any)}
        groupByOptions={[
          { value: "family", label: "Provider / Family" },
          { value: "none", label: "None (Flat List)" },
        ]}
        currentRange={filteredModels.length > 0 ? `1-${filteredModels.length} / ${filteredModels.length}` : undefined}
      />

      {/* 2. Card View (Kanban) */}
      {viewMode === "card" && (
        <ModelCardGrid
          models={filteredModels}
          modelAccounts={state.modelAccounts}
          selectedModelId={state.selectedModel}
          onModelClick={handleOpenModelSaveView}
          onChatSelect={(id) => {
            state.setSelectedModel(id);
            state.setActiveTab("chat");
          }}
        />
      )}

      {/* 3. Reusable Enterprise List View (Grouped or Flat) */}
      {viewMode === "list" && (
        <div data-testid="catalog-list-view">
          <ModelListView
            models={filteredModels}
            modelAccounts={state.modelAccounts}
            auditLogs={state.auditLogs}
            sessions={state.sessions}
            selectedModelId={state.selectedModel}
            groupBy={groupBy}
            onModelClick={handleOpenModelSaveView}
            onChatSelect={(id) => {
              state.setSelectedModel(id);
              state.setActiveTab("chat");
            }}
            onManageAccountsClick={(id, name) => {
              setSelectedModelForAccounts({ id, name });
            }}
          />
        </div>
      )}

      {selectedModelForAccounts && (
        <ModelAccountsModal
          modelId={selectedModelForAccounts.id}
          modelName={selectedModelForAccounts.name}
          isOpen={Boolean(selectedModelForAccounts)}
          onClose={() => setSelectedModelForAccounts(null)}
          onAccountChange={() => {
            void state.refreshModelAccounts();
          }}
        />
      )}
    </div>
  );
};
