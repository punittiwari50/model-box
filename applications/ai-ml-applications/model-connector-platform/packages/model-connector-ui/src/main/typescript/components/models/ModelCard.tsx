import React from "react";
import type { UiModel } from "@/types/ui.types";

interface ModelCardProps {
  readonly model: UiModel;
  readonly isSelected: boolean;
  readonly onSelect: (modelId: string) => void;
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

export const ModelCard: React.FC<ModelCardProps> = ({ model, isSelected, onSelect }) => {
  const familyKey = model.family.toLowerCase();
  const icon = CATEGORY_ICONS[familyKey] || "◈";

  return (
    <div
      className={`glass-panel model-card cat-${familyKey} ${isSelected ? "selected" : ""}`}
      style={{
        borderLeftWidth: "4px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div>
          <h3 style={{ fontSize: "1.05rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>{icon}</span> {model.name}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className={`family-badge ${familyKey}`}>
              {model.family}
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
              • {model.tier}
            </span>
          </div>
        </div>

        <span
          className="glass-pill"
          style={{
            padding: "3px 8px",
            fontSize: "0.7rem",
            color: model.status === "ACTIVE" ? "#34d399" : "#fbbf24",
            borderColor: model.status === "ACTIVE" ? "rgba(52, 211, 153, 0.3)" : "rgba(251, 191, 36, 0.3)",
          }}
        >
          {model.status}
        </span>
      </div>

      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: "10px 0" }}>
        {model.description || "Enterprise AI model supported by ModelConnector Platform."}
      </p>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {model.supportedStrategies.map((s) => (
            <span key={s} className={`strategy-badge badge-${s}`}>{s}</span>
          ))}
        </div>

        <button
          onClick={() => onSelect(model.id)}
          className="send-btn"
          style={{
            width: "100%",
            justifyContent: "center",
            background: isSelected ? "linear-gradient(135deg, #10b981, #06b6d4)" : undefined,
          }}
        >
          {isSelected ? "Selected Model 💬" : "Select Model"}
        </button>
      </div>
    </div>
  );
};
