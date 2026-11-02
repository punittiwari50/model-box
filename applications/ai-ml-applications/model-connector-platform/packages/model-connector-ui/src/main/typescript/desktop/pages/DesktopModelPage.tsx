import React, { useState, useMemo, useEffect } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { Pagination, PaginationConstants } from "@/utils/pagination";
import { ModelAccountsModal } from "@/components/models/ModelAccountsModal";
import {
  CategoryMetricsCalculator,
  CategoryMapper,
  modelFilterStrategy,
} from "@/utils";

interface DesktopModelPageProps {
  readonly state: ModelConnectorState;
}

export const DesktopModelPage: React.FC<DesktopModelPageProps> = ({ state }) => {
  const [modelSearch, setModelSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryModelPages, setCategoryModelPages] = useState<Record<string, number>>({});
  const categoryPageSize = PaginationConstants.DEFAULT_CATEGORY_PAGE_SIZE;

  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [selectedModelForAccounts, setSelectedModelForAccounts] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Dynamic category mapping sourced directly from SQLite database via state.categories
  const categoryMap = useMemo(() => {
    return CategoryMapper.buildMetadataMap(state.categories);
  }, [state.categories]);

  const categories = useMemo(() => {
    return CategoryMapper.extractFilterList(state.categories);
  }, [state.categories]);

  const filteredModels = useMemo(() => {
    return modelFilterStrategy.filter(state.models, {
      searchQuery: modelSearch,
      family: familyFilter,
    });
  }, [state.models, modelSearch, familyFilter]);

  // Group all matching models by family category
  const categoryGroups = useMemo(() => {
    const map = new Map<string, typeof state.models>();
    for (const m of filteredModels) {
      const fam = m.family.toLowerCase();
      const list = map.get(fam) || [];
      list.push(m);
      map.set(fam, list);
    }
    return map;
  }, [filteredModels]);

  const activeFamilies = useMemo(() => {
    return Array.from(categoryGroups.keys());
  }, [categoryGroups]);

  const totalCategoryPages = Math.max(1, Math.ceil(activeFamilies.length / categoryPageSize));
  const safeCategoryPage = Math.min(Math.max(1, categoryPage), totalCategoryPages);

  useEffect(() => {
    if (categoryPage > totalCategoryPages) {
      setCategoryPage(1);
    }
  }, [totalCategoryPages, categoryPage]);

  const paginatedFamilies = useMemo(() => {
    return activeFamilies.slice((safeCategoryPage - 1) * categoryPageSize, safeCategoryPage * categoryPageSize);
  }, [activeFamilies, safeCategoryPage, categoryPageSize]);

  const toggleCategoryCollapse = (fam: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [fam]: prev[fam] === false ? true : false,
    }));
  };

  const handleCategoryModelPageChange = (fam: string, page: number) => {
    setCategoryModelPages((prev) => ({
      ...prev,
      [fam]: page,
    }));
  };

  return (
    <div className="desktop-model-catalog">
      <div className="catalog-toolbar">
        <input
          type="text"
          className="desktop-search-input"
          placeholder="Filter models by name, family, or ID..."
          value={modelSearch}
          onChange={(e) => {
            setModelSearch(e.target.value);
            setCategoryPage(1);
          }}
        />

        <div className="family-filter-pills">
          {categories.map((fam) => (
            <button
              key={fam}
              className={`filter-pill ${fam} ${familyFilter === fam ? "active" : ""}`}
              onClick={() => {
                setFamilyFilter(fam);
                setCategoryPage(1);
              }}
            >
              {fam.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {paginatedFamilies.map((fam) => {
          const meta = categoryMap[fam] || {
            label: fam.toUpperCase(),
            icon: "◈",
            accentColor: "#6366f1",
          };
          const categoryModels = categoryGroups.get(fam) || [];
          const stats = CategoryMetricsCalculator.calculateStats(categoryModels, state.auditLogs, state.sessions);
          const isCollapsed = collapsedCategories[fam] !== false;

          const exceedsThreshold = categoryModels.length > PaginationConstants.CATEGORY_MODEL_PAGINATION_THRESHOLD;
          const currentCategoryPage = categoryModelPages[fam] || 1;
          const totalCategoryModelPages = Math.max(1, Math.ceil(categoryModels.length / PaginationConstants.DEFAULT_CATEGORY_MODEL_PAGE_SIZE));
          const safeCategoryModelPage = Math.min(Math.max(1, currentCategoryPage), totalCategoryModelPages);

          const displayedCategoryModels = exceedsThreshold
            ? categoryModels.slice(
                (safeCategoryModelPage - 1) * PaginationConstants.DEFAULT_CATEGORY_MODEL_PAGE_SIZE,
                safeCategoryModelPage * PaginationConstants.DEFAULT_CATEGORY_MODEL_PAGE_SIZE
              )
            : categoryModels;

          return (
            <div key={fam} className={`model-category-group group-${fam}`}>
              <div
                className="category-banner collapsible"
                onClick={() => toggleCategoryCollapse(fam)}
                title="Click to collapse / expand category"
              >
                <div className="banner-left">
                  <span className="cat-icon">{meta.icon}</span>
                  <h3 className="cat-name">{meta.label}</h3>
                  <span className={`family-badge ${fam}`}>{categoryModels.length} MODELS</span>
                </div>

                <div className="banner-right">
                  <div className="stat-pill" title="Token consumption in %">
                    <span>⚡ Consumption:</span>
                    <span className="stat-value">{stats.tokenConsumptionPct}%</span>
                  </div>
                  <div className="stat-pill" title="Last used timestamp">
                    <span>🕒 Last Used:</span>
                    <span className="stat-value">{stats.lastUsed}</span>
                  </div>
                  <span className="collapse-toggle">
                    {isCollapsed ? "Expand ▼" : "Collapse ▲"}
                  </span>
                </div>
              </div>

              {!isCollapsed && (
                <div
                  className="catalog-table-wrapper"
                  style={{ margin: 0, border: "none", borderRadius: 0 }}
                >
                  <table className="desktop-table">
                    <thead>
                      <tr>
                        <th>Model Name & Identifier</th>
                        <th>Category</th>
                        <th>Tier</th>
                        <th>Supported Strategies</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedCategoryModels.map((m) => {
                        const modelAccounts = state.modelAccounts.filter((a) => a.modelId === m.id);
                        const activeAccount = modelAccounts.find((a) => a.isActive);
                        const hasActiveAccount = Boolean(activeAccount);

                        return (
                          <tr
                            key={m.id}
                            className={state.selectedModel === m.id ? "selected-row" : ""}
                          >
                            <td>
                              <div className="model-cell-name">
                                <span style={{ marginRight: "6px" }}>{meta.icon}</span>
                                {m.name}
                              </div>
                              <div className="model-cell-id">{m.id}</div>
                            </td>
                            <td>
                              <span className={`family-badge ${m.family.toLowerCase()}`}>
                                {m.family.toUpperCase()}
                              </span>
                            </td>
                            <td>
                              <span className={`tier-badge ${m.tier}`}>{m.tier.toUpperCase()}</span>
                            </td>
                            <td>
                              <div className="strategy-tags">
                                {m.supportedStrategies.map((s) => (
                                  <span key={s} className="strategy-tag">
                                    {s.toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              {hasActiveAccount ? (
                                <span
                                  className="status-pill active"
                                  title={`Active Account: ${activeAccount?.accountName} (${activeAccount?.userEmail})`}
                                >
                                  ACTIVE
                                </span>
                              ) : modelAccounts.length > 0 ? (
                                <span
                                  className="status-pill"
                                  style={{
                                    background: "rgba(245, 158, 11, 0.15)",
                                    color: "#fbbf24",
                                    border: "1px solid rgba(245, 158, 11, 0.35)",
                                    padding: "4px 8px",
                                    borderRadius: "100px",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                  }}
                                  title="Accounts configured but currently inactive (requires activation)"
                                >
                                  INACTIVE
                                </span>
                              ) : (
                                <span
                                  className="status-pill"
                                  style={{
                                    background: "rgba(148, 163, 184, 0.12)",
                                    color: "#94a3b8",
                                    border: "1px solid rgba(148, 163, 184, 0.25)",
                                    padding: "4px 8px",
                                    borderRadius: "100px",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                  }}
                                  title="No accounts or credentials configured for this model"
                                >
                                  NO ACCOUNT
                                </span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <button
                                  className="select-model-btn"
                                  onClick={() => {
                                    state.setSelectedModel(m.id);
                                    state.setActiveTab("chat");
                                  }}
                                >
                                  {state.selectedModel === m.id ? "Selected 💬" : "Select & Chat"}
                                </button>
                                <button
                                  className="manage-accounts-btn"
                                  onClick={() =>
                                    setSelectedModelForAccounts({ id: m.id, name: m.name })
                                  }
                                  title="Manage API tokens, cookies, and CLI OAuth credentials"
                                >
                                  🔑 Accounts {modelAccounts.length > 0 ? `(${modelAccounts.length})` : ""}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {exceedsThreshold && (
                    <Pagination
                      currentPage={safeCategoryModelPage}
                      totalPages={totalCategoryModelPages}
                      totalItems={categoryModels.length}
                      pageSize={PaginationConstants.DEFAULT_CATEGORY_MODEL_PAGE_SIZE}
                      onPageChange={(p) => handleCategoryModelPageChange(fam, p)}
                      itemName="models"
                      className="category-inner-pagination"
                      ariaLabel={`${meta.label} Models Pagination`}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {paginatedFamilies.length === 0 && (
          <div style={{ textAlign: "center", padding: "50px", color: "var(--text-muted)" }}>
            No models found matching criteria.
          </div>
        )}
      </div>

      <Pagination
        currentPage={safeCategoryPage}
        totalPages={totalCategoryPages}
        totalItems={activeFamilies.length}
        pageSize={categoryPageSize}
        onPageChange={setCategoryPage}
        itemName="categories"
        className="model-pagination"
        ariaLabel="Category Catalog Navigation"
      />

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
