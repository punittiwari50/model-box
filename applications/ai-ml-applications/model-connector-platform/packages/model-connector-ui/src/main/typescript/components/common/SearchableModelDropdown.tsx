import React, { useState, useRef, useEffect, useMemo } from "react";
import type { UiModel } from "@/types/ui.types";
import { StatusBadge } from "@/components/common/StatusBadge";

interface SearchableModelDropdownProps {
  readonly models: readonly UiModel[];
  readonly selectedModelId: string;
  readonly onSelectModel: (modelId: string) => void;
  readonly registeredModelIds?: ReadonlySet<string>;
  readonly placeholder?: string;
  readonly recommendedModelId?: string;
}

export const SearchableModelDropdown: React.FC<SearchableModelDropdownProps> = ({
  models,
  selectedModelId,
  onSelectModel,
  registeredModelIds,
  placeholder = "Search and select a model...",
  recommendedModelId = "gemini-3.8-flash",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId),
    [models, selectedModelId],
  );

  const filteredSortedModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = query
      ? models.filter(
          (m) =>
            m.name.toLowerCase().includes(query) ||
            m.id.toLowerCase().includes(query) ||
            (m.family && m.family.toLowerCase().includes(query)),
        )
      : [...models];

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [models, searchQuery]);

  const handleSelect = (modelId: string) => {
    onSelectModel(modelId);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} className="searchable-model-dropdown">
      <button
        type="button"
        className={`dropdown-trigger-btn ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="trigger-content">
          <span className="trigger-status-icon" aria-hidden="true">
            {registeredModelIds?.has(selectedModelId) ? "🟢" : "⚡"}
          </span>
          <span className="trigger-selected-label" title={selectedModel?.name || selectedModelId}>
            {selectedModel?.name || selectedModelId || "Select Model"}
          </span>
          {selectedModelId === recommendedModelId && (
            <StatusBadge label="⭐ Recommended" tone="warning" />
          )}
        </div>
        <span className={`trigger-chevron ${isOpen ? "rotated" : ""}`} aria-hidden="true">
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="dropdown-menu-popover">
          <div className="dropdown-search-box">
            <span className="dropdown-search-icon" aria-hidden="true">
              🔍
            </span>
            <input
              ref={searchInputRef}
              type="text"
              className="dropdown-search-input"
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="dropdown-options-list" role="listbox">
            {filteredSortedModels.length === 0 ? (
              <div className="dropdown-empty">
                No matching models found for &apos;{searchQuery}&apos;
              </div>
            ) : (
              filteredSortedModels.map((m) => {
                const isSelected = m.id === selectedModelId;
                const isReg = registeredModelIds?.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`dropdown-option-item ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSelect(m.id)}
                  >
                    <div className="option-left">
                      <span className="option-dot" aria-hidden="true">
                        {isReg ? "🟢" : "⚪"}
                      </span>
                      <div className="option-text">
                        <span className="option-name">{m.name}</span>
                        <span className="option-meta">
                          {m.family || "general"} • {m.id}
                        </span>
                      </div>
                    </div>

                    <div className="option-badges">
                      {m.id === recommendedModelId && <StatusBadge label="⭐ Best" tone="warning" />}
                      <StatusBadge
                        label={m.family === "ollama" ? "Ollama" : m.family?.toUpperCase() || "API"}
                        tone={m.family === "ollama" ? "warning" : "primary"}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
