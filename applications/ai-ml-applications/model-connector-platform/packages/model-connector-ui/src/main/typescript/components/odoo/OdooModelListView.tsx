import React, { useState } from "react";
import type { UiModel, UiModelAccount, UiSession, UiAuditRecord } from "@/types/ui.types";
import { CategoryMetricsCalculator } from "@/utils";

export interface OdooModelListViewProps {
  readonly models: readonly UiModel[];
  readonly modelAccounts: readonly UiModelAccount[];
  readonly auditLogs: readonly UiAuditRecord[];
  readonly sessions: readonly UiSession[];
  readonly selectedModelId: string;
  readonly groupBy: "family" | "status" | "none";
  readonly onModelClick: (modelId: string) => void;
  readonly onChatSelect?: (modelId: string) => void;
  readonly onManageAccountsClick?: (modelId: string, modelName: string) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  gemini: "✦",
  grok: "⚡",
  claude: "🧠",
  chatgpt: "🤖",
  openai: "🤖",
  copilot: "🚀",
  ollama: "🛡️",
  fallback: "🛡️",
};

export const OdooModelListView: React.FC<OdooModelListViewProps> = ({
  models,
  modelAccounts,
  auditLogs,
  sessions,
  selectedModelId,
  groupBy,
  onModelClick,
  onChatSelect,
  onManageAccountsClick,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: prev[key] === false ? true : false,
    }));
  };

  if (models.length === 0) {
    return (
      <div className="odoo-empty-state">
        <span className="empty-icon">📂</span>
        <h3>No Models Found</h3>
        <p>No model configurations match your current filter or search criteria.</p>
      </div>
    );
  }

  // 1. Group By: Family / Provider (matches user's screenshot!)
  if (groupBy === "family") {
    const familyMap = new Map<string, UiModel[]>();
    for (const m of models) {
      const fam = m.family.toLowerCase();
      const list = familyMap.get(fam) || [];
      list.push(m);
      familyMap.set(fam, list);
    }

    const families = Array.from(familyMap.keys());

    return (
      <div className="odoo-grouped-list-view" data-testid="odoo-grouped-list">
        {families.map((fam) => {
          const groupModels = familyMap.get(fam) || [];
          const isCollapsed = Boolean(collapsedGroups[fam]);
          const icon = CATEGORY_ICONS[fam] || "◈";
          const stats = CategoryMetricsCalculator.calculateStats(groupModels as UiModel[], auditLogs, sessions);

          return (
            <div key={fam} className={`model-category-group group-${fam}`}>
              <div
                className="category-banner collapsible"
                onClick={() => toggleGroup(fam)}
                title="Click to expand / collapse group"
              >
                <div className="banner-left">
                  <span className="cat-icon">{icon}</span>
                  <h3 className="cat-name">{fam.toUpperCase()}</h3>
                  <span className={`family-badge ${fam}`}>{groupModels.length} MODELS</span>
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
                <div className="catalog-table-wrapper" style={{ margin: 0, border: "none", borderRadius: 0 }}>
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
                      {groupModels.map((m) => {
                        const accounts = modelAccounts.filter((a) => a.modelId === m.id);
                        const activeAcc = accounts.find((a) => a.isActive);
                        const isSelected = selectedModelId === m.id;

                        return (
                          <tr
                            key={m.id}
                            className={`odoo-list-row ${isSelected ? "selected-row" : ""}`}
                            onClick={() => onModelClick(m.id)}
                            title={`Click to open Save View for ${m.name}`}
                            data-testid={`odoo-row-${m.id}`}
                          >
                            <td>
                              <div className="model-cell-name">
                                <span style={{ marginRight: "6px" }}>{icon}</span>
                                <strong>{m.name}</strong>
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
                              {activeAcc ? (
                                <span
                                  className="status-pill active"
                                  title={`Active Account: ${activeAcc.accountName} (${activeAcc.userEmail})`}
                                >
                                  ACTIVE
                                </span>
                              ) : accounts.length > 0 ? (
                                <span className="status-pill inactive" title="Accounts configured but inactive">
                                  INACTIVE
                                </span>
                              ) : (
                                <span className="status-pill no-account" title="No accounts configured">
                                  NO ACCOUNT
                                </span>
                              )}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <button
                                  type="button"
                                  className="btn-configure-action"
                                  onClick={() => onModelClick(m.id)}
                                  title="Open Save View (Configure Credentials)"
                                >
                                  ⚙️ Configure
                                </button>
                                {onChatSelect && (
                                  <button
                                    type="button"
                                    className="select-model-btn"
                                    onClick={() => onChatSelect(m.id)}
                                  >
                                    {isSelected ? "Selected 💬" : "Select & Chat"}
                                  </button>
                                )}
                                {onManageAccountsClick && (
                                  <button
                                    type="button"
                                    className="manage-accounts-btn"
                                    onClick={() => onManageAccountsClick(m.id, m.name)}
                                    title="Manage model accounts"
                                  >
                                    🔑 Accounts {accounts.length > 0 ? `(${accounts.length})` : ""}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 2. Flat List / Other Groupings
  return (
    <div className="odoo-flat-list-view" data-testid="odoo-flat-list">
      <div className="catalog-table-wrapper">
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
            {models.map((m) => {
              const accounts = modelAccounts.filter((a) => a.modelId === m.id);
              const activeAcc = accounts.find((a) => a.isActive);
              const isSelected = selectedModelId === m.id;
              const icon = CATEGORY_ICONS[m.family.toLowerCase()] || "◈";

              return (
                <tr
                  key={m.id}
                  className={`odoo-list-row ${isSelected ? "selected-row" : ""}`}
                  onClick={() => onModelClick(m.id)}
                  title={`Click to open Save View for ${m.name}`}
                  data-testid={`odoo-row-${m.id}`}
                >
                  <td>
                    <div className="model-cell-name">
                      <span style={{ marginRight: "6px" }}>{icon}</span>
                      <strong>{m.name}</strong>
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
                    {activeAcc ? (
                      <span className="status-pill active">ACTIVE</span>
                    ) : accounts.length > 0 ? (
                      <span className="status-pill inactive">INACTIVE</span>
                    ) : (
                      <span className="status-pill no-account">NO ACCOUNT</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn-configure-action"
                        onClick={() => onModelClick(m.id)}
                        title="Open Save View (Configure Credentials)"
                      >
                        ⚙️ Configure
                      </button>
                      {onChatSelect && (
                        <button
                          type="button"
                          className="select-model-btn"
                          onClick={() => onChatSelect(m.id)}
                        >
                          {isSelected ? "Selected 💬" : "Select & Chat"}
                        </button>
                      )}
                      {onManageAccountsClick && (
                        <button
                          type="button"
                          className="manage-accounts-btn"
                          onClick={() => onManageAccountsClick(m.id, m.name)}
                          title="Manage model accounts"
                        >
                          🔑 Accounts {accounts.length > 0 ? `(${accounts.length})` : ""}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

