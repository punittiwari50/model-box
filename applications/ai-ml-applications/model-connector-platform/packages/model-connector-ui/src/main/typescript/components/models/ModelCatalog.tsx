import React, { useState, useMemo } from "react";
import type { UiModel, UiCategory } from "@/types/ui.types";
import { ModelCard } from "@/components/models/ModelCard";
import { Pagination } from "@/components/common/Pagination";
import { CategoryMapper, modelFilterStrategy } from "@/utils";

interface ModelCatalogProps {
  readonly models: readonly UiModel[];
  readonly selectedModel: string;
  readonly categories?: readonly UiCategory[];
  readonly onSelectModel: (modelId: string) => void;
}

export const ModelCatalog: React.FC<ModelCatalogProps> = ({
  models,
  selectedModel,
  categories: propCategories = [],
  onSelectModel,
}) => {
  const [filterFamily, setFilterFamily] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const categoryMeta = useMemo(() => {
    return CategoryMapper.buildMetadataMap(propCategories);
  }, [propCategories]);

  const categories = useMemo(() => {
    return CategoryMapper.extractFilterList(propCategories);
  }, [propCategories]);

  const filtered = useMemo(() => {
    return modelFilterStrategy.filter(models, {
      family: filterFamily,
      searchQuery,
    });
  }, [models, filterFamily, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedModels = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Group paginated models by family
  const groupedCategories = Array.from(new Set(paginatedModels.map((m) => m.family.toLowerCase())));

  const handleFamilyChange = (fam: string): void => {
    setFilterFamily(fam);
    setPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setSearchQuery(e.target.value);
    setPage(1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "1.4rem" }}>Discovered Models Registry</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Grouped by model ecosystem categories with distinct provider runtime color badges
          </p>
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`filter-pill ${cat} ${filterFamily === cat ? "active" : ""}`}
              onClick={() => handleFamilyChange(cat)}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 20px 0" }}>
        <input
          type="text"
          placeholder="Search models by name, ID, or description..."
          value={searchQuery}
          onChange={handleSearchChange}
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "rgba(0, 0, 0, 0.25)",
            border: "1px solid var(--border-glass)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-primary)",
            fontSize: "0.9rem",
          }}
        />
      </div>

      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>
        {groupedCategories.map((fam) => {
          const meta = categoryMeta[fam] || { label: fam.toUpperCase(), icon: "◈", desc: "Model ecosystem" };
          const categoryModels = paginatedModels.filter((m) => m.family.toLowerCase() === fam);
          const isCollapsed = collapsedCategories[fam] !== false;

          return (
            <section key={fam} className={`model-category-group group-${fam}`}>
              <div
                className="category-banner collapsible"
                onClick={() => setCollapsedCategories((prev) => ({ ...prev, [fam]: prev[fam] === false ? true : false }))}
                style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <div className="banner-left">
                  <span className="cat-icon">{meta.icon}</span>
                  <h3 className="cat-name">{meta.label}</h3>
                  <span className={`family-badge ${fam}`}>{categoryModels.length} Models</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    ⚡ Consumption: 15% • 🕒 Last Used: Recently
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--color-primary, #6366f1)", fontWeight: 600 }}>
                    {isCollapsed ? "Expand ▼" : "Collapse ▲"}
                  </span>
                </div>
              </div>

              {!isCollapsed && (
                <div className="models-grid" style={{ padding: "16px" }}>
                  {categoryModels.map((m) => (
                    <ModelCard
                      key={m.id}
                      model={m}
                      isSelected={m.id === selectedModel}
                      onSelect={onSelectModel}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {paginatedModels.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
            No models found matching category and search criteria.
          </div>
        )}
      </div>

      <div style={{ padding: "0 20px 20px" }}>
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          pageSizeOptions={[6, 12, 24]}
          itemName="models"
          className="model-pagination"
          ariaLabel="Model Catalog Navigation"
        />
      </div>
    </div>
  );
};
