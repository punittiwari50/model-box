import React, { useState, useMemo, useEffect } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { ModelAccountsModal } from "@/components/models/ModelAccountsModal";
import { PageHeader, StatCard, StatCardGrid } from "@/components/common";
import { CategoryMapper, modelFilterStrategy } from "@/utils";
import { ControlPanel, ModelCardGrid, ModelListView, type ViewType } from "@/components/views";

interface ModelsPageProps {
  readonly state: ModelConnectorState;
  readonly externalSearchQuery?: string;
}

type ConnectionStatusFilter = "all" | "connected" | "not-connected";

export const ModelsPage: React.FC<ModelsPageProps> = ({
  state,
  externalSearchQuery = "",
}) => {
  const [modelSearch, setModelSearch] = useState(externalSearchQuery);
  const [familyFilter, setFamilyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ConnectionStatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewType>("card");
  const [groupBy, setGroupBy] = useState<"family" | "none">("family");
  const [selectedModelForAccounts, setSelectedModelForAccounts] = useState<{
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setModelSearch(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  const categories = useMemo(
    () => CategoryMapper.extractFilterList(state.categories),
    [state.categories],
  );

  const activeAccountModelIds = useMemo(() => {
    const ids = new Set<string>();
    for (const acc of state.modelAccounts) {
      if (acc.isActive) ids.add(acc.modelId);
    }
    return ids;
  }, [state.modelAccounts]);

  const metrics = useMemo(() => {
    const connected = state.models.filter((m) => activeAccountModelIds.has(m.id)).length;
    const notConnected = Math.max(0, state.models.length - connected);
    const providers = new Set(state.models.map((m) => m.family.toLowerCase())).size;
    return {
      total: state.models.length,
      connected,
      notConnected,
      providers,
      activeSessions: state.sessions.length,
    };
  }, [state.models, activeAccountModelIds, state.sessions.length]);

  const filteredModels = useMemo(() => {
    const byFamilyAndQuery = modelFilterStrategy.filter(state.models, {
      searchQuery: modelSearch,
      family: familyFilter,
    });
    if (statusFilter === "connected") {
      return byFamilyAndQuery.filter((m) => activeAccountModelIds.has(m.id));
    }
    if (statusFilter === "not-connected") {
      return byFamilyAndQuery.filter((m) => !activeAccountModelIds.has(m.id));
    }
    return byFamilyAndQuery;
  }, [state.models, modelSearch, familyFilter, statusFilter, activeAccountModelIds]);

  const hasActiveFilters = Boolean(modelSearch.trim() || familyFilter !== "all" || statusFilter !== "all");

  const handleClearAll = () => {
    setModelSearch("");
    setFamilyFilter("all");
    setStatusFilter("all");
  };

  const handleOpenModelSaveView = (modelId: string) => {
    state.setSelectedModel(modelId);
    state.setActiveTab("model-config");
  };

  const handleCreateNewConfiguration = () => {
    state.setSelectedModel("");
    state.setActiveTab("model-config");
  };

  const handleStartSessionForModel = async (modelId: string) => {
    state.setSelectedModel(modelId);
    await state.handleNewSession(modelId);
    state.setActiveTab("chat");
  };

  return (
    <div className="desktop-model-catalog page-stack" data-testid="desktop-model-catalog">
      <PageHeader
        title="Integration & Model Hub"
        subtitle="Discover, connect, and manage AI model providers and local runtimes from one unified workspace."
        actions={
          <>
            <button
              type="button"
              className="btn-ui-secondary"
              onClick={() => void state.refreshData()}
            >
              🔄 Refresh
            </button>
            <button
              type="button"
              className="btn-ui-secondary"
              onClick={() => state.setActiveTab("onboarding")}
            >
              ⬆️ Import
            </button>
            <button
              type="button"
              className="btn-ui-dark"
              onClick={handleCreateNewConfiguration}
            >
              + Connect Model
            </button>
          </>
        }
      />

      <StatCardGrid>
        <StatCard
          label="Total Models"
          value={metrics.total}
          icon="🧩"
          tone="primary"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <StatCard
          label="Connected"
          value={metrics.connected}
          icon="✅"
          tone="success"
          active={statusFilter === "connected"}
          onClick={() => setStatusFilter(statusFilter === "connected" ? "all" : "connected")}
        />
        <StatCard
          label="Not Connected"
          value={metrics.notConnected}
          icon="🔌"
          tone="neutral"
          active={statusFilter === "not-connected"}
          onClick={() => setStatusFilter(statusFilter === "not-connected" ? "all" : "not-connected")}
        />
        <StatCard
          label="Providers"
          value={metrics.providers}
          icon="⚡"
          tone="warning"
        />
        <StatCard
          label="Active Sessions"
          value={metrics.activeSessions}
          icon="💬"
          tone="info"
          onClick={() => state.setActiveTab("sessions")}
        />
      </StatCardGrid>

      <ControlPanel
        viewType={viewMode}
        title="Model Catalogue"
        subtitle="Browse supported providers and AI runtimes"
        resultCount={filteredModels.length}
        onCreateClick={handleCreateNewConfiguration}
        onViewTypeChange={(type) => setViewMode(type)}
        searchQuery={modelSearch}
        onSearchChange={setModelSearch}
        searchPlaceholder="Filter models by name, family, or ID..."
        activeFilter={familyFilter}
        onFilterChange={setFamilyFilter}
        filterOptions={categories}
        activeGroupBy={groupBy}
        onGroupByChange={(g) => setGroupBy(g as "family" | "none")}
        groupByOptions={[
          { value: "family", label: "Provider / Family" },
          { value: "none", label: "None (Flat List)" },
        ]}
        onClearAll={handleClearAll}
        hasActiveFilters={hasActiveFilters}
      />

      {viewMode === "card" && (
        <ModelCardGrid
          models={filteredModels}
          modelAccounts={state.modelAccounts}
          selectedModelId={state.selectedModel}
          onModelClick={handleOpenModelSaveView}
          onChatSelect={(id) => void handleStartSessionForModel(id)}
          onManageAccountsClick={(id, name) => setSelectedModelForAccounts({ id, name })}
        />
      )}

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
            onChatSelect={(id) => void handleStartSessionForModel(id)}
            onManageAccountsClick={(id, name) => setSelectedModelForAccounts({ id, name })}
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
