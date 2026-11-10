import React, { useMemo } from "react";
import type { UiModel, UiModelAccount } from "@/types/ui.types";
import { ResourceCard, StatusBadge, EmptyState, type BadgeTone } from "@/components/common";

export interface ModelCardGridProps {
  readonly models: readonly UiModel[];
  readonly modelAccounts: readonly UiModelAccount[];
  readonly selectedModelId: string;
  readonly onModelClick: (modelId: string) => void;
  readonly onChatSelect?: (modelId: string) => void;
  readonly onManageAccountsClick?: (modelId: string, modelName: string) => void;
}

interface CatalogCardItem {
  readonly id: string;
  readonly targetModelId: string;
  readonly cardTitle: string;
  readonly categorySubtitle: string;
  readonly tag: string;
  readonly monogram: string;
  readonly familyKey: string;
  readonly description: string;
  readonly tier: string;
  readonly supportedStrategies: readonly string[];
  readonly statusLabel: string;
  readonly statusTone: BadgeTone;
  readonly accountCount: number;
  readonly isSelected: boolean;
}

const PROVIDER_META: Record<string, { name: string; subtitle: string; monogram: string }> = {
  gemini: { name: "Google Gemini", subtitle: "AI Model Providers", monogram: "G" },
  claude: { name: "Anthropic Claude", subtitle: "AI Model Providers", monogram: "A" },
  chatgpt: { name: "OpenAI ChatGPT", subtitle: "AI Model Providers", monogram: "O" },
  openai: { name: "OpenAI ChatGPT", subtitle: "AI Model Providers", monogram: "O" },
  grok: { name: "xAI Grok", subtitle: "AI Model Providers", monogram: "X" },
  copilot: { name: "GitHub Copilot", subtitle: "AI Coding Assistants", monogram: "C" },
  ollama: { name: "Ollama Local", subtitle: "Local Runtime Providers", monogram: "OL" },
  comfyui: { name: "ComfyUI", subtitle: "AI Workflow Platforms", monogram: "CF" },
};

function resolveStatusInfo(model: UiModel, activeAcc?: UiModelAccount): {
  label: string;
  tone: BadgeTone;
} {
  if (activeAcc) {
    return { label: "Connected", tone: "success" };
  }
  if (model.status === "ACTIVE") {
    return { label: "Available", tone: "info" };
  }
  if (model.status === "DEPRECATED") {
    return { label: "Attention Required", tone: "warning" };
  }
  return { label: "Not Connected", tone: "neutral" };
}

export const ModelCardGrid: React.FC<ModelCardGridProps> = ({
  models,
  modelAccounts,
  selectedModelId,
  onModelClick,
  onChatSelect,
  onManageAccountsClick,
}) => {
  const cardItems = useMemo<CatalogCardItem[]>(() => {
    const items: CatalogCardItem[] = [];
    const groupedCloudProviders = new Set<string>();

    for (const m of models) {
      const fam = m.family.toLowerCase();
      const isLocalExecution = fam.includes("ollama") || fam.includes("comfyui");

      if (isLocalExecution) {
        const accounts = modelAccounts.filter((a) => a.modelId === m.id);
        const activeAcc = accounts.find((a) => a.isActive);
        const providerTag = fam.includes("comfyui") ? "COMFYUI" : "OLLAMA";
        const meta = PROVIDER_META[fam.includes("comfyui") ? "comfyui" : "ollama"];
        const statusInfo = resolveStatusInfo(m, activeAcc);

        items.push({
          id: m.id,
          targetModelId: m.id,
          cardTitle: m.name,
          categorySubtitle: meta.subtitle,
          tag: providerTag,
          monogram: meta.monogram,
          familyKey: fam,
          description: m.description || `Local inference model executed via ${providerTag}.`,
          tier: m.tier || "freeware",
          supportedStrategies: m.supportedStrategies,
          statusLabel: statusInfo.label,
          statusTone: statusInfo.tone,
          accountCount: accounts.length,
          isSelected: selectedModelId === m.id,
        });
      } else {
        if (groupedCloudProviders.has(fam)) {
          continue;
        }
        groupedCloudProviders.add(fam);

        const modelsInFamily = models.filter((item) => item.family.toLowerCase() === fam);
        const primaryModel = modelsInFamily[0];
        const meta = PROVIDER_META[fam];
        const providerName = meta?.name || primaryModel.name.split(" ")[0] || fam.toUpperCase();
        const familyAccounts = modelAccounts.filter((a) =>
          modelsInFamily.some((mod) => mod.id === a.modelId),
        );
        const activeAcc = familyAccounts.find((a) => a.isActive);
        const statusInfo = resolveStatusInfo(primaryModel, activeAcc);

        items.push({
          id: primaryModel.id,
          targetModelId: primaryModel.id,
          cardTitle: providerName,
          categorySubtitle: meta?.subtitle || "AI Model Providers",
          tag: fam.toUpperCase(),
          monogram: meta?.monogram || providerName.slice(0, 2).toUpperCase(),
          familyKey: fam,
          description:
            primaryModel.description ||
            `${providerName} enterprise multi-modal reasoning (${modelsInFamily.length} models).`,
          tier: fam.includes("gemini") ? "paid" : primaryModel.tier || "paid",
          supportedStrategies: primaryModel.supportedStrategies,
          statusLabel: statusInfo.label,
          statusTone: statusInfo.tone,
          accountCount: familyAccounts.length,
          isSelected: modelsInFamily.some((mod) => mod.id === selectedModelId),
        });
      }
    }

    return items;
  }, [models, modelAccounts, selectedModelId]);

  if (cardItems.length === 0) {
    return (
      <EmptyState
        title="No Models Found"
        description="No model configurations match your current filter or search criteria."
      />
    );
  }

  return (
    <div className="model-card-grid" data-testid="model-card-grid">
      {cardItems.map((item) => {
        const authSummary = item.supportedStrategies.map((s) => s.toUpperCase()).join(", ");
        return (
          <ResourceCard
            key={item.id}
            icon={item.monogram}
            iconTone={item.familyKey}
            title={item.cardTitle}
            subtitle={item.categorySubtitle}
            topRightSlot={
              <StatusBadge
                label={item.isSelected ? "★ Active" : item.tag}
                tone={item.isSelected ? "primary" : "neutral"}
              />
            }
            description={item.description}
            statusSlot={<StatusBadge label={item.statusLabel} tone={item.statusTone} showDot />}
            metaText={`${item.accountCount} ${item.accountCount === 1 ? "connection" : "connections"}`}
            footerLeft={<span className="auth-summary">Auth: {authSummary || "API"}</span>}
            footerActions={
              <>
                <button
                  type="button"
                  className="btn-ui-secondary btn-sm"
                  onClick={() =>
                    onManageAccountsClick
                      ? onManageAccountsClick(item.targetModelId, item.cardTitle)
                      : onModelClick(item.targetModelId)
                  }
                  title={`Inspect or configure ${item.cardTitle}`}
                >
                  Details
                </button>
                {onChatSelect && (
                  <button
                    type="button"
                    className="btn-ui-dark btn-sm btn-card-chat"
                    onClick={() => onChatSelect(item.targetModelId)}
                    title={`Launch chat with ${item.cardTitle}`}
                  >
                    {item.accountCount > 0 ? "Manage" : "Connect"}
                  </button>
                )}
              </>
            }
            accentClass={`group-${item.familyKey}`}
            selected={item.isSelected}
            onClick={() => onModelClick(item.targetModelId)}
            testId={`model-card-${item.id}`}
            titleTooltip={`Click to open configuration for ${item.cardTitle}`}
          />
        );
      })}
    </div>
  );
};
