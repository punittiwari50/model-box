import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { UiModelAccount, UiModelOAuthConfig, UiOAuthExchangeResult, TestConnectionResult } from "@/types/ui.types";
import { ApiService } from "@/utils/services/apiService";
import { oauthProviderRegistry } from "@/utils/services/oauthProviderRegistry";
import { ProviderId } from "@/constants/providerConfigConstants";
import { DeleteRecordModal } from "@/components/common/DeleteRecordModal";

interface ModelAccountsModalProps {
  readonly modelId: string;
  readonly modelName: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onAccountChange?: () => void;
}

export const ModelAccountsModal: React.FC<ModelAccountsModalProps> = ({
  modelId,
  modelName,
  isOpen,
  onClose,
  onAccountChange,
}) => {
  const [accounts, setAccounts] = useState<UiModelAccount[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<UiModelAccount | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

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
    if (isOpen) {
      void loadAccounts();
    }
  }, [isOpen, loadAccounts]);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [formAccountName, setFormAccountName] = useState<string>("");
  const [formUserEmail, setFormUserEmail] = useState<string>("");
  const [formAuthType, setFormAuthType] = useState<"api_key" | "cookie" | "cli_oauth" | "api" | "cli" | "oauth">("api_key");
  const [formCredentialValue, setFormCredentialValue] = useState<string>("");
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formCustomLocation, setFormCustomLocation] = useState<string>("");

  // Model-specific OAuth states
  const [oauthConfig, setOauthConfig] = useState<UiModelOAuthConfig | null>(null);
  const [oauthSession, setOauthSession] = useState<UiOAuthExchangeResult | null>(null);
  const [isRedirecting, setIsRedirecting] = useState<boolean>(false);
  const [isExchanging, setIsExchanging] = useState<boolean>(false);
  const [showToken, setShowToken] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Custom & Structured OAuth Parameters
  const [providerClientIdOverride, setProviderClientIdOverride] = useState<string>("");
  const [providerRedirectUriOverride, setProviderRedirectUriOverride] = useState<string>("");
  const [providerScopesOverride, setProviderScopesOverride] = useState<string>("");
  const [showAdvancedParams, setShowAdvancedParams] = useState<boolean>(false);
  const [accountCategory, setAccountCategory] = useState<"individual" | "enterprise">("individual");

  // Manual OAuth verification & callback listener states
  const [manualAuthInput, setManualAuthInput] = useState<string>("");
  const [isVerifyingManual, setIsVerifyingManual] = useState<boolean>(false);
  const [isWaitingForCallback, setIsWaitingForCallback] = useState<boolean>(false);
  const [testPrompt, setTestPrompt] = useState<string>("Hi , whats date time now ?");

  // Connection testing states
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [accountTestResults, setAccountTestResults] = useState<Record<string, TestConnectionResult>>({});

  // Dynamic Strategy resolution based on selected model
  const matchedStrategy = useMemo(
    () => oauthProviderRegistry.findStrategyForModel(modelId),
    [modelId],
  );

  // Cross-window postMessage listener from OAuth callback page
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (
        event.data?.type === "MODELBOX_OAUTH_SUCCESS" ||
        event.data?.type === "OAUTH_CALLBACK_SUCCESS"
      ) {
        const accessToken = event.data.accessToken || event.data.token;
        const refreshToken = event.data.refreshToken || "rt_token";
        const userEmail = event.data.userEmail || event.data.email || formUserEmail;
        const userName =
          event.data.userName || (userEmail ? userEmail.split("@")[0] : "CLI Authorized");
        const provider = event.data.provider || oauthConfig?.provider || matchedStrategy.id;
        const providerLabel = oauthConfig?.providerName || matchedStrategy.name;

        if (accessToken) {
          setOauthSession({
            accessToken,
            refreshToken,
            tokenType: "Bearer",
            expiresInSeconds: 3600,
            scopes: ["openid", "profile", "email"],
            userEmail,
            provider,
            authorizedTimestamp: new Date().toISOString(),
          });
          setFormCredentialValue(accessToken);
          if (userEmail) setFormUserEmail(userEmail);
          setFormAccountName(`${providerLabel} (${userEmail || userName})`);
          setIsWaitingForCallback(false);
          setIsFormOpen(false);
          await loadAccounts();
          onAccountChange?.();
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [formUserEmail, loadAccounts, onAccountChange, oauthConfig, matchedStrategy]);

  // Periodic polling hook when browser OAuth window is opened
  useEffect(() => {
    if (!isWaitingForCallback) return;
    const interval = setInterval(async () => {
      try {
        const res = await ApiService.fetchLatestOAuthCallback(modelId);
        const session = res?.accessToken ? res : (res?.session || res?.callback);
        if (session?.accessToken) {
          const userEmail = session.userEmail || session.email || formUserEmail;
          const providerLabel = oauthConfig?.providerName || matchedStrategy.name;
          setOauthSession({
            accessToken: session.accessToken,
            refreshToken: session.refreshToken || "rt_token",
            tokenType: "Bearer",
            expiresInSeconds: 3600,
            scopes: ["openid", "profile", "email"],
            userEmail,
            provider: session.provider || oauthConfig?.provider || matchedStrategy.id,
            authorizedTimestamp: new Date().toISOString(),
          });
          setFormCredentialValue(session.accessToken);
          if (userEmail) setFormUserEmail(userEmail);
          setFormAccountName(`${providerLabel} (${userEmail || session.userName || "CLI Authorized"})`);
          setIsWaitingForCallback(false);
          setIsFormOpen(false);
          await loadAccounts();
          onAccountChange?.();
        }
      } catch {
        // Continue polling loop
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [isWaitingForCallback, modelId, formUserEmail, loadAccounts, onAccountChange, oauthConfig, matchedStrategy]);

  // Load model-specific OAuth config dynamically whenever OAuth authType is active
  useEffect(() => {
    if (formAuthType === "cli_oauth" || formAuthType === "oauth") {
      ApiService.fetchModelOAuthConfig(modelId)
        .then((cfg) => {
          setOauthConfig(cfg);
          if (cfg.accountCategory) {
            setAccountCategory(cfg.accountCategory);
          }
          setProviderClientIdOverride(cfg.defaultClientId);
          setProviderRedirectUriOverride(cfg.redirectUri);
          setProviderScopesOverride(cfg.defaultScopes.join(" "));
        })
        .catch(() => {
          const strategy = oauthProviderRegistry.findStrategyForModel(modelId);
          const defaultScopes = strategy.defaultScopes.split(" ").filter(Boolean);
          const authUrl = strategy.buildAuthorizationUrl({
            clientId: strategy.defaultClientId,
            redirectUri: strategy.defaultRedirectUri,
            scopes: strategy.defaultScopes,
            modelId: modelId,
          });

          const fallbackConfig: UiModelOAuthConfig = {
            modelId,
            provider: strategy.id,
            providerName: strategy.name,
            providerIcon: strategy.icon,
            authorizationEndpoint: strategy.authUrl,
            tokenEndpoint: strategy.tokenUrl,
            cliCommand: strategy.cliCommand,
            defaultScopes,
            defaultClientId: strategy.defaultClientId,
            redirectUri: strategy.defaultRedirectUri,
            authorizationUrl: authUrl,
            defaultRedirectUri: strategy.defaultRedirectUri,
            accountCategory: strategy.accountCategory,
            structuredParams: {
              clientId: strategy.defaultClientId,
              redirectUri: strategy.defaultRedirectUri,
              scopes: defaultScopes,
              state: "app=modelbox-studio&provider=" + strategy.id,
              responseType: "code",
              accessType: "offline",
              prompt: "select_account consent",
            },
          };
          setOauthConfig(fallbackConfig);
          setAccountCategory(strategy.accountCategory);
          setProviderClientIdOverride(strategy.defaultClientId);
          setProviderRedirectUriOverride(strategy.defaultRedirectUri);
          setProviderScopesOverride(strategy.defaultScopes);
        });
    }
  }, [formAuthType, modelId]);

  // Derived effective values & structured URL computation
  const effectiveClientId = useMemo(
    () => providerClientIdOverride.trim() || oauthConfig?.defaultClientId || matchedStrategy.defaultClientId || "",
    [providerClientIdOverride, oauthConfig?.defaultClientId, matchedStrategy.defaultClientId],
  );

  const effectiveRedirectUri = useMemo(
    () => providerRedirectUriOverride.trim() || oauthConfig?.redirectUri || matchedStrategy.defaultRedirectUri,
    [providerRedirectUriOverride, oauthConfig?.redirectUri, matchedStrategy.defaultRedirectUri],
  );

  const effectiveScopes = useMemo(
    () => providerScopesOverride.trim() || oauthConfig?.defaultScopes.join(" ") || matchedStrategy.defaultScopes,
    [providerScopesOverride, oauthConfig?.defaultScopes, matchedStrategy.defaultScopes],
  );

  const effectiveEndpoint = oauthConfig?.authorizationEndpoint || matchedStrategy.authUrl;
  const effectiveProvider = oauthConfig?.provider || matchedStrategy.id;

  const structuredStatePayload = useMemo(
    () => {
      const returnUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}`
          : "http://localhost:3005";
      return new URLSearchParams({
        app: "modelbox-studio",
        provider: effectiveProvider,
        model: modelId,
        flow: "cli_oauth",
        nonce: "pkce_" + modelId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8),
        ts: Date.now().toString(),
        returnUrl,
      }).toString();
    },
    [effectiveProvider, modelId],
  );

  const activeAuthorizationUrl = useMemo(() => {
    if (!effectiveClientId || effectiveClientId.trim().length === 0) {
      return "";
    }
    const params = new URLSearchParams();
    params.set("client_id", effectiveClientId);
    params.set("redirect_uri", effectiveRedirectUri);
    params.set("response_type", "code");
    params.set("scope", effectiveScopes);
    params.set("state", structuredStatePayload);
    params.set("access_type", "offline");
    params.set("prompt", "select_account consent");
    if (effectiveProvider === ProviderId.GOOGLE) {
      params.set("include_granted_scopes", "true");
    }
    return `${effectiveEndpoint}?${params.toString()}`;
  }, [
    effectiveClientId,
    effectiveRedirectUri,
    effectiveScopes,
    structuredStatePayload,
    effectiveEndpoint,
    effectiveProvider,
    matchedStrategy,
    modelId,
    formUserEmail,
  ]);

  if (!isOpen) return null;

  const handleOpenAddForm = () => {
    setEditingAccountId(null);
    setFormAccountName("");
    setFormUserEmail("");
    setFormAuthType("api_key");
    setFormCredentialValue("");
    setFormCustomLocation("");
    setFormIsActive(accounts.length === 0);
    setOauthSession(null);
    setShowToken(false);
    setTestResult(null);
    setIsFormOpen(true);
    setErrorMessage(null);
  };

  const handleOpenEditForm = (acc: UiModelAccount) => {
    setEditingAccountId(acc.accountId);
    setFormAccountName(acc.accountName);
    setFormUserEmail(acc.userEmail);
    setFormAuthType(acc.authType);
    setFormCredentialValue(acc.credentialValue || "");
    setFormCustomLocation(acc.customLocation || acc.config?.customLocation || "");
    setFormIsActive(acc.isActive);
    setTestResult(null);
    if (acc.authType === "cli_oauth" || acc.authType === "oauth") {
      setOauthSession({
        accessToken: acc.credentialValue || "",
        refreshToken: "",
        tokenType: "Bearer",
        expiresInSeconds: 3600,
        scopes: ["openid", "profile", "email"],
        userEmail: acc.userEmail,
        provider: oauthConfig?.provider || matchedStrategy.id,
        authorizedTimestamp: new Date().toISOString(),
      });
    } else {
      setOauthSession(null);
    }
    setShowToken(false);
    setIsFormOpen(true);
    setErrorMessage(null);
  };

  const handleRedirectToOAuth = () => {
    if (!activeAuthorizationUrl) {
      setErrorMessage(
        "OAuth redirect requires a valid OAuth Client ID. Configure Client ID in Advanced OAuth settings, then retry.",
      );
      return;
    }
    setIsRedirecting(true);
    setIsWaitingForCallback(true);
    window.open(activeAuthorizationUrl, "_blank");
    setTimeout(() => setIsRedirecting(false), 2000);
  };

  const handleVerifyManualAuth = async () => {
    if (!manualAuthInput.trim()) return;
    setIsVerifyingManual(true);
    setErrorMessage(null);
    try {
      const res = await ApiService.verifyOAuthManual(modelId, manualAuthInput.trim(), formUserEmail);
      if (res?.session) {
        setOauthSession(res.session);
        setFormCredentialValue(res.session.accessToken);
        const verifiedEmail = res.session.userEmail || res.session.email;
        if (verifiedEmail) {
          setFormUserEmail(verifiedEmail);
          setFormAccountName(`${oauthConfig?.providerName || matchedStrategy.name} (${verifiedEmail})`);
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Manual verification failed");
    } finally {
      setIsVerifyingManual(false);
    }
  };

  const handleVerifyOAuthHandshake = async () => {
    setIsExchanging(true);
    setErrorMessage(null);
    setTestResult(null);
    try {
      const token = oauthSession?.accessToken || formCredentialValue;
      if (!token || token.trim().length === 0) {
        setErrorMessage("No OAuth token found. Complete provider sign-in first.");
        return;
      }
      const result = await ApiService.testModelConnection({
        modelId,
        authType: formAuthType,
        credentialValue: token,
        prompt: testPrompt || "Hi , whats date time now ?",
      });
      setTestResult(result);
      if (result.status !== "VERIFIED") {
        setErrorMessage(result.errorMessage || result.message);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "OAuth handshake verification failed");
    } finally {
      setIsExchanging(false);
    }
  };

  const handleDisconnectOAuth = () => {
    setOauthSession(null);
    setFormCredentialValue("");
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleTestCurrentInput = async () => {
    setIsTesting(true);
    setTestResult(null);
    setErrorMessage(null);
    try {
      const credVal =
        formAuthType === "cli_oauth" || formAuthType === "oauth"
          ? oauthSession?.accessToken || formCredentialValue
          : formCredentialValue;

      const oauthConfigPayload =
        (formAuthType === "cli_oauth" || formAuthType === "oauth") && oauthConfig
          ? {
              oauthClientId: effectiveClientId,
              oauthTokenUrl: oauthConfig.tokenEndpoint,
              oauthAuthUrl: activeAuthorizationUrl,
              oauthScopes: effectiveScopes,
              cliExecutable: oauthConfig.cliCommand,
            }
          : undefined;

      const res = await ApiService.testModelConnection({
        modelId,
        authType: formAuthType,
        credentialValue: credVal,
        prompt: testPrompt || "Hi , whats date time now ?",
        config: oauthConfigPayload,
      });
      setTestResult(res);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to execute connection verification");
    } finally {
      setIsTesting(false);
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
      });
      setAccountTestResults((prev) => ({ ...prev, [acc.accountId]: res }));

      if (res.status === "FAILED") {
        if (acc.isActive) {
          await ApiService.deactivateModelAccount(modelId, acc.accountId);
          setErrorMessage(
            `⚠️ Verification Failed (401/Invalid Credential): Account '${acc.accountName}' was automatically set to INACTIVE.`,
          );
          await loadAccounts();
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (acc.isActive) {
        try {
          await ApiService.deactivateModelAccount(modelId, acc.accountId);
          await loadAccounts();
        } catch {}
      }
      setErrorMessage(
        `⚠️ Verification Error (401 Unauthorized): Account '${acc.accountName}' failed authentication and was converted to INACTIVE.`,
      );
      setAccountTestResults((prev) => ({
        ...prev,
        [acc.accountId]: {
          status: "FAILED",
          protocol: acc.authType,
          message: "Connection verification failed",
          latencyMs: 0,
          errorMessage: errMsg,
          details: {},
        },
      }));
    } finally {
      setTestingAccountId(null);
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAccountName.trim() || !formUserEmail.trim()) {
      setErrorMessage("Account name and user email are required");
      return;
    }

    if (!editingAccountId && !formCredentialValue.trim()) {
      if (formAuthType === "cli_oauth" || formAuthType === "oauth") {
        setErrorMessage("Please complete the OAuth redirect and handshake before saving.");
      } else {
        setErrorMessage("Credential value is required for new accounts");
      }
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const oauthConfigPayload =
      (formAuthType === "cli_oauth" || formAuthType === "oauth") && oauthConfig
        ? {
            oauthClientId: effectiveClientId,
            oauthTokenUrl: oauthConfig.tokenEndpoint,
            oauthAuthUrl: activeAuthorizationUrl,
            oauthScopes: effectiveScopes,
            cliExecutable: oauthConfig.cliCommand,
            customLocation: formCustomLocation.trim() || undefined,
            authMethod: modelId.toLowerCase().includes("gemini") ? "sign_in_with_google" : undefined,
          }
        : undefined;

    try {
      if (editingAccountId) {
        await ApiService.updateModelAccount(modelId, editingAccountId, {
          accountName: formAccountName.trim(),
          userEmail: formUserEmail.trim(),
          authType: formAuthType,
          credentialValue: formCredentialValue.trim() ? formCredentialValue.trim() : undefined,
          isActive: formIsActive,
          config: oauthConfigPayload,
        });
      } else {
        await ApiService.createModelAccount(modelId, {
          accountName: formAccountName.trim(),
          userEmail: formUserEmail.trim(),
          authType: formAuthType,
          credentialValue: formCredentialValue.trim(),
          isActive: formIsActive,
          config: oauthConfigPayload,
        });
      }
      setIsFormOpen(false);
      setEditingAccountId(null);
      await loadAccounts();
      onAccountChange?.();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivate = async (accountId: string) => {
    setIsLoading(true);
    try {
      await ApiService.activateModelAccount(modelId, accountId);
      await loadAccounts();
      onAccountChange?.();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to activate account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = async (accountId: string) => {
    setIsLoading(true);
    try {
      await ApiService.deactivateModelAccount(modelId, accountId);
      await loadAccounts();
      onAccountChange?.();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to deactivate account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDelete = (acc: UiModelAccount) => {
    setAccountToDelete(acc);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!accountToDelete) return;
    setIsDeleting(true);
    try {
      await ApiService.deleteModelAccount(modelId, accountToDelete.accountId);
      await loadAccounts();
      onAccountChange?.();
      setIsDeleteModalOpen(false);
      setAccountToDelete(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "680px",
          background: "#121826",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
          overflow: "hidden",
          color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.2rem" }}>🔑</span>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Manage Accounts & Credentials
              </h3>
            </div>
            <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "4px" }}>
              Model: <strong style={{ color: "#38bdf8" }}>{modelName}</strong> (
              <span className="font-mono">{modelId}</span>)
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "1.3rem",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div
            style={{
              padding: "10px 24px",
              background: "rgba(239, 68, 68, 0.15)",
              borderBottom: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              fontSize: "0.85rem",
            }}
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Content body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {!isFormOpen ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <span style={{ fontSize: "0.88rem", color: "#94a3b8" }}>
                  Configured Accounts ({accounts.length})
                </span>
                <button
                  onClick={handleOpenAddForm}
                  style={{
                    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    padding: "6px 14px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Add Account / Token
                </button>
              </div>

              {isLoading && accounts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                  Loading credentials...
                </div>
              ) : accounts.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 20px",
                    border: "1px dashed rgba(255, 255, 255, 0.12)",
                    borderRadius: "12px",
                    background: "rgba(0, 0, 0, 0.2)",
                  }}
                >
                  <p style={{ margin: "0 0 12px 0", color: "#94a3b8", fontSize: "0.9rem" }}>
                    No user accounts or tokens configured yet for <strong>{modelId}</strong>.
                  </p>
                  <p style={{ margin: 0, color: "#64748b", fontSize: "0.8rem" }}>
                    Requests will use the default system environment variables until an account is
                    configured.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {accounts.map((acc) => (
                    <div
                      key={acc.accountId}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "10px",
                        background: acc.isActive
                          ? "rgba(37, 99, 235, 0.12)"
                          : "rgba(255, 255, 255, 0.03)",
                        border: acc.isActive
                          ? "1px solid rgba(37, 99, 235, 0.4)"
                          : "1px solid rgba(255, 255, 255, 0.06)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                            {acc.accountName}
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background:
                                acc.authType === "api_key"
                                  ? "rgba(59, 130, 246, 0.2)"
                                  : acc.authType === "cookie"
                                  ? "rgba(245, 158, 11, 0.2)"
                                  : "rgba(168, 85, 247, 0.2)",
                              color:
                                acc.authType === "api_key"
                                  ? "#60a5fa"
                                  : acc.authType === "cookie"
                                  ? "#fbbf24"
                                  : "#c084fc",
                            }}
                          >
                            {acc.authType.replace("_", " ")}
                          </span>
                          {acc.isActive ? (
                            <span
                              style={{
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: "100px",
                                background: "rgba(34, 197, 94, 0.2)",
                                color: "#4ade80",
                              }}
                            >
                              ACTIVE ✔
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: "100px",
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#fbbf24",
                              }}
                            >
                              INACTIVE
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "0.82rem",
                            color: "#94a3b8",
                            marginTop: "4px",
                            display: "flex",
                            gap: "12px",
                          }}
                        >
                          <span>📧 {acc.userEmail}</span>
                          <span className="font-mono" style={{ color: "#cbd5e1" }}>
                            🔑 {acc.maskedCredential || acc.credentialValue}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleTestAccount(acc)}
                          disabled={testingAccountId === acc.accountId}
                          style={{
                            background: "rgba(6, 182, 212, 0.15)",
                            border: "1px solid rgba(6, 182, 212, 0.35)",
                            color: "#67e8f9",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            cursor: testingAccountId === acc.accountId ? "not-allowed" : "pointer",
                            fontWeight: 600,
                          }}
                        >
                          {testingAccountId === acc.accountId ? "Testing..." : "🧪 Test Connection"}
                        </button>
                        {acc.isActive ? (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(acc.accountId)}
                            style={{
                              background: "rgba(239, 68, 68, 0.15)",
                              border: "1px solid rgba(239, 68, 68, 0.35)",
                              color: "#fca5a5",
                              borderRadius: "6px",
                              padding: "4px 10px",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                            title="Deactivate this account"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleActivate(acc.accountId)}
                            style={{
                              background: "rgba(34, 197, 94, 0.15)",
                              border: "1px solid rgba(34, 197, 94, 0.3)",
                              color: "#4ade80",
                              borderRadius: "6px",
                              padding: "4px 10px",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                            title="Activate this account as the primary credential"
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditForm(acc)}
                          style={{
                            background: "rgba(255, 255, 255, 0.08)",
                            border: "none",
                            color: "#cbd5e1",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleOpenDelete(acc)}
                          style={{
                            background: "rgba(239, 68, 68, 0.12)",
                            border: "none",
                            color: "#f87171",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </div>

                      {accountTestResults[acc.accountId] && (
                        <div
                          style={{
                            width: "100%",
                            marginTop: "8px",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            background:
                              accountTestResults[acc.accountId].status === "VERIFIED"
                                ? "rgba(16, 185, 129, 0.1)"
                                : "rgba(239, 68, 68, 0.1)",
                            border:
                              accountTestResults[acc.accountId].status === "VERIFIED"
                                ? "1px solid rgba(16, 185, 129, 0.35)"
                                : "1px solid rgba(239, 68, 68, 0.35)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background:
                                    accountTestResults[acc.accountId].status === "VERIFIED" ? "#10b981" : "#ef4444",
                                  color: "#fff",
                                }}
                              >
                                {accountTestResults[acc.accountId].status}
                              </span>
                              <span style={{ fontSize: "0.76rem", color: "#cbd5e1", fontWeight: 600 }}>
                                {accountTestResults[acc.accountId].protocol}
                              </span>
                            </div>
                            <span style={{ fontSize: "0.72rem", color: "#38bdf8", fontWeight: 600 }}>
                              ⏱ {accountTestResults[acc.accountId].latencyMs}ms
                            </span>
                          </div>

                          <div style={{ fontSize: "0.8rem", color: "#e2e8f0" }}>
                            {accountTestResults[acc.accountId].message}
                          </div>

                          {accountTestResults[acc.accountId].modelOutput && (
                            <div
                              style={{
                                background: "rgba(0, 0, 0, 0.4)",
                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                borderRadius: "6px",
                                padding: "8px 10px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                              }}
                            >
                              <div style={{ fontSize: "0.7rem", color: "#34d399", fontWeight: 700, textTransform: "uppercase" }}>
                                🤖 Model Output (Verified Handshake)
                              </div>
                              <div
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: "0.76rem",
                                  color: "#a7f3d0",
                                  lineHeight: 1.4,
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-all",
                                }}
                              >
                                {accountTestResults[acc.accountId].modelOutput}
                              </div>
                            </div>
                          )}

                          {accountTestResults[acc.accountId].errorMessage && (
                            <div
                              style={{
                                background: "rgba(239, 68, 68, 0.15)",
                                border: "1px solid rgba(239, 68, 68, 0.35)",
                                borderRadius: "6px",
                                padding: "8px 10px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                              }}
                            >
                              <div style={{ fontSize: "0.7rem", color: "#f87171", fontWeight: 700, textTransform: "uppercase" }}>
                                ⚠️ Error Message
                              </div>
                              <div style={{ fontSize: "0.78rem", color: "#fca5a5", lineHeight: 1.4 }}>
                                {accountTestResults[acc.accountId].errorMessage}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleSaveAccount}>
              <h4 style={{ margin: "0 0 16px 0", fontSize: "1rem" }}>
                {editingAccountId ? "Edit Account Credential" : "Add New Account / Credential"}
              </h4>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: "#94a3b8",
                      marginBottom: "4px",
                    }}
                  >
                    Account Label / Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Work Pro Key, Personal Workspace"
                    value={formAccountName}
                    onChange={(e) => setFormAccountName(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "rgba(0, 0, 0, 0.3)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "6px",
                      color: "#f8fafc",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: "#94a3b8",
                      marginBottom: "4px",
                    }}
                  >
                    User Email / Identity
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. engineer@enterprise.com"
                    value={formUserEmail}
                    onChange={(e) => setFormUserEmail(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "rgba(0, 0, 0, 0.3)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "6px",
                      color: "#f8fafc",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: "#94a3b8",
                      marginBottom: "4px",
                    }}
                  >
                    Authentication Type
                  </label>
                  <select
                    value={formAuthType}
                    onChange={(e) =>
                      setFormAuthType(e.target.value as "api_key" | "cookie" | "cli_oauth" | "cli")
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "#1e293b",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "6px",
                      color: "#f8fafc",
                      fontSize: "0.88rem",
                    }}
                  >
                    <option value="api_key">API Key (Token based)</option>
                    <option value="cli_oauth">CLI OAuth (Account profile)</option>
                    <option value="cli">CLI Binary (Local / Container CLI)</option>
                    <option value="cookie">Cookie Session (Header token)</option>
                  </select>
                </div>

                {formAuthType === "cli_oauth" || formAuthType === "oauth" ? (
                  /* Dedicated Model-Based OAuth Redirect & Handshake Flow */
                  <div
                    style={{
                      background: "rgba(15, 23, 42, 0.7)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      borderRadius: "10px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "1.2rem" }}>{oauthConfig?.providerIcon || matchedStrategy.icon || "✨"}</span>
                        <div>
                          <strong style={{ fontSize: "0.9rem", color: "#93c5fd" }}>
                            {oauthConfig?.providerName || matchedStrategy.name}
                          </strong>
                          <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                            Model-driven OAuth 2.0 PKCE redirection for <span style={{ color: "#38bdf8" }}>{modelId}</span>
                          </div>
                        </div>
                      </div>
                      {oauthSession && (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "100px",
                            background: "rgba(16, 185, 129, 0.2)",
                            color: "#6ee7b7",
                            border: "1px solid rgba(16, 185, 129, 0.4)",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              background: "#10b981",
                              boxShadow: "0 0 6px #10b981",
                            }}
                          />
                          AUTHORIZED
                        </span>
                      )}
                    </div>

                    {!oauthSession ? (
                      /* Authorization & Redirect Callout (Pre-handshake) */
                      <div
                        style={{
                          background: "rgba(30, 58, 138, 0.15)",
                          border: "1px solid rgba(59, 130, 246, 0.25)",
                          borderRadius: "8px",
                          padding: "12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "#cbd5e1", lineHeight: 1.45 }}>
                          CLI OAuth will redirect your browser to the provider authorization site to grant inference access for <strong>{modelName}</strong>.
                        </p>

                        {/* Account Category Selector (Individual vs Enterprise) */}
                        <div
                          style={{
                            background: "rgba(30, 41, 59, 0.7)",
                            border: "1px solid rgba(59, 130, 246, 0.3)",
                            borderRadius: "8px",
                            padding: "10px 14px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#93c5fd", textTransform: "uppercase" }}>
                              Account Authentication Mode ({matchedStrategy.name})
                            </span>
                            <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                              CLI & OAuth 2.0 PKCE
                            </span>
                          </div>

                          <div style={{ display: "flex", gap: "10px" }}>
                            <button
                              type="button"
                              onClick={() => setAccountCategory("individual")}
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                borderRadius: "6px",
                                border: accountCategory === "individual" ? "1px solid #3b82f6" : "1px solid rgba(255, 255, 255, 0.1)",
                                background: accountCategory === "individual" ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.04)",
                                color: accountCategory === "individual" ? "#93c5fd" : "#94a3b8",
                                cursor: "pointer",
                                textAlign: "left",
                                display: "flex",
                                flexDirection: "column",
                                gap: "2px",
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "6px" }}>
                                <span>👤</span>
                                <span>Individual Account (CLI)</span>
                              </div>
                              <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                                Direct personal account bearer authentication. No cloud project required.
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setAccountCategory("enterprise")}
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                borderRadius: "6px",
                                border: accountCategory === "enterprise" ? "1px solid #3b82f6" : "1px solid rgba(255, 255, 255, 0.1)",
                                background: accountCategory === "enterprise" ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.04)",
                                color: accountCategory === "enterprise" ? "#93c5fd" : "#94a3b8",
                                cursor: "pointer",
                                textAlign: "left",
                                display: "flex",
                                flexDirection: "column",
                                gap: "2px",
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "6px" }}>
                                <span>🏢</span>
                                <span>Enterprise Project (OAuth Web)</span>
                              </div>
                              <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                                Corporate consent flow with registered Client ID and Redirect URI.
                              </div>
                            </button>
                          </div>
                        </div>

                        {/* Structured OAuth Parameters Breakdown Card */}
                        <div
                          style={{
                            background: "rgba(15, 23, 42, 0.7)",
                            border: "1px solid rgba(59, 130, 246, 0.25)",
                            borderRadius: "8px",
                            padding: "10px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.72rem", color: "#93c5fd", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              Structured OAuth 2.0 Configuration
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <button
                                type="button"
                                onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                                style={{
                                  background: showAdvancedParams ? "rgba(59, 130, 246, 0.25)" : "rgba(255, 255, 255, 0.06)",
                                  border: "1px solid rgba(59, 130, 246, 0.3)",
                                  borderRadius: "4px",
                                  color: "#93c5fd",
                                  padding: "3px 8px",
                                  fontSize: "0.7rem",
                                  cursor: "pointer",
                                }}
                              >
                                {showAdvancedParams ? "▲ Hide Custom Parameters" : "⚙ Customize Parameters"}
                              </button>
                            </div>
                          </div>

                          {/* Quick Parameter Summary Rows */}
                          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", rowGap: "5px", columnGap: "8px", fontSize: "0.74rem" }}>
                            <span style={{ color: "#64748b", fontWeight: 600 }}>Client ID:</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                              <code style={{ color: "#38bdf8", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {effectiveClientId}
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopy(effectiveClientId, "clientId")}
                                style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.68rem" }}
                                title="Copy Client ID"
                              >
                                {copiedField === "clientId" ? "✔" : "📋"}
                              </button>
                            </div>

                            <span style={{ color: "#64748b", fontWeight: 600 }}>Redirect URI:</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                              <code style={{ color: "#a5b4fc", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {effectiveRedirectUri}
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopy(effectiveRedirectUri, "redirectUri")}
                                style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.68rem" }}
                                title="Copy Redirect URI"
                              >
                                {copiedField === "redirectUri" ? "✔" : "📋"}
                              </button>
                            </div>

                            <span style={{ color: "#64748b", fontWeight: 600 }}>Auth Endpoint:</span>
                            <code style={{ color: "#cbd5e1", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {effectiveEndpoint}
                            </code>

                            <span style={{ color: "#64748b", fontWeight: 600 }}>Structured State:</span>
                            <code style={{ color: "#facc15", fontFamily: "monospace", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {structuredStatePayload}
                            </code>
                          </div>

                          {/* Scope Badges */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" }}>
                            {effectiveScopes.split(" ").filter(Boolean).map((scope) => (
                              <span
                                key={scope}
                                style={{
                                  background: "rgba(59, 130, 246, 0.12)",
                                  border: "1px solid rgba(59, 130, 246, 0.25)",
                                  color: "#93c5fd",
                                  fontSize: "0.65rem",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  fontFamily: "monospace",
                                }}
                              >
                                {scope.includes("/") ? scope.split("/").pop() : scope}
                              </span>
                            ))}
                          </div>

                          {/* Collapsible Advanced Parameters Drawer */}
                          {showAdvancedParams && (
                            <div
                              style={{
                                marginTop: "6px",
                                paddingTop: "8px",
                                borderTop: "1px dashed rgba(255, 255, 255, 0.1)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                              }}
                            >
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <label style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Custom OAuth Client ID</label>
                                <input
                                  type="text"
                                  value={providerClientIdOverride}
                                  onChange={(e) => setProviderClientIdOverride(e.target.value)}
                                  placeholder={oauthConfig?.defaultClientId || matchedStrategy.defaultClientId || "Enter Client ID..."}
                                  style={{
                                    background: "rgba(0, 0, 0, 0.4)",
                                    border: "1px solid rgba(255, 255, 255, 0.12)",
                                    borderRadius: "4px",
                                    color: "#fff",
                                    padding: "5px 8px",
                                    fontSize: "0.74rem",
                                    fontFamily: "monospace",
                                  }}
                                />
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <label style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Custom Redirect URI</label>
                                <input
                                  type="text"
                                  value={providerRedirectUriOverride}
                                  onChange={(e) => setProviderRedirectUriOverride(e.target.value)}
                                  placeholder={oauthConfig?.redirectUri || matchedStrategy.defaultRedirectUri}
                                  style={{
                                    background: "rgba(0, 0, 0, 0.4)",
                                    border: "1px solid rgba(255, 255, 255, 0.12)",
                                    borderRadius: "4px",
                                    color: "#fff",
                                    padding: "5px 8px",
                                    fontSize: "0.74rem",
                                    fontFamily: "monospace",
                                  }}
                                />
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <label style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Custom Scopes (space-separated)</label>
                                <input
                                  type="text"
                                  value={providerScopesOverride}
                                  onChange={(e) => setProviderScopesOverride(e.target.value)}
                                  placeholder={oauthConfig?.defaultScopes.join(" ") || matchedStrategy.defaultScopes}
                                  style={{
                                    background: "rgba(0, 0, 0, 0.4)",
                                    border: "1px solid rgba(255, 255, 255, 0.12)",
                                    borderRadius: "4px",
                                    color: "#fff",
                                    padding: "5px 8px",
                                    fontSize: "0.74rem",
                                    fontFamily: "monospace",
                                  }}
                                />
                              </div>

                              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "2px" }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProviderClientIdOverride("");
                                    setProviderRedirectUriOverride("");
                                    setProviderScopesOverride("");
                                  }}
                                  style={{
                                    background: "rgba(255, 255, 255, 0.05)",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    borderRadius: "4px",
                                    color: "#cbd5e1",
                                    padding: "3px 8px",
                                    fontSize: "0.68rem",
                                    cursor: "pointer",
                                  }}
                                >
                                  ↺ Reset to Provider Defaults
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Computed Authorization URL Box */}
                        <div
                          style={{
                            background: "rgba(0, 0, 0, 0.55)",
                            border: "1px solid rgba(56, 189, 248, 0.2)",
                            borderRadius: "6px",
                            padding: "8px 10px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "5px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontSize: "0.68rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                              Authorization Redirect Endpoint (Verified & Structured)
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(activeAuthorizationUrl, "authUrl")}
                              style={{
                                background: "rgba(255, 255, 255, 0.08)",
                                border: "none",
                                borderRadius: "4px",
                                color: "#cbd5e1",
                                padding: "3px 8px",
                                fontSize: "0.72rem",
                                cursor: "pointer",
                              }}
                            >
                              {copiedField === "authUrl" ? "Copied! ✔" : "Copy URL"}
                            </button>
                          </div>
                          <a
                            href={activeAuthorizationUrl || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: "0.72rem",
                              color: "#38bdf8",
                              fontFamily: "monospace",
                              maxHeight: "52px",
                              overflowY: "auto",
                              wordBreak: "break-all",
                              lineHeight: 1.35,
                              textDecoration: "underline",
                              display: "block",
                            }}
                          >
                            {activeAuthorizationUrl || "Configure OAuth Client ID to generate a live provider authorization URL."}
                          </a>
                        </div>

                        {/* Actions Row */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={handleRedirectToOAuth}
                            disabled={isRedirecting || !activeAuthorizationUrl}
                            style={{
                              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                              border: "none",
                              borderRadius: "6px",
                              color: "#fff",
                              padding: "8px 16px",
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              opacity: isRedirecting || !activeAuthorizationUrl ? 0.65 : 1,
                              boxShadow: "0 2px 10px rgba(37, 99, 235, 0.4)",
                            }}
                          >
                            <span>🌐</span>
                            <span>{isRedirecting ? "Opening Browser..." : `Sign in with ${oauthConfig?.providerName || matchedStrategy.name} (OAuth 2.0 PKCE)`}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleVerifyOAuthHandshake}
                            disabled={isExchanging}
                            style={{
                              background: "rgba(16, 185, 129, 0.15)",
                              border: "1px solid rgba(16, 185, 129, 0.4)",
                              borderRadius: "6px",
                              color: "#6ee7b7",
                              padding: "8px 14px",
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {isExchanging ? "Verifying..." : "⚡ Complete & Verify OAuth Handshake"}
                          </button>
                        </div>

                        {/* Live Callback Listener Status */}
                        {isWaitingForCallback && (
                          <div
                            style={{
                              background: "rgba(37, 99, 235, 0.18)",
                              border: "1px dashed rgba(96, 165, 250, 0.5)",
                              borderRadius: "8px",
                              padding: "10px 14px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "10px",
                              animation: "pulse 2s infinite ease-in-out",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontSize: "1.1rem" }}>⏳</span>
                              <div>
                                <strong style={{ fontSize: "0.82rem", color: "#93c5fd", display: "block" }}>
                                  OAuth Consent Tab Opened
                                </strong>
                                <span style={{ fontSize: "0.72rem", color: "#cbd5e1" }}>
                                  Choose which {oauthConfig?.providerName || matchedStrategy.name} account to accept in the browser tab. Listening on port 8085 for callback...
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsWaitingForCallback(false)}
                              style={{
                                background: "rgba(255, 255, 255, 0.08)",
                                border: "none",
                                borderRadius: "4px",
                                color: "#94a3b8",
                                fontSize: "0.72rem",
                                padding: "4px 8px",
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {/* Manual Verification & URL Testing Section (Requirement 3) */}
                        <div
                          style={{
                            background: "rgba(15, 23, 42, 0.75)",
                            border: "1px dashed rgba(59, 130, 246, 0.35)",
                            borderRadius: "8px",
                            padding: "10px 14px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#93c5fd", textTransform: "uppercase" }}>
                              Manual Authentication Verification & URL Testing
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "#64748b" }}>
                              User Manual Testing
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <input
                              type="text"
                              value={manualAuthInput}
                              onChange={(e) => setManualAuthInput(e.target.value)}
                              placeholder="Paste redirect URL (http://localhost:8085/oauth2callback?code=...) or auth code"
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "rgba(0, 0, 0, 0.45)",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                borderRadius: "6px",
                                color: "#f8fafc",
                                fontSize: "0.78rem",
                                fontFamily: "monospace",
                              }}
                            />
                            <button
                              type="button"
                              onClick={handleVerifyManualAuth}
                              disabled={isVerifyingManual || !manualAuthInput.trim()}
                              style={{
                                padding: "6px 14px",
                                background: "linear-gradient(135deg, #0284c7, #0369a1)",
                                border: "none",
                                borderRadius: "6px",
                                color: "#fff",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                cursor: isVerifyingManual || !manualAuthInput.trim() ? "not-allowed" : "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {isVerifyingManual ? "Verifying..." : "⚡ Verify & Auto-Fill"}
                            </button>
                          </div>
                        </div>

                        {/* CLI Alternative Preview */}
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "#64748b",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginTop: "2px",
                          }}
                        >
                          <span>Terminal CLI Alternative:</span>
                          <code
                            style={{
                              color: "#facc15",
                              background: "rgba(0, 0, 0, 0.3)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            {oauthConfig?.cliCommand || "gemini auth login --browser"}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopy(oauthConfig?.cliCommand || "", "cliCmd")}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#94a3b8",
                              cursor: "pointer",
                              fontSize: "0.72rem",
                            }}
                          >
                            {copiedField === "cliCmd" ? "✔" : "📋"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Authenticated Session Vault (Rendered ONLY After OAuth Handshake) */
                      <div
                        style={{
                          background: "rgba(6, 78, 59, 0.2)",
                          border: "1px solid rgba(16, 185, 129, 0.35)",
                          borderRadius: "8px",
                          padding: "12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.8rem", color: "#6ee7b7", fontWeight: 600 }}>
                            ✔ Live OAuth Session Established for <strong>{oauthSession.userEmail}</strong>
                          </span>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <span
                              style={{
                                fontSize: "0.7rem",
                                color: "#93c5fd",
                                background: "rgba(59, 130, 246, 0.2)",
                                padding: "2px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              ⏱ {oauthSession.expiresInSeconds}s valid
                            </span>
                            <button
                              type="button"
                              onClick={handleDisconnectOAuth}
                              style={{
                                background: "rgba(239, 68, 68, 0.15)",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                color: "#fca5a5",
                                borderRadius: "4px",
                                padding: "2px 6px",
                                fontSize: "0.7rem",
                                cursor: "pointer",
                              }}
                            >
                              Disconnect
                            </button>
                          </div>
                        </div>

                        {/* Masked Bearer Token */}
                        <div>
                          <label style={{ display: "block", fontSize: "0.7rem", color: "#94a3b8", marginBottom: "3px" }}>
                            Bearer Access Token
                          </label>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <input
                              type={showToken ? "text" : "password"}
                              readOnly
                              value={oauthSession.accessToken}
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "rgba(0, 0, 0, 0.4)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "4px",
                                color: "#e2e8f0",
                                fontSize: "0.78rem",
                                fontFamily: "monospace",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowToken(!showToken)}
                              style={{
                                background: "rgba(255, 255, 255, 0.08)",
                                border: "none",
                                borderRadius: "4px",
                                color: "#cbd5e1",
                                padding: "4px 8px",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                              }}
                            >
                              {showToken ? "Hide" : "Show"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(oauthSession.accessToken, "token")}
                              style={{
                                background: "rgba(255, 255, 255, 0.08)",
                                border: "none",
                                borderRadius: "4px",
                                color: "#cbd5e1",
                                padding: "4px 8px",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                              }}
                            >
                              {copiedField === "token" ? "✔" : "Copy"}
                            </button>
                          </div>
                        </div>

                        {/* Granted Scopes */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {oauthSession.scopes.map((scope) => (
                            <span
                              key={scope}
                              style={{
                                fontSize: "0.68rem",
                                background: "rgba(99, 102, 241, 0.15)",
                                border: "1px solid rgba(99, 102, 241, 0.3)",
                                color: "#c7d2fe",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                fontFamily: "monospace",
                              }}
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Standard API Key / Cookie Input */
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        color: "#94a3b8",
                        marginBottom: "4px",
                      }}
                    >
                      {editingAccountId
                        ? "New Credential Value (Leave blank to keep unchanged)"
                        : formAuthType === "cookie"
                        ? "Cookie String (e.g. session_id=...)"
                        : "API Key (Token based)"}
                    </label>
                    <input
                      type="password"
                      placeholder={
                        editingAccountId
                          ? "••••••••••••••••"
                          : formAuthType === "cookie"
                          ? "session_id=...; user_auth=..."
                          : "Runtime token"
                      }
                      value={formCredentialValue}
                      onChange={(e) => setFormCredentialValue(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "rgba(0, 0, 0, 0.3)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "6px",
                        color: "#f8fafc",
                        fontSize: "0.88rem",
                      }}
                    />
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="isActiveCheckbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <label
                    htmlFor="isActiveCheckbox"
                    style={{ fontSize: "0.85rem", color: "#cbd5e1", cursor: "pointer" }}
                  >
                    Set as the active credential for inference with {modelId}
                  </label>
                </div>

                {/* Test Connection Results & Model Output / Error Message Card */}
                {testResult && (
                  <div
                    style={{
                      background: testResult.status === "VERIFIED" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                      border: testResult.status === "VERIFIED" ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid rgba(239, 68, 68, 0.35)",
                      borderRadius: "8px",
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "100px",
                            background: testResult.status === "VERIFIED" ? "#10b981" : "#ef4444",
                            color: "#fff",
                          }}
                        >
                          {testResult.status}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "#cbd5e1", fontWeight: 600 }}>
                          {testResult.protocol}
                        </span>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 600 }}>
                        ⏱ {testResult.latencyMs}ms
                      </span>
                    </div>

                    <div style={{ fontSize: "0.82rem", color: "#e2e8f0" }}>
                      {testResult.message}
                    </div>

                    {/* Verified Model Output Response */}
                    {testResult.modelOutput && (
                      <div
                        style={{
                          background: "rgba(16, 185, 129, 0.12)",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                          borderRadius: "6px",
                          padding: "10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: "0.72rem", color: "#34d399", fontWeight: 700, textTransform: "uppercase" }}>
                            🤖 Structured Model Output (Verified Handshake)
                          </div>
                          {Boolean(testResult.details && (testResult.details as any).tokenMetrics) && (
                            <div style={{ display: "flex", gap: "6px" }}>
                              <span style={{ fontSize: "0.68rem", color: "#6ee7b7", background: "rgba(16, 185, 129, 0.2)", padding: "2px 6px", borderRadius: "4px" }}>
                                Total: {(testResult.details as any).tokenMetrics.totalTokens} tokens
                              </span>
                              <span style={{ fontSize: "0.68rem", color: "#93c5fd", background: "rgba(59, 130, 246, 0.2)", padding: "2px 6px", borderRadius: "4px" }}>
                                Prompt: {(testResult.details as any).tokenMetrics.promptTokens}
                              </span>
                              <span style={{ fontSize: "0.68rem", color: "#facc15", background: "rgba(234, 179, 8, 0.2)", padding: "2px 6px", borderRadius: "4px" }}>
                                Completion: {(testResult.details as any).tokenMetrics.completionTokens}
                              </span>
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: "0.78rem",
                            color: "#a7f3d0",
                            lineHeight: 1.45,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                          }}
                        >
                          {testResult.modelOutput}
                        </div>
                      </div>
                    )}

                    {/* Diagnostic Error Message */}
                    {testResult.errorMessage && (
                      <div
                        style={{
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.35)",
                          borderRadius: "6px",
                          padding: "10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <div style={{ fontSize: "0.72rem", color: "#f87171", fontWeight: 700, textTransform: "uppercase" }}>
                          ⚠️ Connection / Verification Error
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#fca5a5", lineHeight: 1.45 }}>
                          {testResult.errorMessage}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Connection Verification Prompt Input (Requirement 2) */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                  <label style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                    Connection Verification Prompt (Structured Output Test)
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      value={testPrompt}
                      onChange={(e) => setTestPrompt(e.target.value)}
                      placeholder="Hi , whats date time now ?"
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        background: "rgba(0, 0, 0, 0.35)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "6px",
                        color: "#f8fafc",
                        fontSize: "0.85rem",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setTestPrompt("Hi , whats date time now ?")}
                      style={{
                        padding: "6px 12px",
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: "6px",
                        color: "#94a3b8",
                        fontSize: "0.74rem",
                        cursor: "pointer",
                      }}
                    >
                      ↺ Default
                    </button>
                  </div>
                </div>

                {(formAuthType === "cli_oauth" || formAuthType === "oauth" || formAuthType === "cli") && (
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        color: "#94a3b8",
                        marginBottom: "4px",
                      }}
                    >
                      Custom Credentials Location (Gemini CLI session authentication)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. /tmp/model-connector/auth/gemini/oauth_creds.json"
                      value={formCustomLocation}
                      onChange={(e) => setFormCustomLocation(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "rgba(0, 0, 0, 0.3)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "6px",
                        color: "#f8fafc",
                        fontSize: "0.85rem",
                      }}
                    />
                    <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>
                      Persisted in database; creates or updates the credentials file for isolated multi-user session authentication.
                    </div>
                  </div>
                )}

                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "12px" }}
                >
                  <button
                    type="button"
                    onClick={handleTestCurrentInput}
                    disabled={isTesting}
                    style={{
                      background: "rgba(6, 182, 212, 0.15)",
                      border: "1px solid rgba(6, 182, 212, 0.35)",
                      borderRadius: "6px",
                      color: "#67e8f9",
                      padding: "8px 16px",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      cursor: isTesting ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>🧪</span>
                    <span>{isTesting ? "Testing Connection..." : "Test Connection"}</span>
                  </button>

                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsFormOpen(false);
                        setTestResult(null);
                      }}
                      style={{
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "none",
                        borderRadius: "6px",
                        color: "#cbd5e1",
                        padding: "8px 16px",
                        fontSize: "0.85rem",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || ((formAuthType === "cli_oauth" || formAuthType === "oauth") && !oauthSession && !editingAccountId)}
                      style={{
                        background:
                          (formAuthType === "cli_oauth" || formAuthType === "oauth") && !oauthSession && !editingAccountId
                            ? "rgba(255, 255, 255, 0.1)"
                            : "linear-gradient(135deg, #2563eb, #1d4ed8)",
                        border: "none",
                        borderRadius: "6px",
                        color:
                          (formAuthType === "cli_oauth" || formAuthType === "oauth") && !oauthSession && !editingAccountId
                            ? "#64748b"
                            : "#fff",
                        padding: "8px 18px",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        cursor:
                          isLoading || ((formAuthType === "cli_oauth" || formAuthType === "oauth") && !oauthSession && !editingAccountId)
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      {isLoading
                        ? "Saving..."
                        : (formAuthType === "cli_oauth" || formAuthType === "oauth") && !oauthSession && !editingAccountId
                        ? "Authorize with OAuth to Save"
                        : "Save Credential"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      <DeleteRecordModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setIsDeleteModalOpen(false);
            setAccountToDelete(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        account={accountToDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
};
