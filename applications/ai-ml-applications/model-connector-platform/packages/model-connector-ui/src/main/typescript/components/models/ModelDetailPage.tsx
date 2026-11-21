import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { UiModel, UiModelAccount, UiModelOAuthConfig, UiOAuthExchangeResult, TestConnectionResult } from "@/types/ui.types";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { ApiService } from "@/utils/services/apiService";
import { oauthProviderRegistry } from "@/utils/services/oauthProviderRegistry";
import { StatusBadge, type BadgeTone } from "@/components/common";
import { DeleteRecordModal } from "@/components/common/DeleteRecordModal";

export interface ModelDetailPageProps {
  readonly modelId: string;
  readonly modelName: string;
  readonly state: ModelConnectorState;
  readonly onBack: () => void;
  readonly onChatSelect?: (modelId: string) => void;
  readonly onAccountChange?: () => void;
}

const extractCleanAuthCode = (input: string): string => {
  if (!input) return "";
  const trimmed = input.trim();
  const match = trimmed.match(/(4\/[a-zA-Z0-9_\-]+)/);
  return match ? match[1] : trimmed;
};

export const ModelDetailPage: React.FC<ModelDetailPageProps> = ({
  modelId,
  modelName,
  state,
  onBack,
  onChatSelect,
  onAccountChange,
}) => {
  const [accounts, setAccounts] = useState<UiModelAccount[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<UiModelAccount | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [formAccountName, setFormAccountName] = useState<string>("");
  const [formUserEmail, setFormUserEmail] = useState<string>("");
  const [formAuthType, setFormAuthType] = useState<"api_key" | "cookie" | "cli_oauth" | "api" | "cli" | "oauth">("cli_oauth");
  const [formCredentialValue, setFormCredentialValue] = useState<string>("");
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [manualAuthInput, setManualAuthInput] = useState<string>("");
  const [isVerifyingManual, setIsVerifyingManual] = useState<boolean>(false);
  const [showToken, setShowToken] = useState<boolean>(false);

  // Connection testing states
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [accountTestResults, setAccountTestResults] = useState<Record<string, TestConnectionResult>>({});

  // Model & strategy lookup
  const model = useMemo<UiModel | undefined>(
    () => state.models.find((m) => m.id === modelId),
    [state.models, modelId],
  );

  const matchedStrategy = useMemo(
    () => oauthProviderRegistry.findStrategyForModel(modelId),
    [modelId],
  );

  const [oauthConfig, setOauthConfig] = useState<UiModelOAuthConfig | null>(null);
  const [_oauthSession, setOauthSession] = useState<UiOAuthExchangeResult | null>(null);

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await ApiService.fetchModelAccounts(modelId);
      setAccounts(data);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setIsLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // Load OAuth Config
  useEffect(() => {
    ApiService.fetchModelOAuthConfig(modelId)
      .then((cfg) => {
        setOauthConfig(cfg);
      })
      .catch(() => {
        const defaultScopes = matchedStrategy.defaultScopes.split(" ").filter(Boolean);
        setOauthConfig({
          modelId,
          provider: matchedStrategy.id,
          providerName: matchedStrategy.name,
          providerIcon: matchedStrategy.icon,
          authorizationEndpoint: matchedStrategy.authUrl,
          tokenEndpoint: matchedStrategy.tokenUrl,
          cliCommand: matchedStrategy.cliCommand,
          defaultScopes,
          defaultClientId: matchedStrategy.defaultClientId,
          redirectUri: matchedStrategy.defaultRedirectUri,
          authorizationUrl: matchedStrategy.authUrl,
          defaultRedirectUri: matchedStrategy.defaultRedirectUri,
          accountCategory: matchedStrategy.accountCategory,
          structuredParams: {
            clientId: matchedStrategy.defaultClientId,
            redirectUri: matchedStrategy.defaultRedirectUri,
            scopes: defaultScopes,
            state: `app=modelbox-studio&provider=${matchedStrategy.id}`,
            responseType: "code",
            accessType: "offline",
            prompt: "select_account consent",
          },
        });
      });
  }, [modelId, matchedStrategy]);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.isActive),
    [accounts],
  );

  const handleSetActive = async (accountId: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await ApiService.activateModelAccount(modelId, accountId);
      setSuccessMessage("Active account updated successfully.");
      await loadAccounts();
      await state.refreshModelAccounts();
      onAccountChange?.();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to activate account");
    }
  };

  const handleTestAccount = async (acc: UiModelAccount) => {
    setTestingAccountId(acc.accountId);
    try {
      const res = await ApiService.testModelConnection({
        modelId: acc.modelId || modelId,
        authType: acc.authType,
        credentialValue: acc.credentialValue,
        config: acc.config,
        sessionId: `sess-${(acc.modelId || modelId).replace(/[^a-zA-Z0-9]/g, "-")}`,
      });
      setAccountTestResults((prev) => ({ ...prev, [acc.accountId]: res }));

      if (res.status === "VERIFIED") {
        await ApiService.activateModelAccount(modelId, acc.accountId);
        setSuccessMessage(`✔ Verification & test passed: Account '${acc.accountName}' is now ACTIVE.`);
        await loadAccounts();
        await state.refreshModelAccounts();
        onAccountChange?.();
      } else {
        setErrorMessage(`⚠️ Verification Failed (${res.errorMessage || "Test failure"}): Account '${acc.accountName}' did not pass.`);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Test execution failed");
    } finally {
      setTestingAccountId(null);
    }
  };

  const handleOpenNewAccountForm = () => {
    setEditingAccountId(null);
    setFormAccountName(`${matchedStrategy.name} Account`);
    setFormUserEmail("");
    setFormAuthType(matchedStrategy.id === "ollama" ? "api" : "cli_oauth");
    setFormCredentialValue("");
    setFormIsActive(accounts.length === 0);
    setOauthSession(null);
    setManualAuthInput("");
    setIsFormOpen(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleEditAccount = (acc: UiModelAccount) => {
    setEditingAccountId(acc.accountId);
    setFormAccountName(acc.accountName);
    setFormUserEmail(acc.userEmail);
    setFormAuthType(acc.authType);
    setFormCredentialValue(acc.credentialValue || "");
    setFormIsActive(acc.isActive);
    setManualAuthInput("");
    setIsFormOpen(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleDeleteConfirmed = async () => {
    if (!accountToDelete) return;
    setIsDeleting(true);
    try {
      await ApiService.deleteModelAccount(modelId, accountToDelete.accountId);
      setSuccessMessage(`Account '${accountToDelete.accountName}' deleted.`);
      setIsDeleteModalOpen(false);
      setAccountToDelete(null);
      await loadAccounts();
      await state.refreshModelAccounts();
      onAccountChange?.();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBrowserSignIn = () => {
    const authUrl = oauthConfig?.authorizationUrl || matchedStrategy.authUrl;
    if (!authUrl) {
      setErrorMessage("OAuth authorization URL is not available. Please verify provider settings.");
      return;
    }
    window.open(authUrl, "_blank", "width=600,height=700");
  };

  const handleVerifyManualCode = async () => {
    const cleanCode = extractCleanAuthCode(manualAuthInput);
    if (!cleanCode) {
      setErrorMessage("Please paste a valid authorization code.");
      return;
    }
    setIsVerifyingManual(true);
    setErrorMessage(null);
    try {
      const res = await ApiService.verifyOAuthManual(modelId, cleanCode, formUserEmail);
      if (res?.session) {
        setOauthSession(res.session);
        setFormCredentialValue(res.session.accessToken);
        const verifiedEmail = res.session.userEmail || res.session.email;
        if (verifiedEmail) {
          setFormUserEmail(verifiedEmail);
          setFormAccountName(`${matchedStrategy.name} (${verifiedEmail})`);
        }
        setSuccessMessage("✔ OAuth code successfully verified and token captured!");
      } else {
        setErrorMessage(res?.message || "Failed to verify authorization code.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Manual verification failed");
    } finally {
      setIsVerifyingManual(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!formAccountName.trim()) {
      setErrorMessage("Account name is required.");
      return;
    }
    setErrorMessage(null);
    try {
      const credVal = formCredentialValue.trim();
      if (editingAccountId) {
        await ApiService.updateModelAccount(modelId, editingAccountId, {
          accountName: formAccountName.trim(),
          userEmail: formUserEmail.trim() || "<user-email>",
          authType: formAuthType,
          credentialValue: credVal,
          isActive: formIsActive,
        });
        setSuccessMessage("Account updated successfully.");
      } else {
        await ApiService.createModelAccount(modelId, {
          accountName: formAccountName.trim(),
          userEmail: formUserEmail.trim() || "<user-email>",
          authType: formAuthType,
          credentialValue: credVal,
          isActive: formIsActive,
        });
        setSuccessMessage("Account registered successfully.");
      }
      setIsFormOpen(false);
      await loadAccounts();
      await state.refreshModelAccounts();
      onAccountChange?.();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save account");
    }
  };

  const statusTone: BadgeTone = activeAccount ? "success" : "neutral";

  return (
    <div className="model-detail-page page-stack" data-testid="model-detail-page" style={{ padding: "1.5rem", maxWidth: "1280px", margin: "0 auto" }}>
      {/* Top Breadcrumb & Navigation */}
      <div className="detail-top-nav" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <button
          type="button"
          className="btn-ui-secondary btn-sm"
          onClick={onBack}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <span>←</span> Back to Models Catalog
        </button>

        <div className="top-nav-actions" style={{ display: "flex", gap: "8px" }}>
          {onChatSelect && (
            <button
              type="button"
              className="btn-ui-dark btn-sm"
              onClick={() => onChatSelect(modelId)}
            >
              💬 Chat with Model
            </button>
          )}
          <button
            type="button"
            className="btn-ui-secondary btn-sm"
            onClick={() => void loadAccounts()}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Model Header Banner */}
      <div className="model-header-banner card" style={{ padding: "1.5rem", borderRadius: "12px", background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e2e8f0)", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div
              className={`provider-avatar group-${matchedStrategy.id}`}
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "1.25rem",
                background: "var(--primary-light, #eff6ff)",
                color: "var(--primary, #2563eb)",
              }}
            >
              {matchedStrategy.icon || matchedStrategy.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>{modelName || model?.name || modelId}</h2>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px", flexWrap: "wrap" }}>
                <code style={{ fontSize: "0.8rem", color: "#64748b" }}>{modelId}</code>
                <StatusBadge label={(model?.family || matchedStrategy.id).toUpperCase()} tone="neutral" />
                <StatusBadge label={model?.tier?.toUpperCase() || "ENTERPRISE"} tone="info" />
                <StatusBadge label={activeAccount ? "Connected" : "Not Connected"} tone={statusTone} showDot />
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn-ui-primary btn-sm"
            onClick={handleOpenNewAccountForm}
          >
            + Connect New Account
          </button>
        </div>

        {model?.description && (
          <p style={{ marginTop: "1rem", marginBottom: 0, color: "#475569", fontSize: "0.95rem" }}>
            {model.description}
          </p>
        )}
      </div>

      {/* Global Notifications */}
      {errorMessage && (
        <div className="alert alert-danger" style={{ padding: "0.75rem 1rem", borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", marginBottom: "1.25rem" }}>
          <span>⚠️ {errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="alert alert-success" style={{ padding: "0.75rem 1rem", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", marginBottom: "1.25rem" }}>
          <span>{successMessage}</span>
        </div>
      )}

      {/* Grid: Specifications & Configured Accounts */}
      <div className="detail-sections-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
        {/* Model Specifications Card */}
        <div className="card spec-card" style={{ padding: "1.25rem", borderRadius: "10px", background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e2e8f0)" }}>
          <h4 style={{ margin: "0 0 1rem 0", fontSize: "1.05rem", fontWeight: 600 }}>Architecture &amp; Specifications</h4>
          <div className="spec-table" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.88rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Provider Engine:</span>
              <strong>{matchedStrategy.name}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Default CLI Executable:</span>
              <code style={{ fontSize: "0.8rem" }}>{matchedStrategy.cliCommand}</code>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>API Base Endpoint:</span>
              <span style={{ maxWidth: "200px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={matchedStrategy.resolveCliDefaults(modelId).apiBaseUrl}>
                {matchedStrategy.resolveCliDefaults(modelId).apiBaseUrl}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Supported Auth:</span>
              <span>{(model?.supportedStrategies || ["API", "CLI"]).map((s) => s.toUpperCase()).join(", ")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Context Window Limit:</span>
              <strong>1,000,000 tokens</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Max Output Tokens:</span>
              <strong>8,192 tokens</strong>
            </div>
          </div>
        </div>

        {/* Configured Accounts Card */}
        <div className="card accounts-card" style={{ padding: "1.25rem", borderRadius: "10px", background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e2e8f0)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
              Configured Accounts ({accounts.length})
            </h4>
            <button
              type="button"
              className="btn-ui-secondary btn-xs"
              onClick={handleOpenNewAccountForm}
            >
              + Add
            </button>
          </div>

          {isLoading ? (
            <div style={{ textAlign: "center", padding: "1.5rem", color: "#64748b" }}>Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "1.5rem", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
              <p style={{ margin: "0 0 0.5rem 0", color: "#64748b", fontSize: "0.9rem" }}>No accounts configured for this model.</p>
              <button
                type="button"
                className="btn-ui-primary btn-xs"
                onClick={handleOpenNewAccountForm}
              >
                + Connect Account
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {accounts.map((acc) => {
                const isTestingThis = testingAccountId === acc.accountId;
                const testResultForAcc = accountTestResults[acc.accountId];

                return (
                  <div
                    key={acc.accountId}
                    className="account-item-card"
                    style={{
                      padding: "0.85rem",
                      borderRadius: "8px",
                      background: acc.isActive ? "#f0fdf4" : "#f8fafc",
                      border: `1px solid ${acc.isActive ? "#bbf7d0" : "#e2e8f0"}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong>{acc.accountName}</strong>
                        <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{acc.userEmail}</div>
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <StatusBadge label={acc.authType?.toUpperCase() || "CLI"} tone="neutral" />
                        {acc.isActive ? (
                          <StatusBadge label="ACTIVE ⭐" tone="success" />
                        ) : (
                          <button
                            type="button"
                            className="btn-ui-secondary btn-xs"
                            onClick={() => void handleSetActive(acc.accountId)}
                            title="Set as active inference account"
                          >
                            Set Active
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginTop: "4px" }}>
                      <button
                        type="button"
                        className="btn-ui-secondary btn-xs"
                        disabled={isTestingThis}
                        onClick={() => void handleTestAccount(acc)}
                      >
                        {isTestingThis ? "Testing..." : "🧪 Test"}
                      </button>
                      <button
                        type="button"
                        className="btn-ui-secondary btn-xs"
                        onClick={() => handleEditAccount(acc)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ui-secondary btn-xs"
                        style={{ color: "#dc2626" }}
                        onClick={() => {
                          setAccountToDelete(acc);
                          setIsDeleteModalOpen(true);
                        }}
                      >
                        🗑️
                      </button>
                    </div>

                    {testResultForAcc && (
                      <div
                        style={{
                          marginTop: "4px",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          fontSize: "0.78rem",
                          background: testResultForAcc.status === "VERIFIED" ? "#dcfce7" : "#fee2e2",
                          color: testResultForAcc.status === "VERIFIED" ? "#166534" : "#991b1b",
                        }}
                      >
                        {testResultForAcc.status === "VERIFIED"
                          ? `✔ Verified in ${testResultForAcc.latencyMs || 0}ms`
                          : `⚠️ ${testResultForAcc.errorMessage || "Connection failed"}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Account Setup / Registration Section (Rendered when form is open) */}
      {isFormOpen && (
        <div className="card account-form-card" style={{ padding: "1.5rem", borderRadius: "10px", background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e2e8f0)", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
              {editingAccountId ? "Edit Account Configuration" : "Connect New Account / Credential"}
            </h3>
            <button
              type="button"
              className="btn-ui-secondary btn-xs"
              onClick={() => setIsFormOpen(false)}
            >
              ✕ Close
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
            <div className="form-group">
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 500, fontSize: "0.88rem" }}>Account Name</label>
              <input
                type="text"
                className="form-input"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={formAccountName}
                onChange={(e) => setFormAccountName(e.target.value)}
                placeholder="e.g. Production Antigravity CLI"
              />
            </div>

            <div className="form-group">
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 500, fontSize: "0.88rem" }}>Owner Email</label>
              <input
                type="email"
                className="form-input"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={formUserEmail}
                onChange={(e) => setFormUserEmail(e.target.value)}
                placeholder="e.g. name@company.com"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: 500, fontSize: "0.88rem" }}>Authentication Protocol</label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {(["cli_oauth", "api_key", "cookie"] as const).map((proto) => (
                <label
                  key={proto}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: `1px solid ${formAuthType === proto ? "#2563eb" : "#cbd5e1"}`,
                    background: formAuthType === proto ? "#eff6ff" : "#ffffff",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: formAuthType === proto ? 600 : 400,
                  }}
                >
                  <input
                    type="radio"
                    name="formAuthType"
                    checked={formAuthType === proto}
                    onChange={() => setFormAuthType(proto)}
                  />
                  {proto === "cli_oauth" && "OAuth 2.0 PKCE / CLI"}
                  {proto === "api_key" && "API Key"}
                  {proto === "cookie" && "Session Cookie"}
                </label>
              ))}
            </div>
          </div>

          {/* OAuth 2.0 PKCE Flow */}
          {formAuthType === "cli_oauth" && (
            <div style={{ padding: "1rem", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: "1.25rem" }}>
              <h5 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem" }}>Step 1: Provider Browser Consent</h5>
              <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "#64748b" }}>
                Click below to open the official provider login portal. Once approved, copy and paste the authorization code.
              </p>
              <button
                type="button"
                className="btn-ui-primary btn-sm"
                onClick={handleBrowserSignIn}
                style={{ marginBottom: "1rem" }}
              >
                🌐 Browser Sign-In
              </button>

              <h5 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem" }}>Step 2: Authorization Code Verification</h5>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontFamily: "monospace" }}
                  value={manualAuthInput}
                  onChange={(e) => setManualAuthInput(e.target.value)}
                  placeholder="Paste authorization code (e.g. 4/0AUn6...)"
                />
                <button
                  type="button"
                  className="btn-ui-secondary btn-sm"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      setManualAuthInput(text);
                    } catch {}
                  }}
                >
                  📋 Paste
                </button>
                <button
                  type="button"
                  className="btn-ui-dark btn-sm"
                  disabled={isVerifyingManual || !manualAuthInput.trim()}
                  onClick={void handleVerifyManualCode}
                >
                  {isVerifyingManual ? "Verifying..." : "✔ Verify & Save"}
                </button>
              </div>
            </div>
          )}

          {/* Direct Credential Input for API Key or Cookie */}
          {formAuthType !== "cli_oauth" && (
            <div className="form-group" style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 500, fontSize: "0.88rem" }}>
                {formAuthType === "api_key" ? "API Key Secret" : "Cookie Header Value"}
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type={showToken ? "text" : "password"}
                  className="form-input"
                  style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontFamily: "monospace" }}
                  value={formCredentialValue}
                  onChange={(e) => setFormCredentialValue(e.target.value)}
                  placeholder={formAuthType === "api_key" ? "sk-..." : "__session=..."}
                />
                <button
                  type="button"
                  className="btn-ui-secondary btn-sm"
                  onClick={() => setShowToken((prev) => !prev)}
                >
                  {showToken ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "1rem" }}>
            <button
              type="button"
              className="btn-ui-secondary"
              onClick={() => setIsFormOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-ui-primary"
              onClick={void handleSaveAccount}
            >
              Save Account Configuration
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && accountToDelete && (
        <DeleteRecordModal
          isOpen={isDeleteModalOpen}
          account={accountToDelete}
          isDeleting={isDeleting}
          onConfirm={handleDeleteConfirmed}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setAccountToDelete(null);
          }}
        />
      )}
    </div>
  );
};
