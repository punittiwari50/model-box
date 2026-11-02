import React, { useState, useMemo, useEffect } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { Pagination, PaginationConstants } from "@/utils/pagination";
import { ModelAccountsModal } from "@/components/models/ModelAccountsModal";
import {
  CategoryMetricsCalculator,
  CategoryMapper,
  modelFilterStrategy,
} from "@/utils";

interface MobileModelPageProps {
  readonly state: ModelConnectorState;
}

export const MobileModelPage: React.FC<MobileModelPageProps> = ({ state }) => {
  const [categoryPage, setCategoryPage] = useState(1);
  const [selectedFamily, setSelectedFamily] = useState("all");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [categoryModelPages, setCategoryModelPages] = useState<Record<string, number>>({});
  const [selectedModelForAccounts, setSelectedModelForAccounts] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const categoryPageSize = PaginationConstants.DEFAULT_CATEGORY_PAGE_SIZE;

  const categoryMap = useMemo(() => {
    return CategoryMapper.buildMetadataMap(state.categories);
  }, [state.categories]);

  const categories = useMemo(() => {
    return CategoryMapper.extractFilterList(state.categories);
  }, [state.categories]);

  const filteredModels = useMemo(() => {
    return modelFilterStrategy.filter(state.models, {
      family: selectedFamily,
    });
  }, [state.models, selectedFamily]);

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
    <div className="mobile-models-view">
      <div className="mobile-section-header">
        <h3>Available Models ({filteredModels.length})</h3>
      </div>

      <div
        className="family-filter-pills"
        style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "4px 0 12px" }}
      >
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-pill ${cat} ${selectedFamily === cat ? "active" : ""}`}
            onClick={() => {
              setSelectedFamily(cat);
              setCategoryPage(1);
            }}
            style={{ fontSize: "0.72rem", padding: "4px 10px", whiteSpace: "nowrap" }}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      <div
        className="mobile-cards-list"
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        {paginatedFamilies.map((fam) => {
          const meta = categoryMap[fam] || { label: fam.toUpperCase(), icon: "◈" };
          const categoryModels = categoryGroups.get(fam) || [];
          const stats = CategoryMetricsCalculator.calculateStats(
            categoryModels,
            state.auditLogs,
            state.sessions,
            "Never",
          );
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
            <div
              key={fam}
              className={`model-category-group group-${fam}`}
              style={{ marginBottom: "8px" }}
            >
              <div
                className="category-banner collapsible"
                onClick={() => toggleCategoryCollapse(fam)}
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="cat-icon" style={{ fontSize: "1.1rem" }}>
                      {meta.icon}
                    </span>
                    <h4 className="cat-name" style={{ fontSize: "0.95rem", margin: 0 }}>
                      {meta.label}
                    </h4>
                    <span className={`family-badge ${fam}`}>{categoryModels.length}</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-accent, #60a5fa)" }}>
                    {isCollapsed ? "Expand ▼" : "Collapse ▲"}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "0.75rem",
                    color: "rgba(255, 255, 255, 0.7)",
                    flexWrap: "wrap",
                  }}
                >
                  <span>⚡ Consumption: {stats.tokenConsumptionPct}%</span>
                  <span>•</span>
                  <span>🕒 Last Used: {stats.lastUsed}</span>
                </div>
              </div>

              {!isCollapsed && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    padding: "10px",
                  }}
                >
                  {displayedCategoryModels.map((m) => (
                    <div
                      key={m.id}
                      className={`mobile-model-card cat-${fam} ${
                        state.selectedModel === m.id ? "active" : ""
                      }`}
                    >
                      <div className="card-top">
                        <div className="model-name">
                          <span style={{ marginRight: "4px" }}>{meta.icon}</span>
                          {m.name}
                        </div>
                        <span className={`family-badge ${m.family.toLowerCase()}`}>
                          {m.family.toUpperCase()}
                        </span>
                      </div>
                      <div className="model-id font-mono">{m.id}</div>
                      <div className="model-tags">
                        <span className="tier-tag">{m.tier.toUpperCase()}</span>
                        {m.supportedStrategies.map((s) => (
                          <span key={s} className="strat-tag">
                            {s.toUpperCase()}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        <button
                          className="mobile-select-btn"
                          style={{ flex: 1 }}
                          onClick={() => {
                            state.setSelectedModel(m.id);
                            state.setActiveTab("chat");
                          }}
                        >
                          {state.selectedModel === m.id ? "Selected 💬" : "Select & Chat"}
                        </button>
                        <button
                          className="mobile-select-btn"
                          style={{
                            background: "rgba(255, 255, 255, 0.08)",
                            borderColor: "rgba(255, 255, 255, 0.2)",
                            color: "#cbd5e1",
                          }}
                          onClick={() =>
                            setSelectedModelForAccounts({ id: m.id, name: m.name })
                          }
                        >
                          🔑 Accounts
                        </button>
                      </div>
                    </div>
                  ))}

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
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
            No models available in this category.
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
