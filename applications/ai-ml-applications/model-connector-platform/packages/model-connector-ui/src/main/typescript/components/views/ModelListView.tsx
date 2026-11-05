import React, { useState } from "react";
import type { UiModel, UiModelAccount, UiSession, UiAuditRecord } from "@/types/ui.types";
import { CategoryMetricsCalculator } from "@/utils";

export interface ModelListViewProps {
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

export const ModelListView: React.FC<ModelListViewProps> = ({
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    const activeFamily = models.find((m) => m.id === selectedModelId)?.family.toLowerCase() || "gemini";
    for (const m of models) {
      const fam = m.family.toLowerCase();
      if (fam !== activeFamily && initial[fam] === undefined) {
        initial[fam] = true;
      }
    }
    return initial;
  });

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (models.length === 0) {
    return (
      <div className="view-empty-state">
        <span className="empty-icon">📂</span>
        <h3>No Models Found</h3>
        <p>No model configurations match your current filter or search criteria.</p>
      </div>
    );
  }

  // 1. Group By: Family / Provider (matches reference layout)
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
      <div className="grouped-list-view" data-testid="grouped-list">
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
                <div className="category-table-wrapper">
                  <table className="desktop-table">
                    <thead>
                      <tr>
                        <th>MODEL NAME &amp; IDENTIFIER</th>
                        <th>CATEGORY</th>
                        <th>TIER</th>
                        <th>SUPPORTED STRATEGIES</th>
                        <th>STATUS</th>
                        <th>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupModels.map((m) => {
                        const accounts = modelAccounts.filter((a) => a.modelId === m.id);
                        const isSelected = selectedModelId === m.id;
                        const activeAcc = accounts.find((a) => a.isActive);
                        const statusLabel = m.status === "ACTIVE"
                          ? "ACTIVE"
                          : activeAcc
                          ? "CONFIGURED"
                          : "NO ACCOUNT";

                        return (
                          <tr
                            key={m.id}
                            className={`model-list-row odoo-list-row ${isSelected ? "selected-row" : ""}`}
                            onClick={() => onModelClick(m.id)}
                            title="Click to open Save View for this model configuration"
                            data-testid={`model-row-${m.id}`}
                          >
                            <td className="col-identity">
                              <span className="table-model-icon">◈</span>
                              <div>
                                <span className="table-model-name">{m.name}</span>
                                <span className="table-model-id">{m.id}</span>
                              </div>
                            </td>
                            <td>
                              <span className="cat-badge">{m.family.toUpperCase()}</span>
                            </td>
                            <td>
                              <span className="tier-tag">{m.tier || "FREEWARE"}</span>
                            </td>
                            <td>
                              <div className="strategies-cell">
                                {m.supportedStrategies.map((strat) => (
                                  <span key={strat} className="strategy-micro-pill">
                                    {strat.toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <span className={`status-pill ${statusLabel.toLowerCase().replace(/\s+/g, "-")}`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td>
                              <div className="table-actions-cell" onClick={(e) => e.stopPropagation()}>
                                {onChatSelect && (
                                  <button
                                    type="button"
                                    className={`btn-table-chat ${isSelected ? "selected" : ""}`}
                                    onClick={() => onChatSelect(m.id)}
                                    title="Open chat"
                                  >
                                    {isSelected ? "Selected 💬" : "Select & Chat"}
                                  </button>
                                )}
                                {onManageAccountsClick && (
                                  <button
                                    type="button"
                                    className="btn-table-accounts"
                                    onClick={() => onManageAccountsClick(m.id, m.name)}
                                    title="View accounts"
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

  // 2. Flat List View (No Grouping)
  return (
    <div className="flat-list-view" data-testid="flat-list-view">
      <div className="category-table-wrapper">
        <table className="desktop-table">
          <thead>
            <tr>
              <th>MODEL NAME &amp; IDENTIFIER</th>
              <th>CATEGORY</th>
              <th>TIER</th>
              <th>SUPPORTED STRATEGIES</th>
              <th>STATUS</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const accounts = modelAccounts.filter((a) => a.modelId === m.id);
              const isSelected = selectedModelId === m.id;
              const activeAcc = accounts.find((a) => a.isActive);
              const statusLabel = m.status === "ACTIVE"
                ? "ACTIVE"
                : activeAcc
                ? "CONFIGURED"
                : "NO ACCOUNT";

              return (
                <tr
                  key={m.id}
                  className={`model-list-row odoo-list-row ${isSelected ? "selected-row" : ""}`}
                  onClick={() => onModelClick(m.id)}
                  title="Click to open Save View for this model configuration"
                  data-testid={`model-row-${m.id}`}
                >
                  <td className="col-identity">
                    <span className="table-model-icon">◈</span>
                    <div>
                      <span className="table-model-name">{m.name}</span>
                      <span className="table-model-id">{m.id}</span>
                    </div>
                  </td>
                  <td>
                    <span className="cat-badge">{m.family.toUpperCase()}</span>
                  </td>
                  <td>
                    <span className="tier-tag">{m.tier || "FREEWARE"}</span>
                  </td>
                  <td>
                    <div className="strategies-cell">
                      {m.supportedStrategies.map((strat) => (
                        <span key={strat} className="strategy-micro-pill">
                          {strat.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill ${statusLabel.toLowerCase().replace(/\s+/g, "-")}`}>
                      {statusLabel}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions-cell" onClick={(e) => e.stopPropagation()}>
                      {onChatSelect && (
                        <button
                          type="button"
                          className={`btn-table-chat ${isSelected ? "selected" : ""}`}
                          onClick={() => onChatSelect(m.id)}
                          title="Open chat"
                        >
                          {isSelected ? "Selected 💬" : "Select & Chat"}
                        </button>
                      )}
                      {onManageAccountsClick && (
                        <button
                          type="button"
                          className="btn-table-accounts"
                          onClick={() => onManageAccountsClick(m.id, m.name)}
                          title="View accounts"
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

