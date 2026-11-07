import React, { useState, useEffect, useMemo } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import type { UiModelAccount, TestConnectionResult, UiModelOAuthConfig } from "@/types/ui.types";
import { ApiService } from "@/utils/services/apiService";
import {
  CategoryMapper,
  modelFilterStrategy,
} from "@/utils";
import {
  ControlPanel,
  ModelCardGrid,
  ModelListView,
  type ViewType,
  type FormMode,
} from "@/components/views";
import {
  oauthProviderRegistry,
  DynamicOnboardedOAuthStrategy,
  type IOAuthProviderStrategy,
  type ProviderCategory,
} from "@/utils/services/oauthProviderRegistry";
import {
  protocolConfigStrategyRegistry,
  type ConfigProtocolType,
  type ProtocolFormContext,
} from "@/utils/services/protocolConfigStrategies";
import {
  ModelConstants,
  ProviderId,
} from "@/constants/providerConfigConstants";
import { DeleteRecordModal } from "@/components/common/DeleteRecordModal";

interface DesktopModelConfigPageProps {
  readonly state: ModelConnectorState;
}

type ConfigProtocol = ConfigProtocolType;

interface AuthenticatedOAuthSession {
  readonly providerId: string;
  readonly providerName: string;
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresInSeconds: number;
  readonly scopes: readonly string[];
  readonly authorizedUser: string;
  readonly authorizedTimestamp: string;
  readonly authCode?: string;
}

export const DesktopModelConfigPage: React.FC<DesktopModelConfigPageProps> = ({ state }) => {
  const initialGoogleStrategy = oauthProviderRegistry.getStrategy(ProviderId.GOOGLE);
  const initialDefaults = initialGoogleStrategy.resolveCliDefaults(ModelConstants.DEFAULT_MODEL_ID);

  const [selectedProtocol, setSelectedProtocol] = useState<ConfigProtocol>("api");
  const [targetModelId, setTargetModelId] = useState<string>(ModelConstants.DEFAULT_MODEL_ID);
  const [accountName, setAccountName] = useState("");
  const [userEmail, setUserEmail] = useState(state.currentUser?.userEmail || "admin@enterprise.com");

  // REST API state (hydrated from centralized application.yml catalog)
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState(initialDefaults.apiBaseUrl);
  const [apiVersion, setApiVersion] = useState(initialDefaults.apiVersion);

  // CLI Binary state
  const [cliExecutable, setCliExecutable] = useState(initialDefaults.executable);
  const [cliArgs, setCliArgs] = useState(initialDefaults.args);
  const [cliWorkingDir, setCliWorkingDir] = useState("/opt/model-connector/models");

  // Cookie Vault state
  const [cookieString, setCookieString] = useState("");
  const [cookieDomain, setCookieDomain] = useState(".google.com");
  const [cookiePath, setCookiePath] = useState("/");

  // OAuth 2.0 Flow state (hydrated from centralized application.yml catalog)
  const [selectedProviderId, setSelectedProviderId] = useState<string>(ProviderId.GOOGLE);
  const [oauthClientId, setOauthClientId] = useState(initialGoogleStrategy.defaultClientId);
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthAuthUrl, setOauthAuthUrl] = useState(initialGoogleStrategy.authUrl);
  const [oauthTokenUrl, setOauthTokenUrl] = useState(initialGoogleStrategy.tokenUrl);
  const [oauthScopes, setOauthScopes] = useState(initialGoogleStrategy.defaultScopes);
  const [resolvedOAuthConfig, setResolvedOAuthConfig] = useState<UiModelOAuthConfig | null>(null);
  const [redirectAuthCode, setRedirectAuthCode] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCliCommand, setCopiedCliCommand] = useState(false);

  // 100+ Providers Catalog & Search State
  const [providerSearchQuery, setProviderSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [availableStrategies, setAvailableStrategies] = useState<readonly IOAuthProviderStrategy[]>(() =>
    oauthProviderRegistry.getAllStrategies(),
  );

  // Onboard New Provider Modal State
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderId, setNewProviderId] = useState("");
  const [newProviderCategory, setNewProviderCategory] = useState<ProviderCategory>("specialized");
  const [newAuthUrl, setNewAuthUrl] = useState("");
  const [newTokenUrl, setNewTokenUrl] = useState("");
  const [newCliCommand, setNewCliCommand] = useState("");
  const [newDefaultScopes, setNewDefaultScopes] = useState("openid profile email");
  const [newClientId, setNewClientId] = useState("");
  const [newDocsUrl, setNewDocsUrl] = useState("");

  // Authenticated OAuth Session (Populated ONLY after OAuth redirect / exchange)
  const [oauthSession, setOauthSession] = useState<AuthenticatedOAuthSession | null>(null);
  const [editableAccessToken, setEditableAccessToken] = useState<string>("");
  const [isSavingToken, setIsSavingToken] = useState<boolean>(false);
  const [tokenSaveSuccess, setTokenSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (oauthSession?.accessToken) {
      setEditableAccessToken(oauthSession.accessToken);
    }
  }, [oauthSession?.accessToken]);

  // Testing & Status
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [testPrompt, setTestPrompt] = useState<string>("Hi , whats date time now ?");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cliScriptError, setCliScriptError] = useState<{ message: string; code?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [accountTestResults, setAccountTestResults] = useState<Record<string, TestConnectionResult>>({});
  const [accountCategory, setAccountCategory] = useState<"individual" | "enterprise">("individual");
  const [isCliLoggingIn, setIsCliLoggingIn] = useState<boolean>(false);
  const [isApplyingOAuthClientConfig, setIsApplyingOAuthClientConfig] = useState<boolean>(false);
  const [activeOAuthStep, setActiveOAuthStep] = useState<1 | 2 | 3 | null>(null);

  // View Mode: "list" | "card" | "form" (Defaults to "list")
  const [viewMode, setViewMode] = useState<ViewType>("list");
  const [formMode, setFormMode] = useState<FormMode>("save");
  const [modelFilterSearch, setModelFilterSearch] = useState<string>("");
  const [modelFamilyFilter, setModelFamilyFilter] = useState<string>("all");
  const [modelGroupBy, setModelGroupBy] = useState<"family" | "none">("family");

  // Deletion Confirmation Modal State
  const [accountToDelete, setAccountToDelete] = useState<UiModelAccount | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("oauth_success") === "true" || params.get("edit") === "true") {
        setViewMode("form");
        setFormMode("save");
      }
    }
  }, []);

  const openModelSaveView = (modelId: string) => {
    setTargetModelId(modelId);
    state.setSelectedModel(modelId);
    setFormMode("save");
    setViewMode("form");
    setActionSuccess(null);
    setActionError(null);
  };

  const openModelCreateView = () => {
    setFormMode("create");
    setViewMode("form");
    setEditingAccountId(null);
    setAccountName("");
    setApiKey("");
    setCookieString("");
    setRedirectAuthCode("");
    setOauthSession(null);
    setTestResult(null);
    setActionSuccess(null);
    setActionError(null);
  };

  const handleDiscard = () => {
    setViewMode("list");
    setActionError(null);
  };

  const handleDeleteActiveAccount = () => {
    const activeAcc =
      (state.modelAccounts || []).find((a) => a.modelId === targetModelId && a.isActive) ||
      (state.modelAccounts || []).find((a) => a.modelId === targetModelId);
    if (!activeAcc) {
      setActionError("No configuration found to delete for this model.");
      return;
    }
    setAccountToDelete(activeAcc);
    setIsDeleteModalOpen(true);
  };

  const categoriesList = useMemo(() => {
    return CategoryMapper.extractFilterList(state.categories);
  }, [state.categories]);

  const filteredModelsForView = useMemo(() => {
    return modelFilterStrategy.filter(state.models, {
      searchQuery: modelFilterSearch,
      family: modelFamilyFilter,
    });
  }, [state.models, modelFilterSearch, modelFamilyFilter]);

  const currentModelObj = state.models.find((m) => m.id === targetModelId);
  const currentModelTitle = currentModelObj?.name || targetModelId;

  // Local In-Container VCS & Credentials Directory Audit State (Enabled by default)
  const [vcsAudit, setVcsAudit] = useState<{
    readonly isTracking: boolean;
    readonly isGitRepo: boolean;
    readonly directoryPath: string;
    readonly currentCommitHash?: string;
    readonly totalTrackedFiles: number;
    readonly changedFiles: readonly string[];
    readonly lastVerifiedAt?: string;
  }>({
    isTracking: true,
    isGitRepo: true,
    directoryPath: "/app/config/data/credentials",
    totalTrackedFiles: 0,
    changedFiles: [],
    lastVerifiedAt: undefined,
  });

  const triggerDirectoryVerification = async (_reason?: string) => {
    try {
      const res = await ApiService.verifyCredentialsDirectory(targetModelId, userEmail);
      if (res?.success && res?.vcs) {
        setVcsAudit({
          isTracking: true,
          isGitRepo: res.vcs.isGitRepo,
          directoryPath: res.vcs.directoryPath,
          currentCommitHash: res.vcs.currentCommitHash || res.diffReport?.gitCommitHash,
          totalTrackedFiles: res.vcs.totalTrackedFiles,
          changedFiles: res.diffReport?.changedFiles || [],
          lastVerifiedAt: new Date().toLocaleTimeString(),
        });
        if (res.syncedAccounts && res.syncedAccounts.length > 0) {
          const primary = res.syncedAccounts[0];
          setUserEmail(primary.userEmail);
          setAccountName(primary.accountName);
          await state.refreshModelAccounts();
        }
      }
    } catch {
      // Best-effort background tracking
    }
  };

  // Determine current effective OAuth step (1: Provider, 2: Redirect & Consent, 3: Token Vault)
  const effectiveOAuthStep: 1 | 2 | 3 = useMemo(() => {
    if (activeOAuthStep !== null) return activeOAuthStep;
    if (oauthSession) return 3;
    return 2;
  }, [activeOAuthStep, oauthSession]);

  const isOAuthVerificationFailed = Boolean(
    selectedProtocol === "oauth" && testResult && testResult.status === "FAILED",
  );

  // Sync application.yml provider catalog and 24-hour Ollama discovery cache on mount
  useEffect(() => {
    void ApiService.syncProviderCatalog().then(() => {
      setAvailableStrategies(oauthProviderRegistry.getAllStrategies());
    });
  }, []);

  // Sync provider and CLI/API defaults from selected model using Strategy Pattern (STD-COD-005)
  useEffect(() => {
    const matchedStrategy = oauthProviderRegistry.findStrategyForModel(targetModelId);
    setSelectedProviderId(matchedStrategy.id);
    const defaults = matchedStrategy.resolveCliDefaults(targetModelId);
    setCliExecutable(defaults.executable);
    setCliArgs(defaults.args);
    setApiBaseUrl(defaults.apiBaseUrl);
    setApiVersion(defaults.apiVersion);
  }, [targetModelId]);

  // Sync provider preset changes
  useEffect(() => {
    const strategy = oauthProviderRegistry.getStrategy(selectedProviderId);
    setOauthAuthUrl(strategy.authUrl);
    setOauthTokenUrl(strategy.tokenUrl);
    setOauthScopes(strategy.defaultScopes);
    setOauthClientId(strategy.defaultClientId || "");
  }, [selectedProviderId]);

  const applyResolvedOAuthConfig = (cfg: UiModelOAuthConfig): void => {
    setResolvedOAuthConfig(cfg);
    setSelectedProviderId(cfg.provider);
    setOauthAuthUrl(cfg.authorizationEndpoint);
    setOauthTokenUrl(cfg.tokenEndpoint);
    setOauthScopes(cfg.defaultScopes.join(" "));
    setAccountCategory(cfg.accountCategory || "individual");
    setOauthClientId(cfg.defaultClientId?.trim() || "");
  };

  useEffect(() => {
    if (selectedProtocol !== "oauth") {
      setResolvedOAuthConfig(null);
      return;
    }
    ApiService.fetchModelOAuthConfig(targetModelId)
      .then((cfg) => {
        applyResolvedOAuthConfig(cfg);
      })
      .catch((err: unknown) => {
        setResolvedOAuthConfig(null);
        const msg = err instanceof Error ? err.message : "Failed to fetch OAuth configuration";
        setActionError(msg);
      });
  }, [selectedProtocol, targetModelId]);

  // Strategy Pattern polymorphic dispatch for active provider
  const selectedStrategy = oauthProviderRegistry.getStrategy(selectedProviderId);
  const computedAuthRedirectUri = resolvedOAuthConfig?.redirectUri || selectedStrategy.defaultRedirectUri;
  const resolvedDefaultClientId = (resolvedOAuthConfig?.defaultClientId || selectedStrategy.defaultClientId || "").trim();
  const effectiveClientId = (oauthClientId || resolvedDefaultClientId).trim();
  const requiresRegisteredClient = Boolean(resolvedOAuthConfig?.requiresClientRegistration);
  const requiresClientRegistration = Boolean(resolvedOAuthConfig?.requiresClientRegistration && !resolvedDefaultClientId);
  const isClientIdMissingForRedirect = requiresClientRegistration && effectiveClientId.length === 0;

  const computedAuthorizationUrl =
    effectiveClientId &&
    (!resolvedOAuthConfig?.authorizationUrl ||
      resolvedOAuthConfig.authorizationUrl.includes("<DB_") ||
      effectiveClientId !== resolvedDefaultClientId)
      ? selectedStrategy.buildAuthorizationUrl({
          clientId: effectiveClientId,
          redirectUri: computedAuthRedirectUri,
          scopes: oauthScopes,
          modelId: targetModelId,
          userEmail: userEmail,
        })
      : resolvedOAuthConfig?.authorizationUrl ||
        (effectiveClientId
          ? selectedStrategy.buildAuthorizationUrl({
              clientId: effectiveClientId,
              redirectUri: computedAuthRedirectUri,
              scopes: oauthScopes,
              modelId: targetModelId,
              userEmail: userEmail,
            })
          : resolvedOAuthConfig?.authorizationEndpoint || selectedStrategy.authUrl);

  const executableLaunchUrl =
    effectiveClientId &&
    (!resolvedOAuthConfig?.executableLaunchUrl ||
      resolvedOAuthConfig.executableLaunchUrl.includes("<DB_") ||
      effectiveClientId !== resolvedDefaultClientId)
      ? selectedStrategy.buildAuthorizationUrl({
          clientId: effectiveClientId,
          redirectUri: computedAuthRedirectUri,
          scopes: oauthScopes,
          modelId: targetModelId,
          userEmail: userEmail,
        })
      : resolvedOAuthConfig?.executableLaunchUrl || "";

  const buildOAuthScopes = (): readonly string[] =>
    oauthScopes
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

  const resolveHostBrowserLaunchTarget = (
    url: string,
  ): { targetUrl: string; usingEdgeProtocol: boolean; requiresExternalBrowser: boolean } => {
    return {
      targetUrl: url,
      usingEdgeProtocol: false,
      requiresExternalBrowser: false,
    };
  };

  // Filtered providers for the 100+ providers ecosystem catalog
  const filteredStrategies = useMemo(() => {
    return availableStrategies.filter((s) => {
      const matchesCategory = selectedCategory === "all" || s.category === selectedCategory;
      const q = providerSearchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.cliCommand.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [availableStrategies, selectedCategory, providerSearchQuery]);

  const categories = useMemo(() => {
    return oauthProviderRegistry.getCategories();
  }, [availableStrategies]);

  const [isWaitingForCallback, setIsWaitingForCallback] = useState<boolean>(false);

  // Cross-window postMessage listener from OAuth callback page
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (
        event.data?.type === "MODELBOX_OAUTH_SUCCESS" ||
        event.data?.type === "OAUTH_CALLBACK_SUCCESS"
      ) {
        const accessToken = event.data.accessToken || event.data.token;
        const refreshToken = event.data.refreshToken || "";
        const incomingEmail = event.data.userEmail || event.data.email;
        const incomingCode = event.data.code || event.data.authCode;
        const provider = event.data.provider || selectedProviderId;

        if (incomingCode) {
          setRedirectAuthCode(incomingCode);
        }

        if (accessToken) {
          const newSession: AuthenticatedOAuthSession = {
            providerId: provider,
            providerName: selectedStrategy.name,
            accessToken,
            refreshToken,
            expiresInSeconds: 3600,
            scopes: selectedStrategy.defaultScopes.split(" ").filter(Boolean),
            authorizedUser: incomingEmail || userEmail,
            authorizedTimestamp: new Date().toLocaleTimeString(),
            authCode: incomingCode,
          };
          setOauthSession(newSession);
          if (incomingEmail) {
            setUserEmail(incomingEmail);
            setAccountName(`${selectedStrategy.name} (${incomingEmail})`);
          }
          setIsWaitingForCallback(false);
          setActionSuccess(`Successfully connected and verified OAuth 2.0 session for ${incomingEmail || selectedStrategy.name}!`);
          setActionError(null);
          await state.refreshModelAccounts();
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [selectedStrategy, selectedProviderId, userEmail, state]);

  // Periodic polling hook when browser OAuth window is opened
  useEffect(() => {
    if (!isWaitingForCallback) return;
    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount++;
      if (pollCount > 40) {
        setIsWaitingForCallback(false);
        clearInterval(interval);
        return;
      }
      try {
        const cliSessionRes = await ApiService.fetchLatestCliSession(targetModelId).catch(() => null);
        if (cliSessionRes?.session?.status === "FAILED" && cliSessionRes.session.errorMessage) {
          const errMsg = cliSessionRes.session.errorMessage;
          setCliScriptError({ message: errMsg, code: cliSessionRes.session.errorCode });
          setActionError(`CLI Script Error [${cliSessionRes.session.errorCode || "FAILURE"}]: ${errMsg}`);
          setIsWaitingForCallback(false);
          clearInterval(interval);
          return;
        }

        const res = await ApiService.fetchLatestOAuthCallback(targetModelId);
        const session = res?.accessToken ? res : (res?.session || res?.callback);
        if (session?.code) {
          setRedirectAuthCode(session.code);
        }
        if (session?.accessToken && session.email) {
          const newSession: AuthenticatedOAuthSession = {
            providerId: session.provider || selectedStrategy.id,
            providerName: selectedStrategy.name,
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            expiresInSeconds: 3600,
            scopes: selectedStrategy.defaultScopes.split(" ").filter(Boolean),
            authorizedUser: session.email,
            authorizedTimestamp: new Date(session.timestamp || Date.now()).toLocaleTimeString(),
            authCode: session.code,
          };
          setOauthSession(newSession);
          setUserEmail(session.email);
          setAccountName(`${selectedStrategy.name} (${session.email})`);
          setIsWaitingForCallback(false);
          setTestResult(null);
          setActiveOAuthStep(3);
          setActionSuccess(`Successfully authorized live OAuth 2.0 session for ${session.email}!`);
          setActionError(null);
          clearInterval(interval);
          await state.refreshModelAccounts();
        }
      } catch {
        // Continue polling
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [isWaitingForCallback, targetModelId, selectedStrategy, state]);

  // Sync existing active account from state.modelAccounts on load or model change
  useEffect(() => {
    const activeAcc = (state.modelAccounts || []).find((a) => a.modelId === targetModelId && a.isActive);
    if (activeAcc && activeAcc.credentialValue) {
      setUserEmail(activeAcc.userEmail || userEmail);
      setAccountName(activeAcc.accountName || accountName);
      if (activeAcc.authType === "cli_oauth" || activeAcc.authType === "oauth") {
        setOauthSession({
          providerId: selectedStrategy.id,
          providerName: selectedStrategy.name,
          accessToken: activeAcc.credentialValue,
          refreshToken: "rt_existing",
          expiresInSeconds: 3600,
          scopes: selectedStrategy.defaultScopes.split(" ").filter(Boolean),
          authorizedUser: activeAcc.userEmail,
          authorizedTimestamp: activeAcc.updatedTimestamp || new Date().toLocaleTimeString(),
          authCode: (activeAcc as any).authCode || (activeAcc.config as any)?.authCode,
        });
      }
    }
  }, [targetModelId, state.modelAccounts]);

  // Handle OAuth success query params on page load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_success") === "true") {
      const email = params.get("email");
      const authCode = params.get("code") || params.get("auth_code");
      if (email) {
        setUserEmail(email);
        setAccountName(`${selectedStrategy.name} (${email})`);
      }
      if (authCode) {
        setRedirectAuthCode(authCode);
      }
      handleCompleteOAuthExchange(authCode || undefined);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const normalizeRedirectUri = (candidate: string): string => {
    try {
      const parsed = new URL(candidate);
      const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
        throw new Error("Redirect URI must use HTTPS, except localhost loopback for development.");
      }
      return parsed.toString();
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : "Invalid redirect URI configuration.");
    }
  };

  const applyOAuthClientConfiguration = async (): Promise<UiModelOAuthConfig> => {
    const trimmedClientId = oauthClientId.trim();
    if (!trimmedClientId) {
      throw new Error("OAuth Client ID is required to apply provider OAuth configuration.");
    }
    if (trimmedClientId.includes("<") || trimmedClientId.includes(">")) {
      throw new Error("OAuth Client ID format is invalid. Provide a real client identifier.");
    }
    const normalizedRedirectUri = normalizeRedirectUri(computedAuthRedirectUri);
    setIsApplyingOAuthClientConfig(true);
    setActionError(null);
    await ApiService.upsertProviderOAuthClient(selectedProviderId, {
      modelId: targetModelId,
      clientAlias: `${selectedStrategy.name} ${targetModelId} OAuth Client`,
      clientId: trimmedClientId,
      clientSecret: oauthClientSecret.trim(),
      redirectUri: normalizedRedirectUri,
      scopes: buildOAuthScopes(),
      isDefault: true,
    });
    const refreshed = await ApiService.fetchModelOAuthConfig(targetModelId);
    applyResolvedOAuthConfig(refreshed);
    setOauthClientSecret("");
    setActionSuccess(`OAuth client configuration applied for ${selectedStrategy.name}.`);
    setIsApplyingOAuthClientConfig(false);
    return refreshed;
  };

  const ensureAppliedOAuthClientConfiguration = async (): Promise<UiModelOAuthConfig | null> => {
    if (!requiresRegisteredClient || resolvedDefaultClientId.length > 0 || !oauthClientId.trim()) {
      return null;
    }
    try {
      return await applyOAuthClientConfiguration();
    } finally {
      setIsApplyingOAuthClientConfig(false);
    }
  };

  const handleApplyOAuthClientConfiguration = async () => {
    try {
      await applyOAuthClientConfiguration();
    } catch {
      setActionError("Unable to apply OAuth client configuration. Verify client values and retry.");
    } finally {
      setIsApplyingOAuthClientConfig(false);
    }
  };

  const handleExecuteCliLogin = async () => {
    setIsCliLoggingIn(true);
    setActionError(null);
    try {
      const refreshedConfig = await ensureAppliedOAuthClientConfiguration();
      const cliResponse = await ApiService.executeCliLogin(targetModelId, {
        provider: selectedProviderId,
        userEmail,
        accountCategory,
      });

      if (!cliResponse.success || cliResponse.session?.status === "FAILED") {
        const errMsg = cliResponse.session?.errorMessage || cliResponse.message || "CLI script execution failed";
        setCliScriptError({ message: errMsg, code: cliResponse.session?.errorCode });
        setActionError(`CLI Script Error [${cliResponse.session?.errorCode || "EXEC_ERROR"}]: ${errMsg}`);
        setIsWaitingForCallback(false);
        return;
      }
      setCliScriptError(null);

      if (cliResponse.vcs) {
        setVcsAudit({
          isTracking: true,
          isGitRepo: true,
          directoryPath: "/app/config/data/credentials",
          currentCommitHash: cliResponse.vcs.gitCommitHash,
          totalTrackedFiles: cliResponse.vcs.changedFiles?.length || 0,
          changedFiles: cliResponse.vcs.changedFiles || [],
          lastVerifiedAt: new Date().toLocaleTimeString(),
        });
      }
      if (cliResponse.account) {
        setUserEmail(cliResponse.account.userEmail);
        setAccountName(cliResponse.account.accountName);
        await state.refreshModelAccounts();
      }

      const fallbackConfig = refreshedConfig || (await ApiService.fetchModelOAuthConfig(targetModelId));
      const launchUrl =
        cliResponse.loginResult?.config?.authorizationUrl ||
        fallbackConfig?.executableLaunchUrl ||
        computedAuthorizationUrl ||
        executableLaunchUrl;
      const nextStep = cliResponse.loginResult?.config?.nextStep;
      const setupGuide = cliResponse.loginResult?.config?.setupGuide;
      const needsRegistration = Boolean(cliResponse.loginResult?.config?.requiresClientRegistration && !effectiveClientId);

      if (needsRegistration && !launchUrl) {
        setIsWaitingForCallback(false);
        const guideSuffix = setupGuide ? ` Setup guide: ${setupGuide}` : "";
        setActionError(`OAuth Client ID is required before browser redirect. Configure Client ID in Advanced OAuth settings.${guideSuffix}`);
        return;
      }

      if (!launchUrl) {
        setIsWaitingForCallback(false);
        const fallbackStep = `Run ${selectedStrategy.cliCommand} and complete sign-in in Gemini CLI.`;
        const guideSuffix = setupGuide ? ` Setup guide: ${setupGuide}` : "";
        setActionSuccess(`${nextStep || fallbackStep}${guideSuffix}`);
        return;
      }
      const launchTarget = resolveHostBrowserLaunchTarget(launchUrl);
      if (launchTarget.requiresExternalBrowser) {
        await navigator.clipboard.writeText(launchTarget.targetUrl).catch(() => undefined);
        setIsWaitingForCallback(false);
        setActionError("Google OAuth is not supported in VS Code embedded browser. Authorization URL copied — open it in host Microsoft Edge.");
        return;
      }
      setIsWaitingForCallback(true);
      const popup = window.open(launchTarget.targetUrl, "_blank", "width=600,height=750");
      if (!popup || popup.closed || typeof popup.closed === "undefined") {
        setActionSuccess(`Browser opened for ${selectedStrategy.name} CLI authentication. Please complete sign-in.`);
        return;
      }
      setActionSuccess(`Launching ${selectedStrategy.name} CLI authentication in your browser... Please sign in.`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to generate CLI authentication instructions.");
    } finally {
      setIsCliLoggingIn(false);
    }
  };

  const handleInitiateBrowserRedirect = async () => {
    setIsRedirecting(true);
    setIsWaitingForCallback(true);
    setActionError(null);
    void triggerDirectoryVerification("pre-browser-redirect");
    setActionSuccess(`Redirecting to ${selectedStrategy.name} Authorization Portal in a new window...`);
    try {
      const refreshedConfig = await ensureAppliedOAuthClientConfiguration();
      const fallbackConfig = refreshedConfig || (await ApiService.fetchModelOAuthConfig(targetModelId));
      const resolvedLaunchUrl = fallbackConfig?.executableLaunchUrl || executableLaunchUrl;
      if (!resolvedLaunchUrl) {
        setIsWaitingForCallback(false);
        setActionError("OAuth Client ID is required for redirect. Provide Client ID in Advanced OAuth settings before browser sign-in.");
        return;
      }
      const launchTarget = resolveHostBrowserLaunchTarget(resolvedLaunchUrl);
      if (launchTarget.requiresExternalBrowser) {
        await navigator.clipboard.writeText(launchTarget.targetUrl).catch(() => undefined);
        setIsWaitingForCallback(false);
        setActionError("Google OAuth is not supported in VS Code embedded browser. Authorization URL copied — open it in host Microsoft Edge.");
        return;
      }
      const popup = window.open(launchTarget.targetUrl, "_blank", "width=600,height=750");
      if (!popup || popup.closed || typeof popup.closed === "undefined") {
        window.location.assign(launchTarget.targetUrl);
        setActionSuccess(`Popup blocked. Continuing in current tab for ${selectedStrategy.name} authorization...`);
        return;
      }
    } catch (err: unknown) {
      setIsWaitingForCallback(false);
      const message = err instanceof Error ? err.message : "Failed to open browser popup. Please verify browser popup permissions.";
      setActionError(message);
    }
    setTimeout(() => {
      setIsRedirecting(false);
    }, 2000);
  };

  const handleCompleteOAuthExchange = async (codeToExchange?: string) => {
    const exchangeCode = codeToExchange || redirectAuthCode;
    const strategy = oauthProviderRegistry.getStrategy(selectedProviderId);
    try {
      if (exchangeCode) {
        try {
          const cliSessionRes = await ApiService.fetchLatestCliSession(targetModelId);
          await ApiService.submitCliAuthCode({
            sessionId: cliSessionRes?.session?.sessionId,
            authCode: exchangeCode,
            modelId: targetModelId,
            userEmail,
          });
        } catch {
          // Graceful best-effort sync
        }
        const res = await ApiService.verifyOAuthManual(targetModelId, exchangeCode, userEmail);
        if (res?.session) {
          const session = res.session;
          if (res.vcs) {
            setVcsAudit({
              isTracking: true,
              isGitRepo: true,
              directoryPath: "/app/config/data/credentials",
              currentCommitHash: res.vcs.gitCommitHash,
              totalTrackedFiles: res.vcs.changedFiles?.length || 0,
              changedFiles: res.vcs.changedFiles || [],
              lastVerifiedAt: new Date().toLocaleTimeString(),
            });
          }
          setOauthSession({
            providerId: session.provider || strategy.id,
            providerName: strategy.name,
            accessToken: session.accessToken,
            refreshToken: session.refreshToken || "rt_token",
            expiresInSeconds: 3600,
            scopes: strategy.defaultScopes.split(" ").filter(Boolean),
            authorizedUser: session.email,
            authorizedTimestamp: new Date().toLocaleTimeString(),
            authCode: session.code || exchangeCode,
          });
          if (session.email) {
            setUserEmail(session.email);
            setAccountName(`${strategy.name} (${session.email})`);
          }
          setRedirectAuthCode("");
          setTestResult(null);
          setActiveOAuthStep(3);
          setActionSuccess(`Successfully authorized live OAuth 2.0 session for ${session.email}!`);
          setActionError(null);
          await state.refreshModelAccounts();
          return;
        }
      }

      // If no manual code typed, check latest callback from loopback server
      const cbRes = await ApiService.fetchLatestOAuthCallback(targetModelId);
      const session = cbRes?.accessToken ? cbRes : (cbRes?.session || cbRes?.callback);
      if (session?.accessToken) {
        setOauthSession({
          providerId: session.provider || strategy.id,
          providerName: strategy.name,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken || "rt_token",
          expiresInSeconds: 3600,
          scopes: strategy.defaultScopes.split(" ").filter(Boolean),
          authorizedUser: session.email,
          authorizedTimestamp: new Date(session.timestamp || Date.now()).toLocaleTimeString(),
          authCode: session.code,
        });
        if (session.email) {
          setUserEmail(session.email);
          setAccountName(`${strategy.name} (${session.email})`);
        }
        setTestResult(null);
        setActiveOAuthStep(3);
        setActionSuccess(`Successfully connected active OAuth 2.0 session for ${session.email}!`);
        setActionError(null);
        await state.refreshModelAccounts();
        return;
      }

      setActionError("No authorization code or captured session found. Please complete the browser login window.");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "OAuth code exchange failed");
    }
  };

  const handleDisconnectOAuth = () => {
    setOauthSession(null);
    setTestResult(null);
    setActiveOAuthStep(2);
    setActionSuccess("OAuth session revoked. Please authorize with your provider to link credentials.");
  };

  const handleOnboardNewProvider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProviderName.trim() || !newProviderId.trim() || !newAuthUrl.trim()) {
      setActionError("Please provide at least a Provider Name, ID, and Authorization URL.");
      return;
    }

    const customStrategy = new DynamicOnboardedOAuthStrategy({
      id: newProviderId.trim().toLowerCase(),
      name: newProviderName.trim(),
      category: newProviderCategory,
      authUrl: newAuthUrl.trim(),
      tokenUrl: newTokenUrl.trim() || `${newAuthUrl.trim().replace("/authorize", "/token")}`,
      cliCommand: newCliCommand.trim() || `${newProviderId.trim().toLowerCase()} auth login`,
      defaultScopes: newDefaultScopes.trim(),
      defaultClientId: newClientId.trim() || `${newProviderId.trim().toLowerCase()}-client`,
      docsUrl: newDocsUrl.trim(),
    });

    oauthProviderRegistry.registerCustomProvider(customStrategy);
    const updated = oauthProviderRegistry.getAllStrategies();
    setAvailableStrategies(updated);
    setSelectedProviderId(customStrategy.id);
    setIsOnboardingModalOpen(false);
    setActionSuccess(`Successfully onboarded new provider: ${customStrategy.name}! It is now active in your registry.`);

    // Reset onboarding form
    setNewProviderName("");
    setNewProviderId("");
    setNewAuthUrl("");
    setNewTokenUrl("");
    setNewCliCommand("");
    setNewDocsUrl("");
  };

  const buildProtocolFormContext = (): ProtocolFormContext => ({
    apiKey,
    apiBaseUrl,
    apiVersion,
    cliExecutable,
    cliArgs,
    cliWorkingDir,
    cookieString,
    cookieDomain,
    cookiePath,
    oauthClientId,
    oauthClientSecret,
    oauthAuthUrl,
    oauthTokenUrl,
    oauthScopes,
    selectedProviderId,
    oauthAccessToken: oauthSession?.accessToken,
    oauthAuthorizedTimestamp: oauthSession?.authorizedTimestamp,
    oauthRefreshToken: oauthSession?.refreshToken,
  });

  const getCredentialValueForProtocol = (): string => {
    const strategy = protocolConfigStrategyRegistry.resolve(selectedProtocol);
    return strategy.resolveCredentialValue(buildProtocolFormContext());
  };

  const getProtocolConfigObject = (): Record<string, unknown> => {
    const strategy = protocolConfigStrategyRegistry.resolve(selectedProtocol);
    return strategy.buildConfigObject(buildProtocolFormContext());
  };

  const handleTestCurrentConfig = async () => {
    setIsTesting(true);
    setTestResult(null);
    setActionError(null);
    try {
      const credVal = getCredentialValueForProtocol();
      const cfg = getProtocolConfigObject();
      const res = await ApiService.testModelConnection({
        modelId: targetModelId,
        authType: selectedProtocol,
        credentialValue: credVal,
        prompt: testPrompt || "Hi , whats date time now ?",
        config: cfg,
      });
      setTestResult(res);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveEditedToken = async () => {
    if (!editableAccessToken.trim()) return;
    setIsSavingToken(true);
    setTokenSaveSuccess(null);
    setActionError(null);
    try {
      const activeAcc =
        (state.modelAccounts || []).find((a) => a.modelId === targetModelId && a.isActive) ||
        (state.modelAccounts || []).find((a) => a.modelId === targetModelId);

      const tokenValue = editableAccessToken.trim();
      const currentEmail = userEmail.trim() || "personal.developer@gmail.com";
      const currentName = accountName.trim() || `${selectedStrategy.name} (${currentEmail})`;

      if (activeAcc) {
        await ApiService.updateModelAccount(targetModelId, activeAcc.accountId, {
          credentialValue: tokenValue,
          userEmail: activeAcc.userEmail || currentEmail,
          accountName: activeAcc.accountName || currentName,
          authType: activeAcc.authType || "cli_oauth",
        });
      } else {
        await ApiService.createModelAccount(targetModelId, {
          accountName: currentName,
          userEmail: currentEmail,
          authType: "cli_oauth",
          credentialValue: tokenValue,
          isActive: true,
        });
      }

      if (oauthSession) {
        setOauthSession({
          ...oauthSession,
          accessToken: tokenValue,
        });
      }
      setTokenSaveSuccess("Issued Bearer access token updated and saved in database!");
      await state.refreshModelAccounts();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to save edited token");
    } finally {
      setIsSavingToken(false);
    }
  };

  const handleSaveConfiguration = async (e?: React.FormEvent) => {
    if (e?.preventDefault) {
      e.preventDefault();
    }
    if (!accountName.trim()) {
      setActionError("Please provide an Account Configuration Label.");
      return;
    }

    if (selectedProtocol === "oauth" && !oauthSession) {
      setActionError("OAuth requires authorization redirect before saving. Please complete the OAuth redirect handshake.");
      return;
    }

    setIsSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const protocolStrategy = protocolConfigStrategyRegistry.resolve(selectedProtocol);
      const credVal = getCredentialValueForProtocol();
      const cfg = getProtocolConfigObject();

      const existingMatch = editingAccountId
        ? state.modelAccounts.find((a) => a.accountId === editingAccountId)
        : state.modelAccounts.find(
            (a) =>
              a.modelId === targetModelId &&
              ((userEmail.trim().length > 0 && a.userEmail.toLowerCase() === userEmail.trim().toLowerCase()) ||
                a.accountName.toLowerCase() === accountName.trim().toLowerCase()),
          );

      if (existingMatch) {
        await ApiService.updateModelAccount(targetModelId, existingMatch.accountId, {
          accountName: accountName.trim(),
          userEmail: userEmail.trim(),
          authType: protocolStrategy.storageAuthType,
          credentialValue: credVal,
          isActive: true,
          config: cfg,
        });
        setActionSuccess(`Successfully updated and activated configuration '${accountName}' for '${targetModelId}'!`);
      } else {
        await ApiService.createModelAccount(targetModelId, {
          accountName: accountName.trim(),
          userEmail: userEmail.trim(),
          authType: protocolStrategy.storageAuthType,
          credentialValue: credVal,
          isActive: true,
          config: cfg,
        });
        setActionSuccess(`Successfully saved and activated configuration '${accountName}' for '${targetModelId}'!`);
      }

      setEditingAccountId(null);
      await state.refreshModelAccounts();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivateAccount = async (acc: UiModelAccount) => {
    try {
      await ApiService.activateModelAccount(acc.modelId, acc.accountId);
      setActionSuccess(`Account '${acc.accountName}' is now ACTIVE for '${acc.modelId}'.`);
      await state.refreshModelAccounts();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to activate account");
    }
  };

  const handleDeactivateAccount = async (acc: UiModelAccount) => {
    try {
      await ApiService.deactivateModelAccount(acc.modelId, acc.accountId);
      setActionSuccess(`Account '${acc.accountName}' is now INACTIVE for '${acc.modelId}'.`);
      await state.refreshModelAccounts();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to deactivate account");
    }
  };

  const handleOpenDeleteModal = (acc: UiModelAccount) => {
    setAccountToDelete(acc);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    if (isDeletingAccount) return;
    setIsDeleteModalOpen(false);
    setAccountToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!accountToDelete) return;
    setIsDeletingAccount(true);
    try {
      await ApiService.deleteModelAccount(accountToDelete.modelId, accountToDelete.accountId);
      setActionSuccess(`Successfully deleted credential '${accountToDelete.accountName}'.`);
      if (oauthSession && oauthSession.providerId === selectedStrategy.id) {
        setOauthSession(null);
      }
      await state.refreshModelAccounts();
      setIsDeleteModalOpen(false);
      setAccountToDelete(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleToggleAccountStatus = async (acc: UiModelAccount) => {
    if (acc.isActive) {
      await handleDeactivateAccount(acc);
    } else {
      await handleActivateAccount(acc);
    }
  };

  const handleTestExistingAccount = async (acc: UiModelAccount) => {
    setTestingAccountId(acc.accountId);
    try {
      const res = await ApiService.testModelConnection({
        modelId: acc.modelId,
        authType: acc.authType,
        credentialValue: acc.credentialValue,
        config: acc.config,
      });
      setAccountTestResults((prev) => ({ ...prev, [acc.accountId]: res }));

      if (res.status === "FAILED") {
        if (acc.isActive) {
          await ApiService.deactivateModelAccount(acc.modelId, acc.accountId);
          setActionError(
            `⚠️ Authentication Failed (401/Invalid Credential): Account '${acc.accountName}' was automatically set to INACTIVE.`,
          );
          await state.refreshModelAccounts();
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (acc.isActive) {
        try {
          await ApiService.deactivateModelAccount(acc.modelId, acc.accountId);
          await state.refreshModelAccounts();
        } catch {}
      }
      setActionError(
        `⚠️ Authentication Error (401 Unauthorized): Account '${acc.accountName}' failed verification and was converted to INACTIVE.`,
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

  return (
    <div className="desktop-model-config-page" data-testid="desktop-model-config-page">
      {/* 1. Unified Control Panel */}
      <ControlPanel
        viewType={viewMode}
        formMode={formMode}
        title={viewMode === "form" ? currentModelTitle : "Model Configuration Studio"}
        breadcrumbParent={viewMode === "form" ? "Model Configurations" : undefined}
        onBreadcrumbParentClick={() => setViewMode("list")}
        onCreateClick={openModelCreateView}
        onSaveClick={viewMode === "form" ? () => void handleSaveConfiguration() : undefined}
        onDiscardClick={viewMode === "form" ? handleDiscard : undefined}
        onDeleteClick={viewMode === "form" && formMode === "save" ? handleDeleteActiveAccount : undefined}
        onChatClick={
          viewMode === "form"
            ? () => {
                state.setSelectedModel(targetModelId);
                state.setActiveTab("chat");
              }
            : undefined
        }
        isSaving={isSaving}
        onViewTypeChange={(type) => setViewMode(type)}
        searchQuery={modelFilterSearch}
        onSearchChange={setModelFilterSearch}
        searchPlaceholder="Filter models by name, family, or ID..."
        activeFilter={modelFamilyFilter}
        onFilterChange={setModelFamilyFilter}
        filterOptions={categoriesList}
        activeGroupBy={modelGroupBy}
        onGroupByChange={(g) => setModelGroupBy(g as any)}
        groupByOptions={[
          { value: "family", label: "Provider / Family" },
          { value: "none", label: "None (Flat List)" },
        ]}
        currentRange={
          viewMode !== "form" && filteredModelsForView.length > 0
            ? `1-${filteredModelsForView.length} / ${filteredModelsForView.length}`
            : undefined
        }
      />

      {actionSuccess && (
        <div className="alert-banner success">
          <span className="alert-icon">✔</span>
          <span className="alert-text">{actionSuccess}</span>
          <button className="alert-close" onClick={() => setActionSuccess(null)}>✕</button>
        </div>
      )}

      {actionError && (
        <div className="alert-banner error">
          <span className="alert-icon">⚠️</span>
          <span className="alert-text">{actionError}</span>
          <button className="alert-close" onClick={() => setActionError(null)}>✕</button>
        </div>
      )}

      {/* 2. List View (Group By & Metrics) */}
      {viewMode === "list" && (
        <ModelListView
          models={filteredModelsForView}
          modelAccounts={state.modelAccounts}
          auditLogs={state.auditLogs}
          sessions={state.sessions}
          selectedModelId={targetModelId}
          groupBy={modelGroupBy}
          onModelClick={openModelSaveView}
          onChatSelect={(mId) => {
            state.setSelectedModel(mId);
            state.setActiveTab("chat");
          }}
          onManageAccountsClick={(mId) => {
            openModelSaveView(mId);
          }}
        />
      )}

      {/* 3. Card View (Kanban Card Grid) */}
      {viewMode === "card" && (
        <ModelCardGrid
          models={filteredModelsForView}
          modelAccounts={state.modelAccounts}
          selectedModelId={targetModelId}
          onModelClick={openModelSaveView}
          onChatSelect={(mId) => {
            state.setSelectedModel(mId);
            state.setActiveTab("chat");
          }}
        />
      )}

      {/* 4. Form View (Create / Save View) */}
      {viewMode === "form" && (
        <div className="form-view-container odoo-form-view-container" data-testid="form-view">
          {formMode === "create" && (
            <div className="form-create-banner odoo-form-create-banner" data-testid="create-banner">
              <div className="create-banner-info">
                <span className="banner-icon">✨</span>
                <div className="banner-text">
                  <h4>New Model Configuration</h4>
                  <p>Select target model below to bind credentials and authentication strategies.</p>
                </div>
              </div>
              <div className="create-model-selector-row">
                <label className="selector-label">Target Model:</label>
                <select
                  className="model-select-dropdown"
                  value={targetModelId}
                  onChange={(e) => {
                    setTargetModelId(e.target.value);
                    state.setSelectedModel(e.target.value);
                  }}
                  data-testid="select-target-model"
                >
                  {state.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.family})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="config-studio-grid">
        {/* Left Column: Interactive Protocol Configuration Form */}
        <div className="config-builder-card">
          <div className="card-header">
            <span className="card-icon">⚡</span>
            <h3>Protocol Configuration Engine</h3>
          </div>

          {/* Protocol Switcher Tabs */}
          <div className="protocol-selector-tabs">
            <button
              type="button"
              className={`protocol-tab-btn ${selectedProtocol === "api" ? "active" : ""}`}
              onClick={() => setSelectedProtocol("api")}
            >
              <span className="tab-icon">🔑</span>
              <span className="tab-label">REST API</span>
              <span className="tab-hint">Static Key</span>
            </button>

            <button
              type="button"
              className={`protocol-tab-btn ${selectedProtocol === "oauth" ? "active" : ""}`}
              onClick={() => setSelectedProtocol("oauth")}
            >
              <span className="tab-icon">🌐</span>
              <span className="tab-label">OAuth 2.0 Redirect</span>
              <span className="tab-hint">Web Consent</span>
            </button>

            <button
              type="button"
              className={`protocol-tab-btn ${selectedProtocol === "cli" ? "active" : ""}`}
              onClick={() => setSelectedProtocol("cli")}
            >
              <span className="tab-icon">💻</span>
              <span className="tab-label">CLI Binary</span>
              <span className="tab-hint">Host Terminal</span>
            </button>

            <button
              type="button"
              className={`protocol-tab-btn ${selectedProtocol === "cookie" ? "active" : ""}`}
              onClick={() => setSelectedProtocol("cookie")}
            >
              <span className="tab-icon">🍪</span>
              <span className="tab-label">Cookie Vault</span>
              <span className="tab-hint">Session Lineage</span>
            </button>
          </div>

          <form className="protocol-config-form" onSubmit={handleSaveConfiguration}>
            <div className="form-row-2">
              <div className="form-group">
                <label>Target Model</label>
                <select
                  className="form-select"
                  value={targetModelId}
                  onChange={(e) => setTargetModelId(e.target.value)}
                >
                  {state.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.family})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Configuration / Account Label</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Enterprise Production Key / Live OAuth Account"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Owner / Associate Email</label>
              <input
                type="email"
                className="form-input"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                required
              />
            </div>

            {/* ============================================================= */}
            {/* 1. REST API PROTOCOL TAB                                      */}
            {/* ============================================================= */}
            {selectedProtocol === "api" && (
              <div className="protocol-fields-container">
                <div className="protocol-badge-intro api-intro">
                  <span className="badge-icon">🔑</span>
                  <div>
                    <strong>Direct REST API Key Authentication</strong>
                    <p>Standard header-based Bearer token or URL key parameters for model execution.</p>
                  </div>
                </div>

                <div className="form-group">
                  <label>API Key / Secret Token</label>
                  <input
                    type="password"
                    className="form-input code-font"
                    placeholder="Enter runtime token"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    required={selectedProtocol === "api"}
                  />
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Base Endpoint URL</label>
                    <input
                      type="text"
                      className="form-input"
                      value={apiBaseUrl}
                      onChange={(e) => setApiBaseUrl(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>API Version Tag</label>
                    <input
                      type="text"
                      className="form-input"
                      value={apiVersion}
                      onChange={(e) => setApiVersion(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* 2. OAUTH 2.0 / CLI REDIRECT WORKFLOW (100+ PROVIDERS)        */}
            {/* ============================================================= */}
            {selectedProtocol === "oauth" && (
              <div className="oauth-dedicated-container">
                {/* Step Bar */}
                <div className="oauth-step-progress">
                  <button
                    type="button"
                    className={`step-item-btn ${effectiveOAuthStep === 1 ? "active" : oauthSession ? "completed" : ""}`}
                    onClick={() => setActiveOAuthStep(1)}
                  >
                    <span className="step-circle">{oauthSession && effectiveOAuthStep !== 1 ? "✔" : "1"}</span>
                    <span className="step-label">Select Identity Provider</span>
                  </button>
                  <div className="step-connector"></div>
                  <button
                    type="button"
                    className={`step-item-btn ${effectiveOAuthStep === 2 ? "active" : oauthSession ? "completed" : ""}`}
                    onClick={() => setActiveOAuthStep(2)}
                  >
                    <span className="step-circle">{oauthSession && effectiveOAuthStep !== 2 ? "✔" : "2"}</span>
                    <span className="step-label">Browser Redirect & Consent</span>
                  </button>
                  <div className="step-connector"></div>
                  <button
                    type="button"
                    className={`step-item-btn ${effectiveOAuthStep === 3 ? (isOAuthVerificationFailed ? "active active-failed" : "active active-success") : "pending"}`}
                    onClick={() => setActiveOAuthStep(3)}
                    disabled={!oauthSession}
                  >
                    <span className="step-circle">{isOAuthVerificationFailed ? "⚠️" : "3"}</span>
                    <span className="step-label">
                      {isOAuthVerificationFailed ? "Token Verification Failed" : "Authenticated Token Vault"}
                    </span>
                  </button>
                </div>

                {/* Step 1: Provider Catalog */}
                {effectiveOAuthStep === 1 && (
                  <div className="oauth-pre-auth-view">
                    {/* Enterprise 100+ Providers Ecosystem Catalog */}
                    <div className="oauth-provider-picker">
                      <div className="picker-header-row">
                        <div>
                          <label className="picker-title">Select Model Provider</label>
                          <span className="picker-subtext">Configure across 100+ enterprise AI model ecosystems</span>
                        </div>
                        <button
                          type="button"
                          className="btn-onboard-provider"
                          onClick={() => setIsOnboardingModalOpen(true)}
                        >
                          <span>➕ Onboard Custom Provider</span>
                        </button>
                      </div>

                      {/* Search & Category Filter Toolbar */}
                      <div className="provider-filter-toolbar">
                        <div className="provider-search-box">
                          <span className="search-icon">🔍</span>
                          <input
                            type="text"
                            className="provider-search-input"
                            placeholder="Search 100+ providers by name, family, CLI..."
                            value={providerSearchQuery}
                            onChange={(e) => setProviderSearchQuery(e.target.value)}
                          />
                          {providerSearchQuery && (
                            <button
                              type="button"
                              className="clear-search-btn"
                              onClick={() => setProviderSearchQuery("")}
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <div className="category-chips-row">
                          {categories.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              className={`category-chip-btn ${selectedCategory === cat.id ? "active" : ""}`}
                              onClick={() => setSelectedCategory(cat.id)}
                            >
                              <span className="cat-icon">{cat.icon}</span>
                              <span className="cat-name">{cat.name}</span>
                              <span className="cat-count">({cat.count})</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Responsive Grid of Providers */}
                      <div className="provider-cards-grid">
                        {filteredStrategies.map((preset) => (
                          <div
                            key={preset.id}
                            className={`provider-card ${selectedProviderId === preset.id ? "selected" : ""}`}
                            onClick={() => {
                              setSelectedProviderId(preset.id);
                              setActiveOAuthStep(2);
                            }}
                          >
                            <span className="provider-icon">{preset.icon}</span>
                            <div className="provider-info">
                              <span className="provider-name">{preset.name}</span>
                              <span className="provider-category-tag">{preset.category.toUpperCase()}</span>
                            </div>
                            {selectedProviderId === preset.id && <span className="provider-check">✔</span>}
                          </div>
                        ))}
                        {filteredStrategies.length === 0 && (
                          <div className="no-providers-match">
                            <span>No providers match "{providerSearchQuery}". Click "+ Onboard Custom Provider" to register a new one.</span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
                        <button
                          type="button"
                          className="btn-oauth-action btn-browser-auth"
                          onClick={() => setActiveOAuthStep(2)}
                        >
                          <span>Proceed to Browser Redirect & Consent (Step 2) ➔</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Browser Redirect & Handshake */}
                {effectiveOAuthStep === 2 && (
                  <div className="oauth-pre-auth-view">
                    <div className="oauth-redirect-callout enterprise-handshake-panel">
                      {/* Section 1: Handshake Header */}
                      <div className="handshake-header-row">
                        <div className="handshake-title-group">
                          <span className="callout-icon">{selectedStrategy.icon}</span>
                          <div>
                            <div className="title-with-badge">
                              <h4>OAuth Authorization Handshake</h4>
                              <span className="verified-status-chip">✔ {selectedStrategy.verifiedStatus}</span>
                            </div>
                            <p className="handshake-desc">
                              Authenticate with <strong>{selectedStrategy.name}</strong> to grant inference permissions for <strong>{targetModelId}</strong>.
                            </p>
                          </div>
                        </div>
                        {selectedStrategy.docsUrl && (
                          <a
                            href={selectedStrategy.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="upstream-docs-link"
                          >
                            📖 Upstream Docs ↗
                          </a>
                        )}
                      </div>

                      {/* Section 2: Account Category Selector (Individual vs Enterprise) */}
                      <div className="account-mode-container">
                        <div className="mode-header-label">
                          <span>Account Authentication Mode ({selectedStrategy.name})</span>
                          <span className="mode-subtag">CLI & OAuth 2.0 PKCE</span>
                        </div>

                        <div className="mode-cards-grid">
                          <button
                            type="button"
                            onClick={() => setAccountCategory("individual")}
                            className={`mode-card-btn ${accountCategory === "individual" ? "active" : ""}`}
                          >
                            <div className="mode-card-title">
                              <span>👤</span>
                              <strong>Individual Account (CLI)</strong>
                            </div>
                            <div className="mode-card-desc">
                              Personal account bearer authentication. No cloud project registration required.
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAccountCategory("enterprise")}
                            className={`mode-card-btn ${accountCategory === "enterprise" ? "active" : ""}`}
                          >
                            <div className="mode-card-title">
                              <span>🏢</span>
                              <strong>Enterprise Project (OAuth Web)</strong>
                            </div>
                            <div className="mode-card-desc">
                              Corporate consent flow with registered Client ID and Redirect URI.
                            </div>
                          </button>
                        </div>
                      </div>

                      {isClientIdMissingForRedirect && (
                        <div className="alert-banner error" style={{ marginTop: 12, marginBottom: 12 }}>
                          <span className="alert-icon">ℹ️</span>
                          <span className="alert-text">
                            Client ID is required to launch OAuth redirect. Add OAuth Client ID in Advanced OAuth 2.0 parameters to enable redirect.
                          </span>
                        </div>
                      )}

                      {/* Section 3: Computed Authorization URL */}
                      <div className="computed-url-box">
                        <div className="url-label-row">
                          <label>Computed Redirect Authorization URL</label>
                          <span className="url-info-tag">Endpoint: {oauthAuthUrl || selectedStrategy.authUrl}</span>
                        </div>
                        <div className="url-preview-wrapper">
                          <input type="text" className="url-preview-input" readOnly value={computedAuthorizationUrl} />
                          <button
                            type="button"
                            className="url-copy-btn"
                            disabled={!effectiveClientId}
                            onClick={() => {
                              navigator.clipboard.writeText(computedAuthorizationUrl);
                              setCopiedUrl(true);
                              setTimeout(() => setCopiedUrl(false), 2000);
                            }}
                          >
                            {copiedUrl ? "✔ Copied!" : "📋 Copy"}
                          </button>
                        </div>
                      </div>

                      {/* Local Container VCS & Credentials Directory Verification (Enabled by default) */}
                      <div className="vcs-container-audit-card" data-testid="vcs-container-audit-card">
                        <div className="vcs-audit-header">
                          <div className="vcs-badge-group">
                            <span className="vcs-icon">📁</span>
                            <span className="vcs-dir-label">{vcsAudit.directoryPath}</span>
                            <span className="vcs-status-tag">
                              {vcsAudit.isGitRepo ? "Git Tracking Active (In-Container)" : "Snapshot VCS Active"}
                            </span>
                            {vcsAudit.currentCommitHash && (
                              <span className="vcs-commit-tag">
                                commit: {vcsAudit.currentCommitHash.slice(0, 7)}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn-vcs-reverify"
                            onClick={() => triggerDirectoryVerification("manual-reverify")}
                            title="Verify directory state and check changed files locally"
                          >
                            🔄 Verify Directory & Diff
                          </button>
                        </div>
                        {vcsAudit.changedFiles.length > 0 && (
                          <div className="vcs-changed-files-row">
                            <span className="changed-label">Detected Changed File(s):</span>
                            {vcsAudit.changedFiles.map((f) => (
                              <code key={f} className="changed-file-pill">{f}</code>
                            ))}
                            <span className="vcs-sync-note">Synced to database for multi-account interaction</span>
                          </div>
                        )}
                      </div>

                      {/* Section 4: Action Buttons Toolbar */}
                      <div className="oauth-action-toolbar">
                        <button
                          type="button"
                          className="btn-oauth-action btn-cli-auth btn-launch-primary"
                          data-testid="btn-oauth-launch-browser"
                          onClick={handleExecuteCliLogin}
                          disabled={isCliLoggingIn || isRedirecting}
                        >
                          <span className="btn-icon">⚡</span>
                          <span>
                            {isCliLoggingIn || isRedirecting
                              ? "Opening Browser & Awaiting OAuth Consent..."
                              : `Launch Browser Sign-In (${selectedStrategy.cliCommand})`}
                          </span>
                        </button>

                        {cliScriptError && (
                          <div className="alert-banner error" data-testid="cli-script-error-banner" style={{ marginTop: "0.5rem" }}>
                            <span className="alert-icon">⚠️</span>
                            <div className="alert-text">
                              <strong>CLI Script Error ({cliScriptError.code || "FAILURE"}):</strong>
                              <div style={{ fontSize: "0.85rem", marginTop: "0.2rem", fontFamily: "monospace" }}>{cliScriptError.message}</div>
                            </div>
                            <button className="alert-close" onClick={() => setCliScriptError(null)}>×</button>
                          </div>
                        )}

                        {isWaitingForCallback && (
                          <div className="oauth-waiting-banner" data-testid="oauth-waiting-indicator">
                            <span className="waiting-spinner">⏳</span>
                            <div className="waiting-text">
                              <strong>Browser Opened for OAuth Sign-In</strong>
                              <span>Complete account sign-in in the launched browser tab. Loopback listening on port 8085...</span>
                            </div>
                          </div>
                        )}

                        {oauthSession && (
                          <button
                            type="button"
                            className="btn-oauth-action btn-return-vault"
                            onClick={() => setActiveOAuthStep(3)}
                          >
                            <span className="btn-icon">🔒</span>
                            <span>View Active Token Vault (Step 3) ➔</span>
                          </button>
                        )}
                      </div>

                      {/* Section: Authenticate Code from Browser (Direct Capture & Manual Submission) */}
                      <div className="browser-authcode-capture-card" data-testid="browser-authcode-card">
                        <div className="authcode-card-header">
                          <div className="header-title-row">
                            <span className="card-icon">🔑</span>
                            <div>
                              <h5>Authenticate Code from Browser</h5>
                              <span className="card-subtext">
                                Paste the code generated from the browser consent portal (e.g., https://antigravity.google/oauth-callback: &quot;Paste this code into your application to complete authentication&quot;)
                              </span>
                            </div>
                          </div>
                          {redirectAuthCode ? (
                            <span className="code-captured-tag">✔ Code Captured from Browser</span>
                          ) : (
                            <span className="code-waiting-tag">Awaiting Browser Redirect</span>
                          )}
                        </div>

                        <div className="authcode-input-row">
                          <div className="authcode-field-wrapper">
                            <input
                              type="text"
                              className="form-input authcode-text-input"
                              placeholder="Paste authorization code from browser (e.g. 4/0AUn6...)"
                              value={redirectAuthCode}
                              onChange={(e) => setRedirectAuthCode(e.target.value)}
                              spellCheck={false}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="btn-paste-code"
                              onClick={async () => {
                                if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
                                  try {
                                    const text = await navigator.clipboard.readText();
                                    if (text) setRedirectAuthCode(text.trim());
                                  } catch {}
                                }
                              }}
                              title="Paste authorization code directly from your system clipboard"
                            >
                              📋 Paste from Clipboard
                            </button>
                          </div>
                          <button
                            type="button"
                            className="btn-submit-authcode"
                            disabled={!redirectAuthCode.trim()}
                            onClick={() => handleCompleteOAuthExchange(redirectAuthCode)}
                          >
                            <span>⚡ Verify &amp; Save Auth Code</span>
                          </button>
                        </div>

                        {redirectAuthCode && (
                          <div className="authcode-synced-note">
                            <span>✔ Authenticate code captured from browser. Click &apos;Verify &amp; Save Auth Code&apos; to register bearer token in database.</span>
                          </div>
                        )}
                      </div>

                      {/* Section 5: Sleek Terminal CLI Banner */}
                      <div className="cli-terminal-hint">
                        <div className="terminal-prompt-row">
                          <span className="terminal-icon">$</span>
                          <code className="hint-command">{selectedStrategy.cliCommand}</code>
                        </div>
                        <button
                          type="button"
                          className="terminal-copy-btn"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedStrategy.cliCommand);
                            setCopiedCliCommand(true);
                            setTimeout(() => setCopiedCliCommand(false), 2000);
                          }}
                        >
                          {copiedCliCommand ? "✔ Copied!" : "📋 Copy Command"}
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Advanced OAuth Parameters */}
                    <details className="oauth-advanced-details">
                      <summary>Advanced OAuth 2.0 PKCE Parameters (Client ID, Secret, Endpoints)</summary>
                      <div className="advanced-fields-box">
                        <div className="form-row-2">
                          <div className="form-group">
                            <label>OAuth Client ID</label>
                            <input
                              type="text"
                              className="form-input"
                              value={oauthClientId}
                              onChange={(e) => setOauthClientId(e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>OAuth Client Secret (Optional for PKCE)</label>
                            <input
                              type="password"
                              className="form-input"
                              placeholder="Leave blank for public PKCE apps"
                              value={oauthClientSecret}
                              onChange={(e) => setOauthClientSecret(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="form-row-2">
                          <div className="form-group">
                            <label>Authorization Endpoint</label>
                            <input
                              type="text"
                              className="form-input"
                              value={oauthAuthUrl}
                              onChange={(e) => setOauthAuthUrl(e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>Token Endpoint</label>
                            <input
                              type="text"
                              className="form-input"
                              value={oauthTokenUrl}
                              onChange={(e) => setOauthTokenUrl(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label>Configured Scopes</label>
                          <input
                            type="text"
                            className="form-input"
                            value={oauthScopes}
                            onChange={(e) => setOauthScopes(e.target.value)}
                          />
                        </div>

                        <div className="form-action-row">
                          <button
                            type="button"
                            className="save-config-btn"
                            onClick={handleApplyOAuthClientConfiguration}
                            disabled={isApplyingOAuthClientConfig}
                          >
                            {isApplyingOAuthClientConfig ? "Applying OAuth Client Settings..." : "Apply OAuth Client Settings"}
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>
                )}

                {/* Step 3: Authenticated Token Vault */}
                {effectiveOAuthStep === 3 && oauthSession && (
                  <div className="oauth-authenticated-view">
                    <div className={`auth-success-card ${isOAuthVerificationFailed ? "verification-failed" : ""}`}>
                      <div className="auth-success-header">
                        <div className={`success-badge-pill ${isOAuthVerificationFailed ? "failed" : ""}`}>
                          <span className={`dot ${isOAuthVerificationFailed ? "failed-dot" : ""}`}></span>
                          <span>
                            {isOAuthVerificationFailed
                              ? "Authentication Verification Failed (HTTP 400)"
                              : "OAuth Session Active & Verified"}
                          </span>
                        </div>
                        <div className="header-action-group">
                          <button
                            type="button"
                            className="step-switch-btn"
                            onClick={() => setActiveOAuthStep(2)}
                            title="Return to Browser Redirect & Consent controls"
                          >
                            ↩ Redirect Controls
                          </button>
                          <button
                            type="button"
                            className="revoke-btn"
                            onClick={handleDisconnectOAuth}
                          >
                            Disconnect / Revoke
                          </button>
                        </div>
                      </div>

                      {/* Re-Authentication Alert Callout when Test Connection / Verification Fails */}
                      {isOAuthVerificationFailed && (
                        <div className="oauth-failure-alert-box">
                          <div className="failure-alert-title-row">
                            <span className="alert-icon">⚠️</span>
                            <strong>Identity Server Verification Failed</strong>
                          </div>
                          <p className="failure-alert-desc">
                            {testResult?.message || "Token rejected by identity server."}
                            {testResult?.errorMessage ? ` Diagnostic: ${testResult.errorMessage}` : ""}
                            {" "}Please re-authenticate below using Browser Redirect or CLI to acquire a fresh, valid bearer token.
                          </p>
                        </div>
                      )}

                      <div className="identity-banner">
                        <span className="provider-brand-icon">{selectedStrategy.icon}</span>
                        <div className="identity-info">
                          <span className="identity-provider">{oauthSession.providerName}</span>
                          <span className="identity-email">{oauthSession.authorizedUser}</span>
                          <span className="identity-sub">Authenticated Principal • Handshake at {oauthSession.authorizedTimestamp}</span>
                        </div>
                      </div>

                      {/* Local Container VCS & Credentials Directory Verification (Enabled by default) */}
                      <div className="vcs-container-audit-card" data-testid="vcs-container-audit-card-step3">
                        <div className="vcs-audit-header">
                          <div className="vcs-badge-group">
                            <span className="vcs-icon">📁</span>
                            <span className="vcs-dir-label">{vcsAudit.directoryPath}</span>
                            <span className="vcs-status-tag">
                              {vcsAudit.isGitRepo ? "Git Tracking Active (In-Container)" : "Snapshot VCS Active"}
                            </span>
                            {vcsAudit.currentCommitHash && (
                              <span className="vcs-commit-tag">
                                commit: {vcsAudit.currentCommitHash.slice(0, 7)}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn-vcs-reverify"
                            onClick={() => triggerDirectoryVerification("manual-reverify")}
                            title="Verify directory state and check changed files locally"
                          >
                            🔄 Verify Directory & Diff
                          </button>
                        </div>
                        {vcsAudit.changedFiles.length > 0 && (
                          <div className="vcs-changed-files-row">
                            <span className="changed-label">Detected Changed File(s):</span>
                            {vcsAudit.changedFiles.map((f) => (
                              <code key={f} className="changed-file-pill">{f}</code>
                            ))}
                            <span className="vcs-sync-note">Synced to database for multi-account interaction</span>
                          </div>
                        )}
                      </div>

                      {/* Session Action Toolbar for On-Demand Browser Re-Authentication */}
                      <div className="authenticated-session-toolbar">
                        <button
                          type="button"
                          className="btn-oauth-action btn-browser-auth"
                          onClick={handleInitiateBrowserRedirect}
                          disabled={isRedirecting}
                          title="Open browser to acquire a fresh OAuth 2.0 token"
                        >
                          <span className="btn-icon">🌐</span>
                          <span>
                            {isRedirecting
                              ? "Opening Browser..."
                              : `Launch Browser & Redirect (${selectedStrategy.name})`}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn-oauth-action btn-cli-auth"
                          onClick={handleExecuteCliLogin}
                          disabled={isCliLoggingIn}
                          title="Trigger CLI process to generate OAuth token"
                        >
                          <span className="btn-icon">⚡</span>
                          <span>{isCliLoggingIn ? "Running CLI Auth..." : "Run CLI Auth"}</span>
                        </button>
                        <button
                          type="button"
                          className="btn-oauth-action btn-step2-redirect"
                          onClick={() => setActiveOAuthStep(2)}
                          title="View redirect URL, OAuth parameters, and consent step"
                        >
                          <span className="btn-icon">📋</span>
                          <span>Redirect & Consent Step</span>
                        </button>
                      </div>

                      <div className="token-display-box">
                        <div className="token-header-row">
                          <label>Issued Bearer Access Token</label>
                          <button
                            type="button"
                            className="toggle-token-btn"
                            onClick={() => setShowAccessToken(!showAccessToken)}
                          >
                            {showAccessToken ? "🙈 Hide" : "👁 Show Token"}
                          </button>
                        </div>
                        <div className="token-value-wrapper">
                          <input
                            type={showAccessToken ? "text" : "password"}
                            className="token-input"
                            value={editableAccessToken}
                            onChange={(e) => {
                              setEditableAccessToken(e.target.value);
                              setTokenSaveSuccess(null);
                            }}
                            placeholder="Enter or paste Bearer access token..."
                          />
                          <button
                            type="button"
                            className="token-copy-btn"
                            title="Copy Token to clipboard"
                            onClick={() => {
                              navigator.clipboard.writeText(editableAccessToken);
                              alert("Access token copied to clipboard!");
                            }}
                          >
                            📋
                          </button>
                          <button
                            type="button"
                            className="token-save-btn"
                            title="Save edited token to database"
                            disabled={isSavingToken || !editableAccessToken.trim()}
                            onClick={handleSaveEditedToken}
                          >
                            {isSavingToken ? "Saving..." : "💾 Save Token"}
                          </button>
                        </div>
                        {tokenSaveSuccess && (
                          <div className="token-save-status-msg">
                            ✔ {tokenSaveSuccess}
                          </div>
                        )}
                        {oauthSession.authCode && (
                          <div className="authcode-meta-box">
                            <div className="authcode-header">
                              <label>Captured Authorization Code</label>
                              <span className="authcode-badge">Saved in DB Against Account</span>
                            </div>
                            <div className="authcode-wrapper">
                              <input
                                type="text"
                                className="authcode-input"
                                readOnly
                                value={oauthSession.authCode}
                              />
                              <button
                                type="button"
                                className="token-copy-btn"
                                title="Copy Authorization Code"
                                onClick={() => {
                                  navigator.clipboard.writeText(oauthSession.authCode || "");
                                  alert("Authorization code copied to clipboard!");
                                }}
                              >
                                📋
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="token-meta-row">
                        <div className="meta-card">
                          <span className="meta-label">Refresh Token</span>
                          <span className="meta-value valid">Active (Auto-refresh enabled)</span>
                        </div>
                        <div className="meta-card">
                          <span className="meta-label">Expires In</span>
                          <span className="meta-value timer">59m 58s (3600s)</span>
                        </div>
                        <div className="meta-card">
                          <span className="meta-label">Token Type</span>
                          <span className="meta-value">Bearer (HTTP RFC 6750)</span>
                        </div>
                      </div>

                      <div className="granted-scopes-section">
                        <label className="scopes-title">Granted OAuth Scopes</label>
                        <div className="scopes-chips-list">
                          {oauthSession.scopes.map((s, idx) => (
                            <span key={idx} className="scope-chip">
                              ✔ {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* 3. CLI BINARY TAB                                             */}
            {/* ============================================================= */}
            {selectedProtocol === "cli" && (
              <div className="protocol-fields-container">
                <div className="protocol-badge-intro cli-intro">
                  <span className="badge-icon">💻</span>
                  <div>
                    <strong>Local & Headless Container CLI Execution</strong>
                    <p>Execute queries through native command-line binaries on host / container PATH.</p>
                  </div>
                </div>

                <div className="cli-terminal-status-card">
                  <div className="status-row">
                    <span className="cli-name">Executable: <code>{cliExecutable}</code></span>
                    <span className="cli-path-badge">PATH: /opt/model-connector/npm/bin/{cliExecutable}</span>
                    <span className="cli-status-badge">Available</span>
                  </div>
                  <div className="cli-code-preview">
                    <code>$ {cliExecutable} {cliArgs}</code>
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>CLI Binary Command</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. gemini, claude, ollama"
                      value={cliExecutable}
                      onChange={(e) => setCliExecutable(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Default Arguments</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={`e.g. -m ${ModelConstants.DEFAULT_MODEL_ID} --non-interactive -o json`}
                      value={cliArgs}
                      onChange={(e) => setCliArgs(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Subprocess Working Directory</label>
                  <input
                    type="text"
                    className="form-input"
                    value={cliWorkingDir}
                    onChange={(e) => setCliWorkingDir(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* 4. COOKIE VAULT TAB                                           */}
            {/* ============================================================= */}
            {selectedProtocol === "cookie" && (
              <div className="protocol-fields-container">
                <div className="protocol-badge-intro cookie-intro">
                  <span className="badge-icon">🍪</span>
                  <div>
                    <strong>Encrypted Cookie Session Lineage</strong>
                    <p>Inject HTTP cookie headers to maintain stateful authorization sessions.</p>
                  </div>
                </div>

                <div className="form-group">
                  <label>Raw Cookie String / Session Tokens</label>
                  <textarea
                    className="form-textarea code-font"
                    rows={4}
                    placeholder="session_id=...; auth_token=...; __Secure-1PSID=..."
                    value={cookieString}
                    onChange={(e) => setCookieString(e.target.value)}
                    required={selectedProtocol === "cookie"}
                  />
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Target Domain</label>
                    <input
                      type="text"
                      className="form-input"
                      value={cookieDomain}
                      onChange={(e) => setCookieDomain(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Path</label>
                    <input
                      type="text"
                      className="form-input"
                      value={cookiePath}
                      onChange={(e) => setCookiePath(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Structured Verification Prompt & Form Actions */}
            <div className="form-group" style={{ marginTop: "16px" }}>
              <label>Connection Verification Prompt (Structured Output Test)</label>
              <input
                type="text"
                className="form-input"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
              />
            </div>

            <div className="form-action-row">
              <button
                type="button"
                className="test-handshake-btn"
                onClick={handleTestCurrentConfig}
                disabled={isTesting}
              >
                {isTesting ? "Testing Handshake..." : "⚡ Test Connection"}
              </button>

              {editingAccountId && (
                <button
                  type="button"
                  className="test-handshake-btn"
                  style={{ background: "rgba(239, 68, 68, 0.2)", borderColor: "rgba(239, 68, 68, 0.4)", color: "#fca5a5" }}
                  onClick={() => {
                    setEditingAccountId(null);
                    setAccountName("");
                    setUserEmail("");
                  }}
                >
                  ✕ New Account
                </button>
              )}

              <button
                type="submit"
                className="save-config-btn"
                disabled={isSaving}
              >
                {isSaving
                  ? "Saving Configuration..."
                  : editingAccountId
                    ? "💾 Update & Activate Configuration"
                    : "💾 Save & Activate Configuration"}
              </button>
            </div>
          </form>

          {/* Test Connection Results Feedback Panel */}
          {testResult && (
            <div className={`test-feedback-panel ${testResult.status.toLowerCase()}`}>
              <div className="feedback-header">
                <span className="status-badge">{testResult.status}</span>
                <span className="protocol-badge">{testResult.protocol.toUpperCase()}</span>
                <span className="latency-badge">{testResult.latencyMs}ms</span>
              </div>
              <p className="feedback-message">{testResult.message}</p>
              {testResult.modelOutput && (
                <div className="model-output-box">
                  <span className="output-label">Model Verification Response:</span>
                  <pre className="output-content">{testResult.modelOutput}</pre>
                </div>
              )}
              {testResult.errorMessage && (
                <div className="error-box">
                  <span className="error-label">Execution Diagnostic Error:</span>
                  <p>{testResult.errorMessage}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Existing Configured Accounts Catalog */}
        <div className="config-catalog-card">
          <div className="card-header">
            <span className="card-icon">📂</span>
            <h3>Existing Configured Accounts</h3>
            <span className="count-badge">{state.modelAccounts.length}</span>
          </div>

          <div className="credentials-list">
            {state.modelAccounts.map((acc) => (
              <div key={acc.accountId} className={`credential-item-card ${acc.isActive ? "active" : ""}`}>
                <div className="card-top-row">
                  <div className="model-chip-title">
                    <span className="model-name-text">{acc.modelId}</span>
                    <span className={`auth-badge ${acc.authType}`}>
                      {acc.authType === "api" || acc.authType === "api_key"
                        ? "REST API"
                        : acc.authType === "cli" || acc.authType === "cli_oauth"
                        ? "CLI"
                        : acc.authType === "oauth"
                        ? "OAuth 2.0"
                        : "Cookie"}
                    </span>
                  </div>
                  {/* Interactive Status Toggle Switch */}
                  <div className="account-status-toggle-wrapper">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={acc.isActive}
                      className={`status-switch ${acc.isActive ? "is-active" : "is-inactive"}`}
                      onClick={() => handleToggleAccountStatus(acc)}
                      title={acc.isActive ? "Account is ACTIVE. Click to deactivate." : "Account is INACTIVE. Click to activate."}
                    >
                      <span className="switch-slider">
                        <span className="switch-knob" />
                      </span>
                      <span className="switch-text">{acc.isActive ? "Active" : "Inactive"}</span>
                    </button>
                  </div>
                </div>

                <div className="account-details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Account Label:</span>
                    <span className="detail-val" title={acc.accountName}>{acc.accountName}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Owner:</span>
                    <span className="detail-val" title={acc.userEmail}>{acc.userEmail}</span>
                  </div>
                  <div className="detail-item full-span">
                    <span className="detail-label">Credential:</span>
                    <code className="credential-code-val" title={acc.maskedCredential}>{acc.maskedCredential}</code>
                  </div>
                </div>

                <div className="card-action-bar">
                  <button
                    type="button"
                    className="action-btn test-btn"
                    onClick={() => handleTestExistingAccount(acc)}
                    disabled={testingAccountId === acc.accountId}
                    title="Test connection for this account"
                  >
                    {testingAccountId === acc.accountId ? "Testing..." : "⚡ Test"}
                  </button>

                  {/* Interactive Toggle Button for Active / Inactive */}
                  <button
                    type="button"
                    className={`action-btn toggle-status-btn ${acc.isActive ? "btn-active-state" : "btn-inactive-state"}`}
                    onClick={() => handleToggleAccountStatus(acc)}
                    title={acc.isActive ? "Account is active. Click to deactivate." : "Account is inactive. Click to set active."}
                  >
                    <span className={`toggle-dot ${acc.isActive ? "on" : "off"}`} />
                    <span>{acc.isActive ? "Active" : "Set Active"}</span>
                  </button>

                  <button
                    type="button"
                    className="action-btn select-btn"
                    onClick={() => {
                      setEditingAccountId(acc.accountId);
                      setTargetModelId(acc.modelId);
                      setAccountName(acc.accountName);
                      setUserEmail(acc.userEmail);
                      if (acc.authType === "api" || acc.authType === "api_key") {
                        setSelectedProtocol("api");
                        setApiKey(acc.credentialValue);
                      } else if (acc.authType === "oauth" || acc.authType === "cli_oauth") {
                        const accStrategy = oauthProviderRegistry.findStrategyForModel(acc.modelId);
                        setSelectedProtocol("oauth");
                        setOauthSession({
                          providerId: accStrategy.id,
                          providerName: accStrategy.name,
                          accessToken: acc.credentialValue,
                          expiresInSeconds: 3600,
                          scopes: accStrategy.defaultScopes.split(" ").filter(Boolean),
                          authorizedUser: acc.userEmail,
                          authorizedTimestamp: acc.createdTimestamp,
                        });
                      } else if (acc.authType === "cli") {
                        setSelectedProtocol("cli");
                      } else if (acc.authType === "cookie") {
                        setSelectedProtocol("cookie");
                        setCookieString(acc.credentialValue);
                      }
                    }}
                    title="Load this account into the form editor"
                  >
                    ✏️ Load
                  </button>

                  <button
                    type="button"
                    className="action-btn delete-btn"
                    onClick={() => handleOpenDeleteModal(acc)}
                    title="Delete this credential"
                  >
                    🗑️ Delete
                  </button>
                </div>

                {accountTestResults[acc.accountId] && (
                  <div className={`account-test-result-panel ${accountTestResults[acc.accountId].status.toLowerCase()}`}>
                    <div className="res-header">
                      <span className="res-pill">{accountTestResults[acc.accountId].status}</span>
                      <span className="res-latency">{accountTestResults[acc.accountId].latencyMs}ms</span>
                    </div>
                    <div className="res-msg">{accountTestResults[acc.accountId].message}</div>
                    {accountTestResults[acc.accountId].modelOutput && (
                      <pre className="res-output">{accountTestResults[acc.accountId].modelOutput}</pre>
                    )}
                    {accountTestResults[acc.accountId].errorMessage && (
                      <div className="res-error">{accountTestResults[acc.accountId].errorMessage}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 5. ONBOARD NEW MODEL PROVIDER MODAL                           */}
      {/* ============================================================= */}
      {isOnboardingModalOpen && (
        <div className="onboard-provider-modal-overlay">
          <div className="onboard-provider-modal-card">
            <div className="modal-header">
              <div className="title-group">
                <span className="modal-icon">➕</span>
                <h3>Onboard New Model Provider</h3>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setIsOnboardingModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <p className="modal-desc">
              Register a new frontier, silicon accelerator, or custom OIDC model provider into your platform catalog.
            </p>

            <form onSubmit={handleOnboardNewProvider} className="onboard-form">
              <div className="form-row-2">
                <div className="form-group">
                  <label>Provider Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Perplexity Pro, vLLM Cluster, Internal LLM"
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Unique Provider Identifier (ID)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. perplexity, vllm-cluster, internal-llm"
                    value={newProviderId}
                    onChange={(e) => setNewProviderId(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Category Tier</label>
                  <select
                    className="form-select"
                    value={newProviderCategory}
                    onChange={(e) => setNewProviderCategory(e.target.value as ProviderCategory)}
                  >
                    <option value="frontier">🌟 Frontier & Cloud Giants</option>
                    <option value="accelerator">⚡ Silicon Accelerators</option>
                    <option value="opensource">🦙 Open Source & Local</option>
                    <option value="specialized">🌿 Specialized Ecosystems</option>
                    <option value="developer">🛠️ Developer & Agents</option>
                    <option value="enterprise">🛡️ Enterprise OIDC</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>CLI Command</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. perplexity login, vllm auth"
                    value={newCliCommand}
                    onChange={(e) => setNewCliCommand(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>OAuth 2.0 Authorization Endpoint</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://auth.provider.com/oauth/authorize"
                    value={newAuthUrl}
                    onChange={(e) => setNewAuthUrl(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>OAuth 2.0 Token Endpoint</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://auth.provider.com/oauth/token"
                    value={newTokenUrl}
                    onChange={(e) => setNewTokenUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Default OAuth Scopes</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="openid profile email"
                    value={newDefaultScopes}
                    onChange={(e) => setNewDefaultScopes(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Client ID (Public / Registered)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. modelbox-app-client"
                    value={newClientId}
                    onChange={(e) => setNewClientId(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Documentation URL (Optional)</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://docs.provider.com/get-started"
                  value={newDocsUrl}
                  onChange={(e) => setNewDocsUrl(e.target.value)}
                />
              </div>

              <div className="modal-action-row">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => setIsOnboardingModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-submit-btn"
                >
                  🚀 Register & Onboard Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Record Confirmation Modal */}
      <DeleteRecordModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        account={accountToDelete}
        isDeleting={isDeletingAccount}
      />
    </div>
  );
};
