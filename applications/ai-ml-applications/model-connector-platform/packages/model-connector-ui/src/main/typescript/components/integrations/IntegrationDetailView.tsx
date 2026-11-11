import React from "react";
import type { UiAuditRecord, UiIntegration, UiModel, UiModelAccount } from "@/types/ui.types";
import { TimeComparisonFormatter } from "@/utils";
import { EmptyState, StatCard, StatCardGrid, StatusBadge, type BadgeTone } from "@/components/common";

export type IntegrationDetailTab = "overview" | "connections" | "capabilities" | "activity";

export interface IntegrationDetailViewProps {
  readonly model?: UiModel;
  readonly targetModelId: string;
  readonly customIntegration?: UiIntegration;
  readonly accounts: readonly UiModelAccount[];
  readonly auditLogs: readonly UiAuditRecord[];
  readonly activeTab: IntegrationDetailTab;
  readonly onTabChange: (tab: IntegrationDetailTab) => void;
  readonly onBack: () => void;
  readonly onAddConnection: () => void;
  readonly onEditAccount: (account: UiModelAccount) => void;
  readonly onTestAccount: (account: UiModelAccount) => void;
  readonly onDisconnectAccount: (account: UiModelAccount) => void;
  readonly testingAccountId: string | null;
  readonly onOpenModels: () => void;
  readonly onOpenTools: () => void;
  readonly canCreate?: boolean;
  readonly canUpdate?: boolean;
  readonly canDelete?: boolean;
  readonly onEditIntegration?: () => void;
  readonly onDeleteIntegration?: () => void;
  readonly protocolStudioSlot?: React.ReactNode;
}

const PROVIDER_DISPLAY: Record<string, { name: string; category: string; monogram: string }> = {
  gemini: { name: "Google Gemini", category: "AI Model Providers", monogram: "G" },
  claude: { name: "Anthropic", category: "AI Model Providers", monogram: "A" },
  chatgpt: { name: "OpenAI", category: "AI Model Providers", monogram: "O" },
  openai: { name: "OpenAI", category: "AI Model Providers", monogram: "O" },
  grok: { name: "xAI Grok", category: "AI Model Providers", monogram: "X" },
  copilot: { name: "GitHub Copilot", category: "AI Coding Assistants", monogram: "C" },
  ollama: { name: "Ollama Local", category: "Local Runtime Providers", monogram: "OL" },
  comfyui: { name: "ComfyUI", category: "AI Workflow Platforms", monogram: "CF" },
};

const FAMILY_CAPABILITIES: Record<string, readonly string[]> = {
  gemini: ["Text", "Vision", "Tool Use", "Streaming", "Web Grounding"],
  claude: ["Text", "Vision", "Tool Use", "Extended Thinking"],
  openai: ["Text", "Vision", "Tool Use", "Structured Output"],
  chatgpt: ["Text", "Vision", "Tool Use", "Structured Output"],
  grok: ["Text", "Reasoning", "Real-Time Context"],
  copilot: ["Code Completion", "Agentic Chat", "Tool Use"],
  ollama: ["Local Inference", "Air-Gapped Privacy", "CLI & REST"],
  comfyui: ["Visual Node Pipelines", "Image Synthesis", "Custom Endpoints"],
};

const AUTH_PROTOCOL_LABELS: Record<string, string> = {
  api: "REST Key",
  api_key: "API Key",
  rest: "REST Key",
  rest_key: "REST Key",
  cli: "CLI",
  cli_oauth: "CLI OAuth",
  oauth: "OAuth",
  cookie: "Cookie Vault",
};

function formatAuthStrategies(strategies?: readonly string[]): string {
  if (!strategies || strategies.length === 0) return "";
  return Array.from(
    new Set(strategies.map((s) => AUTH_PROTOCOL_LABELS[s.toLowerCase()] || s.toUpperCase())),
  ).join(", ");
}

function resolveSelectedProtocols(
  accounts: readonly UiModelAccount[],
  customIntegration?: UiIntegration,
): readonly string[] {
  const accountProtocols = accounts
    .map((acc) => acc.authMethod || acc.authType)
    .filter((value): value is string => Boolean(value));

  const rawSelected =
    accountProtocols.length > 0
      ? accountProtocols
      : customIntegration && customIntegration.supportedProtocols.length > 0
        ? customIntegration.supportedProtocols
        : [];

  return Array.from(
    new Set(rawSelected.map((s) => AUTH_PROTOCOL_LABELS[s.toLowerCase()] || s.toUpperCase())),
  );
}

function resolveIntegrationStatus(
  model: UiModel | undefined,
  accounts: readonly UiModelAccount[],
): { label: string; tone: BadgeTone } {
  const hasActive = accounts.some((a) => a.isActive);
  if (model?.status === "DEPRECATED") {
    return { label: "Attention Required", tone: "warning" };
  }
  if (hasActive) {
    return { label: "Connected", tone: "success" };
  }
  if (accounts.length > 0) {
    return { label: "Attention Required", tone: "warning" };
  }
  return { label: "Not Connected", tone: "neutral" };
}

export const IntegrationDetailView: React.FC<IntegrationDetailViewProps> = ({
  model,
  targetModelId,
  customIntegration,
  accounts,
  auditLogs,
  activeTab,
  onTabChange,
  onBack,
  onAddConnection,
  onEditAccount,
  onTestAccount,
  onDisconnectAccount,
  testingAccountId,
  onOpenModels,
  onOpenTools,
  canCreate = true,
  canUpdate = true,
  canDelete = true,
  onEditIntegration,
  onDeleteIntegration,
  protocolStudioSlot,
}) => {
  const fam = (model?.family || customIntegration?.integrationId || targetModelId.split("-")[0] || "gemini").toLowerCase();
  const meta = PROVIDER_DISPLAY[fam];
  const displayName = customIntegration?.providerName || meta?.name || model?.name || targetModelId;
  const categoryLabel = customIntegration?.category || meta?.category || "AI Model Providers";
  const monogram =
    customIntegration?.providerShortCode || meta?.monogram || displayName.slice(0, 2).toUpperCase();
  const description =
    customIntegration?.description ||
    model?.description ||
    `Integrate ${displayName} models for advanced reasoning and AI workflows.`;

  const statusInfo = resolveIntegrationStatus(model, accounts);
  const activeAccountsCount = accounts.filter((a) => a.isActive).length;
  const selectedProtocols = resolveSelectedProtocols(accounts, customIntegration);
  const capabilities =
    customIntegration && customIntegration.capabilities.length > 0
      ? customIntegration.capabilities
      : FAMILY_CAPABILITIES[fam] || ["Text", "Tool Use", "Streaming"];
  const isRegistered = accounts.length > 0 || model?.status === "ACTIVE";

  const modelLogs = auditLogs.filter(
    (l) => l.modelUsed === targetModelId || l.modelUsed?.toLowerCase().includes(fam),
  );
  const latestTs = modelLogs[0]?.timestamp ? Date.parse(modelLogs[0].timestamp) : NaN;
  const latestLogTime = Number.isFinite(latestTs)
    ? TimeComparisonFormatter.formatRelative(latestTs, "Never")
    : "Never";

  return (
    <div className="integration-detail-view page-stack" data-testid="integration-detail-view">
      {/* 1. Detail Header */}
      <div className="integration-detail-topbar">
        <div className="detail-topbar-left">
          <div className="detail-title-row">
            <button
              type="button"
              className="btn-back-arrow breadcrumb-link"
              onClick={onBack}
              title="Back to Integration Hub"
              aria-label="Back to Integration Hub"
            >
              ←
            </button>
            <h1 className="detail-provider-title">{displayName}</h1>
            <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
          </div>
          <p className="detail-subtitle">Integration configuration and capability management</p>
        </div>

        {(customIntegration && (onEditIntegration || onDeleteIntegration)) && (
          <div className="integration-detail-actions">
            {onEditIntegration && (
              <button
                type="button"
                className="btn-ui-secondary btn-sm"
                onClick={onEditIntegration}
                disabled={!canUpdate}
                title={canUpdate ? "Edit integration configuration" : "RBAC: Missing integrations:update permission"}
                data-testid="btn-edit-integration"
              >
                ✏️ Edit Integration
              </button>
            )}
            {onDeleteIntegration && (
              <button
                type="button"
                className="btn-ghost-danger btn-sm"
                onClick={onDeleteIntegration}
                disabled={!canDelete}
                title={canDelete ? "Delete custom integration" : "RBAC: Missing integrations:delete permission"}
                data-testid="btn-delete-integration"
              >
                🗑️ Delete Integration
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Hero Provider Card & 4-Tab Bar */}
      <section className="integration-hero-card ui-surface-card">
        <div className="hero-top-row">
          <div className="hero-identity">
            <div className={`hero-avatar tone-${fam}`} aria-hidden="true">
              {monogram}
            </div>
            <div className="hero-text-block">
              <h2 className="hero-title">{displayName}</h2>
              <span className="hero-category">{categoryLabel}</span>
              <p className="hero-description">{description}</p>
            </div>
          </div>

          <StatusBadge
            label={isRegistered ? "Provider registered" : "Available"}
            tone={isRegistered ? "success" : "info"}
            className="hero-registered-badge"
          />
        </div>

        <div className="hero-tabs-divider" />

        <nav className="integration-detail-tabs" role="tablist" aria-label="Integration Detail Tabs">
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "connections", label: "Connections" },
              { id: "capabilities", label: "Capabilities" },
              { id: "activity", label: "Activity" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`detail-tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </section>

      {/* 3. Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="detail-tab-panel page-stack">
          <StatCardGrid>
            <StatCard
              label="Active Connections"
              value={activeAccountsCount}
              subtitle={`${accounts.length} configured`}
              icon="🔌"
              tone="primary"
              onClick={() => onTabChange("connections")}
            />
            <StatCard
              label="Selected Auth"
              value={selectedProtocols.length}
              subtitle={
                selectedProtocols.length > 0
                  ? selectedProtocols.join(" · ")
                  : "None selected"
              }
              icon="🛡️"
              tone="info"
              onClick={() => onTabChange("connections")}
            />
            <StatCard
              label="Capabilities"
              value={capabilities.length}
              subtitle="Supported features"
              icon="🗂️"
              tone="neutral"
              onClick={() => onTabChange("capabilities")}
            />
            <StatCard
              label="Last Verification"
              value={latestLogTime}
              subtitle={
                modelLogs.length > 0
                  ? `${modelLogs.length} checks recorded`
                  : "No verification runs"
              }
              icon="✅"
              tone={modelLogs.length > 0 ? "success" : "neutral"}
              onClick={() => onTabChange("activity")}
            />
          </StatCardGrid>

          <section className="provider-info-card ui-surface-card">
            <div className="info-card-header">
              <h3 className="info-card-title">Operational Overview</h3>
              {accounts.length === 0 && (
                <button
                  type="button"
                  className="btn-ui-dark btn-sm"
                  onClick={onAddConnection}
                  disabled={!canCreate}
                  title={
                    canCreate
                      ? "Add and bind an authentication account"
                      : "RBAC: Missing integrations:create permission"
                  }
                >
                  {canCreate ? "+ Add Account" : "Read-Only"}
                </button>
              )}
            </div>

            <div className="info-details-grid">
              <div className="info-detail-cell">
                <span className="detail-cell-label">Connection Health</span>
                <div className="detail-cell-value">
                  <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
                </div>
              </div>

              <div className="info-detail-cell">
                <span className="detail-cell-label">Target Model ID</span>
                <div className="detail-cell-value">
                  <code>{targetModelId}</code>
                </div>
              </div>

              <div className="info-detail-cell">
                <span className="detail-cell-label">Last Verification</span>
                <div className="detail-cell-value">{latestLogTime}</div>
              </div>

              <div className="info-detail-cell span-full">
                <span className="detail-cell-label">Selected Authentication</span>
                <div className="detail-cell-pills">
                  {selectedProtocols.length > 0 ? (
                    selectedProtocols.map((proto) => (
                      <span key={proto} className="detail-proto-pill">
                        {proto}
                      </span>
                    ))
                  ) : (
                    <span className="detail-empty-hint">
                      None selected — configure an account in Connections to enable a protocol.
                    </span>
                  )}
                </div>
              </div>

              <div className="info-detail-cell span-full">
                <span className="detail-cell-label">Capabilities</span>
                <div className="detail-cell-pills">
                  {capabilities.map((cap) => (
                    <span key={cap} className="detail-cap-pill">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* 4. Tab 2: Connections */}
      {activeTab === "connections" && (
        <div className="detail-tab-panel page-stack">
          <section className="configured-accounts-card ui-surface-card">
            <div className="configured-accounts-header">
              <h3>Configured Accounts</h3>
              <button
                type="button"
                className="btn-ui-dark btn-sm"
                onClick={onAddConnection}
                disabled={!canCreate}
                title={canCreate ? "Add connection account" : "RBAC: Missing integrations:create permission"}
                data-testid="btn-add-account"
              >
                {canCreate ? "+ Add Account" : "🔒 + Add Account"}
              </button>
            </div>

            {accounts.length === 0 ? (
              <EmptyState
                icon="🔌"
                title="No Connections Configured"
                description={`Add an API Key, OAuth, CLI, or Cookie connection for ${displayName}.`}
                action={
                  <button
                    type="button"
                    className="btn-ui-dark"
                    onClick={onAddConnection}
                    disabled={!canCreate}
                    title={canCreate ? "Add connection account" : "RBAC: Missing integrations:create permission"}
                  >
                    {canCreate ? "+ Add Account" : "🔒 + Add Account (Read-Only)"}
                  </button>
                }
              />
            ) : (
              <div className="configured-accounts-list">
                {accounts.map((acc) => {
                  const cleanAccountName = acc.accountName
                    .replace(new RegExp(`\\s*\\(?${acc.userEmail}\\)?`, "gi"), "")
                    .replace(/\s*\([^)]*@[^)]*\)/g, "")
                    .trim() || acc.accountName;

                  return (
                    <div key={acc.accountId} className="configured-account-row">
                      <div className="account-row-info">
                        <div className="account-row-name">{cleanAccountName}</div>
                        <div className="account-row-meta">
                          <span>{acc.userEmail || "Engineering"}</span>
                          <span>•</span>
                          <span>{acc.modelId}</span>
                          <span>•</span>
                          <span>{formatAuthStrategies([acc.authType])}</span>
                        </div>
                      </div>

                      <div className="account-row-actions">
                        <StatusBadge
                          label={acc.isActive ? "Connected" : "Inactive"}
                          tone={acc.isActive ? "success" : "neutral"}
                        />
                        <button
                          type="button"
                          className="btn-ui-secondary btn-sm"
                          onClick={() => onTestAccount(acc)}
                          disabled={testingAccountId === acc.accountId || !canUpdate}
                          title={canUpdate ? "Verify account connection" : "RBAC: Missing integrations:update permission"}
                        >
                          {testingAccountId === acc.accountId ? "Testing..." : "Test"}
                        </button>
                        <button
                          type="button"
                          className="btn-ui-secondary btn-sm"
                          onClick={() => onEditAccount(acc)}
                          disabled={!canUpdate}
                          title={canUpdate ? "Edit account settings" : "RBAC: Missing integrations:update permission"}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-ghost-danger btn-sm"
                          onClick={() => onDisconnectAccount(acc)}
                          disabled={!canDelete}
                          title={canDelete ? "Disconnect account" : "RBAC: Missing integrations:delete permission"}
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {protocolStudioSlot}
        </div>
      )}

      {/* 5. Tab 3: Capabilities */}
      {activeTab === "capabilities" && (
        <div className="detail-tab-panel page-stack">
          <section className="capabilities-card ui-surface-card">
            <h3 className="info-card-title">Discovered capabilities</h3>
            <ul className="capabilities-check-list">
              {capabilities.map((cap) => (
                <li key={cap} className="capability-item">
                  <span className="capability-check" aria-hidden="true">
                    ✓
                  </span>
                  <span>{cap}</span>
                </li>
              ))}
            </ul>

            <div className="capabilities-links-list">
              <div className="capability-link-row">
                <span className="link-row-label">Models</span>
                <button
                  type="button"
                  className="btn-ui-secondary btn-sm"
                  onClick={onOpenModels}
                >
                  Open Model Registry
                </button>
              </div>
              <div className="capability-link-row">
                <span className="link-row-label">Tools</span>
                <button
                  type="button"
                  className="btn-ui-secondary btn-sm"
                  onClick={onOpenTools}
                >
                  Open Tool Registry
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* 6. Tab 4: Activity */}
      {activeTab === "activity" && (
        <div className="detail-tab-panel page-stack">
          <section className="ui-surface-card">
            <h3 className="info-card-title">Recent Integration Activity</h3>
            {modelLogs.length === 0 ? (
              <EmptyState
                icon="📡"
                title="No Activity Recorded"
                description={`Test or run inference with ${displayName} to inspect verification logs here.`}
              />
            ) : (
              <div className="telemetry-table-wrapper">
                <table className="desktop-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Model</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelLogs.slice(0, 10).map((log) => (
                      <tr key={log.id}>
                        <td className="font-mono col-strong">{log.action || "VERIFY"}</td>
                        <td>{log.modelUsed}</td>
                        <td>
                          <StatusBadge
                            label={log.status}
                            tone={log.status === "SUCCESS" || log.status === "VERIFIED" ? "success" : "danger"}
                            showDot
                          />
                        </td>
                        <td>{log.latencyMs}ms</td>
                        <td>
                          {Number.isFinite(Date.parse(log.timestamp))
                            ? TimeComparisonFormatter.formatRelative(Date.parse(log.timestamp), "Just now")
                            : "Just now"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
