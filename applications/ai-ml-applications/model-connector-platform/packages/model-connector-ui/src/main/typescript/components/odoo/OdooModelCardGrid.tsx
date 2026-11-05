import React from "react";
import type { UiModel, UiModelAccount } from "@/types/ui.types";

export interface OdooModelCardGridProps {
  readonly models: readonly UiModel[];
  readonly modelAccounts: readonly UiModelAccount[];
  readonly selectedModelId: string;
  readonly onModelClick: (modelId: string) => void;
  readonly onChatSelect?: (modelId: string) => void;
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

export const OdooModelCardGrid: React.FC<OdooModelCardGridProps> = ({
  models,
  modelAccounts,
  selectedModelId,
  onModelClick,
  onChatSelect,
}) => {
  if (models.length === 0) {
    return (
      <div className="odoo-empty-state">
        <span className="empty-icon">📂</span>
        <h3>No Models Found</h3>
        <p>No model configurations match your current filter or search criteria.</p>
      </div>
    );
  }

  return (
    <div className="odoo-card-grid" data-testid="odoo-card-grid">
      {models.map((m) => {
        const familyKey = m.family.toLowerCase();
        const icon = CATEGORY_ICONS[familyKey] || "◈";
        const accounts = modelAccounts.filter((a) => a.modelId === m.id);
        const activeAcc = accounts.find((a) => a.isActive);
        const isSelected = selectedModelId === m.id;

        return (
          <div
            key={m.id}
            className={`odoo-model-card group-${familyKey} ${isSelected ? "selected" : ""}`}
            onClick={() => onModelClick(m.id)}
            data-testid={`odoo-card-${m.id}`}
            title={`Click to open Save View for ${m.name}`}
          >
            <div className="card-top-row">
              <div className="card-identity">
                <span className="provider-icon">{icon}</span>
                <div className="name-wrapper">
                  <h3 className="model-name">{m.name}</h3>
                  <code className="model-id">{m.id}</code>
                </div>
              </div>

              {activeAcc ? (
                <span className="status-pill active" title={`Active: ${activeAcc.accountName}`}>
                  ● ACTIVE
                </span>
              ) : accounts.length > 0 ? (
                <span className="status-pill inactive" title="Accounts configured but inactive">
                  ● INACTIVE
                </span>
              ) : (
                <span className="status-pill no-account" title="No accounts configured">
                  NO ACCOUNT
                </span>
              )}
            </div>

            <p className="card-description">
              {m.description || "Enterprise AI model supported by ModelConnector Platform."}
            </p>

            <div className="card-meta-row">
              <span className={`family-badge ${familyKey}`}>{m.family.toUpperCase()}</span>
              <span className={`tier-badge ${m.tier}`}>{m.tier.toUpperCase()}</span>
              {accounts.length > 0 && (
                <span className="accounts-badge">
                  🔑 {accounts.length} {accounts.length === 1 ? "Account" : "Accounts"}
                </span>
              )}
            </div>

            <div className="card-strategies-row">
              {m.supportedStrategies.map((s) => (
                <span key={s} className="strategy-tag">
                  {s.toUpperCase()}
                </span>
              ))}
            </div>

            <div className="card-footer-actions" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="btn-card-configure"
                onClick={() => onModelClick(m.id)}
                title="Open Save View (Configure Credentials)"
              >
                ⚙️ Configure
              </button>
              {onChatSelect && (
                <button
                  type="button"
                  className={`btn-card-chat ${isSelected ? "active" : ""}`}
                  onClick={() => onChatSelect(m.id)}
                  title="Select model and start chat"
                >
                  {isSelected ? "Selected 💬" : "Select & Chat"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

