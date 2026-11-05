import React from "react";
import type { UiModel, UiModelAccount } from "@/types/ui.types";

export interface ModelCardGridProps {
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

export const ModelCardGrid: React.FC<ModelCardGridProps> = ({
  models,
  modelAccounts,
  selectedModelId,
  onModelClick,
  onChatSelect,
}) => {
  if (models.length === 0) {
    return (
      <div className="view-empty-state">
        <span className="empty-icon">📂</span>
        <h3>No Models Found</h3>
        <p>No model configurations match your current filter or search criteria.</p>
      </div>
    );
  }

  return (
    <div className="model-card-grid" data-testid="model-card-grid">
      {models.map((m) => {
        const familyKey = m.family.toLowerCase();
        const icon = CATEGORY_ICONS[familyKey] || "◈";
        const accounts = modelAccounts.filter((a) => a.modelId === m.id);
        const activeAcc = accounts.find((a) => a.isActive);
        const isSelected = selectedModelId === m.id;

        return (
          <div
            key={m.id}
            className={`model-card-item odoo-model-card group-${familyKey} ${isSelected ? "selected" : ""}`}
            onClick={() => onModelClick(m.id)}
            data-testid={`model-card-${m.id}`}
            title={`Click to open Save View for ${m.name}`}
          >
            <div className="card-top-row">
              <div className="card-identity">
                <span className="provider-icon">{icon}</span>
                <div className="name-wrapper">
                  <h4 className="model-name">{m.name}</h4>
                  <span className="model-slug">{m.id}</span>
                </div>
              </div>
              <span className={`family-badge badge-${familyKey}`}>
                {m.family.toUpperCase()}
              </span>
            </div>

            <p className="card-description">
              {m.description || `Enterprise ${m.name} model supporting inference and chat streaming.`}
            </p>

            <div className="card-meta-row">
              <span className="tier-pill">{m.tier || "ENTERPRISE"}</span>
              <div className="strategies-badges">
                {m.supportedStrategies.map((strat) => (
                  <span key={strat} className="strategy-tag">
                    {strat.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            <div className="card-footer-row">
              <div className="status-indicator">
                <span className={`status-dot ${m.status.toLowerCase()}`} />
                <span className="status-text">
                  {m.status === "ACTIVE"
                    ? "ACTIVE"
                    : activeAcc
                    ? "CONFIGURED"
                    : "NO ACCOUNT"}
                </span>
              </div>

              <div className="card-actions">
                {accounts.length > 0 && (
                  <span className="accounts-count-badge" title="Configured accounts count">
                    🔑 {accounts.length} Account{accounts.length > 1 ? "s" : ""}
                  </span>
                )}
                {onChatSelect && (
                  <button
                    type="button"
                    className="btn-card-chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChatSelect(m.id);
                    }}
                    title="Launch chat with this model"
                  >
                    💬 Chat
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

