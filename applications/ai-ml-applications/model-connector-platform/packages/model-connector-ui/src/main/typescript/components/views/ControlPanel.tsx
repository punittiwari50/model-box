import React from "react";

export type ViewType = "list" | "card" | "form";
export type FormMode = "create" | "save";

export interface ControlPanelProps {
  readonly viewType: ViewType;
  readonly formMode?: FormMode;
  readonly title: string;
  readonly breadcrumbParent?: string;
  readonly onBreadcrumbParentClick?: () => void;
  readonly onCreateClick?: () => void | Promise<void>;
  readonly onSaveClick?: () => void | Promise<void>;
  readonly onDiscardClick?: () => void | Promise<void>;
  readonly onDeleteClick?: () => void | Promise<void>;
  readonly onChatClick?: () => void | Promise<void>;
  readonly isSaving?: boolean;
  readonly isDeleting?: boolean;
  readonly onViewTypeChange?: (type: "list" | "card") => void;
  readonly searchQuery?: string;
  readonly onSearchChange?: (query: string) => void;
  readonly searchPlaceholder?: string;
  readonly activeFilter?: string;
  readonly onFilterChange?: (filter: string) => void;
  readonly filterOptions?: readonly string[];
  readonly activeGroupBy?: string;
  readonly onGroupByChange?: (groupBy: string) => void;
  readonly groupByOptions?: readonly { readonly value: string; readonly label: string }[];
  readonly totalItems?: number;
  readonly currentRange?: string;
  readonly onPrevPage?: () => void;
  readonly onNextPage?: () => void;
  readonly hasPrevPage?: boolean;
  readonly hasNextPage?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  viewType,
  formMode = "save",
  title,
  breadcrumbParent,
  onBreadcrumbParentClick,
  onCreateClick,
  onSaveClick,
  onDiscardClick,
  onDeleteClick,
  onChatClick,
  isSaving = false,
  isDeleting = false,
  onViewTypeChange,
  searchQuery = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  activeFilter,
  onFilterChange,
  filterOptions = [],
  activeGroupBy,
  onGroupByChange,
  groupByOptions = [],
  totalItems: _totalItems,
  currentRange,
  onPrevPage,
  onNextPage,
  hasPrevPage,
  hasNextPage,
}) => {
  const isFormView = viewType === "form";

  return (
    <div className="control-panel" data-testid="control-panel">
      {/* 1. Left Action Toolbar / Breadcrumbs */}
      <div className="control-left-section">
        {!isFormView ? (
          <div className="list-actions-group">
            {onCreateClick && (
              <button
                type="button"
                className="btn-create-primary"
                onClick={onCreateClick}
                title="Create a new model configuration (Create View)"
                data-testid="btn-create"
              >
                <span className="btn-icon">➕</span>
                <span className="btn-label">Create</span>
              </button>
            )}
            <h2 className="panel-title">{title}</h2>
          </div>
        ) : (
          <div className="form-actions-group">
            <nav className="breadcrumb-nav" aria-label="Breadcrumb">
              {breadcrumbParent && onBreadcrumbParentClick && (
                <>
                  <button
                    type="button"
                    className="breadcrumb-link"
                    onClick={onBreadcrumbParentClick}
                    title={`Return to ${breadcrumbParent}`}
                  >
                    {breadcrumbParent}
                  </button>
                  <span className="breadcrumb-sep">/</span>
                </>
              )}
              <span className="breadcrumb-current">
                {formMode === "create" ? "New Configuration" : title}
              </span>
            </nav>

            <div className="form-buttons-row">
              {onSaveClick && (
                <button
                  type="button"
                  className="btn-save-primary"
                  onClick={onSaveClick}
                  disabled={isSaving}
                  title="Save configuration (Save View)"
                  data-testid="btn-save"
                >
                  <span className="btn-icon">💾</span>
                  <span className="btn-label">{isSaving ? "Saving..." : formMode === "create" ? "Save Configuration" : "Save Changes"}</span>
                </button>
              )}

              {onDiscardClick && (
                <button
                  type="button"
                  className="btn-discard-secondary"
                  onClick={onDiscardClick}
                  disabled={isSaving}
                  title="Discard unsaved changes and return to list"
                  data-testid="btn-discard"
                >
                  <span className="btn-icon">✕</span>
                  <span className="btn-label">Discard</span>
                </button>
              )}

              {formMode === "save" && onDeleteClick && (
                <button
                  type="button"
                  className="btn-delete-danger"
                  onClick={onDeleteClick}
                  disabled={isDeleting || isSaving}
                  title="Delete or revoke active account (Delete View)"
                  data-testid="btn-delete"
                >
                  <span className="btn-icon">🗑</span>
                  <span className="btn-label">{isDeleting ? "Deleting..." : "Delete / Revoke"}</span>
                </button>
              )}

              {onChatClick && (
                <button
                  type="button"
                  className="btn-chat-shortcut"
                  onClick={onChatClick}
                  title="Select model and jump to chat"
                >
                  <span className="btn-icon">💬</span>
                  <span className="btn-label">Chat</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Center Search & Multi-Facet Filters / Group By */}
      {!isFormView && (
        <div className="control-center-section">
          {onSearchChange && (
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="control-search-input desktop-search-input"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                data-testid="search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => onSearchChange("")}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {filterOptions.length > 0 && onFilterChange && (
            <div className="filter-pills-bar family-filter-pills">
              {filterOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`filter-pill ${activeFilter === opt ? "active" : ""}`}
                  data-family={opt.toUpperCase()}
                  data-testid={`filter-${opt.toLowerCase()}`}
                  onClick={() => onFilterChange(opt)}
                >
                  {opt.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {groupByOptions.length > 0 && onGroupByChange && (
            <div className="groupby-wrapper">
              <span className="groupby-label">Group By:</span>
              <select
                className="groupby-select"
                value={activeGroupBy || groupByOptions[0]?.value}
                onChange={(e) => onGroupByChange(e.target.value)}
                data-testid="groupby-select"
              >
                {groupByOptions.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* 3. Right Section: Card/List View Switcher & Pager */}
      {!isFormView && (
        <div className="control-right-section">
          {currentRange && (
            <div className="pager-indicator" data-testid="pager-indicator">
              <span className="pager-range">{currentRange}</span>
              {(onPrevPage || onNextPage) && (
                <div className="pager-nav-btns">
                  <button
                    type="button"
                    className="pager-btn"
                    onClick={onPrevPage}
                    disabled={!hasPrevPage}
                    title="Previous page"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="pager-btn"
                    onClick={onNextPage}
                    disabled={!hasNextPage}
                    title="Next page"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          )}

          {onViewTypeChange && (
            <div className="view-mode-switcher" data-testid="view-switcher">
              <button
                type="button"
                className={`view-mode-btn ${viewType === "card" ? "active" : ""}`}
                onClick={() => onViewTypeChange("card")}
                title="Switch to Card View (Kanban)"
                data-testid="view-card"
              >
                <span className="mode-icon">▦</span>
                <span className="mode-text">Cards</span>
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewType === "list" ? "active" : ""}`}
                onClick={() => onViewTypeChange("list")}
                title="Switch to List View (Table / Grouped)"
                data-testid="view-list"
              >
                <span className="mode-icon">☰</span>
                <span className="mode-text">List</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

