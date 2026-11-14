import React, { useState, useEffect, useMemo } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import type {
  StagedIntegrationAccount,
  UiModel,
  UiModelAccount,
  UiIntegration,
  UpsertIntegrationPayload,
  StrategyMode,
  TestConnectionResult,
  UiModelOAuthConfig,
} from "@/types/ui.types";
import { ApiService } from "@/utils/services/apiService";
import { resolveIntegrationCrudPermissions } from "@/utils/auth/rbacPermissions";
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
  sanitizeOAuthRedirectUrl,
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
import { PageHeader, StatCard, StatCardGrid } from "@/components/common";
import {
  IntegrationDetailView,
  type IntegrationDetailTab,
} from "@/components/integrations/IntegrationDetailView";
import { IntegrationOnboardingView } from "@/components/integrations/IntegrationOnboardingView";

interface IntegrationsPageProps {
  readonly state: ModelConnectorState;
  readonly externalSearchQuery?: string;
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

interface ParsedModelOutput {
  readonly hasSplit: boolean;
  readonly metaText: string;
  readonly promptText: string;
  readonly responseText: string;
}

function parseStructuredModelOutput(output?: string): ParsedModelOutput | null {
  if (!output) return null;
  const promptMatch = output.match(/Prompt(?:\s*\(Request\))?:\s*([\s\S]*?)(?=\n\s*Response:|$)/i);
  const responseMatch = output.match(/Response:\s*([\s\S]*)$/i);
  if (promptMatch && responseMatch) {
    const metaText = output.split(/Prompt(?:\s*\(Request\))?:/i)[0].trim();
    return {
      hasSplit: true,
      metaText,
      promptText: promptMatch[1].trim(),
      responseText: responseMatch[1].trim(),
    };
  }
  return {
    hasSplit: false,
    metaText: "",
    promptText: "",
    responseText: output,
  };
}

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({
  state,
  externalSearchQuery = "",
}) => {
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
  const [isVerifyingAuthCode, setIsVerifyingAuthCode] = useState(false);
  const [pastedFeedback, setPastedFeedback] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCliCommand, setCopiedCliCommand] = useState(false);
  const [selectedGoogleCli, setSelectedGoogleCli] = useState<"antigravity" | "gemini">("antigravity");

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
  const [cliTimeoutSecondsRemaining, setCliTimeoutSecondsRemaining] = useState<number | null>(null);
  const [timerOriginTab, setTimerOriginTab] = useState<string | null>(null);

  const cleanAccountDisplayName = (name: string, email?: string): string => {
    if (!name) return name;
    if (!email) return name.replace(/\s*\([^)]*@[^)]*\)/g, "").trim();
    return name.replace(new RegExp(`\\s*\\(?${email}\\)?`, "gi"), "").replace(/\s*\([^)]*@[^)]*\)/g, "").trim() || name;
  };

  useEffect(() => {
    if (cliTimeoutSecondsRemaining === null) return;
    if (cliTimeoutSecondsRemaining <= 0) {
      setActionError("CLI OAuth authentication timed out (300s limit exceeded). Authorization code was not provided within the 300-second window. Please click 'Run CLI Authentication' again.");
      setIsWaitingForCallback(false);
      return;
    }
    const timer = setTimeout(() => {
      setCliTimeoutSecondsRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cliTimeoutSecondsRemaining]);

  useEffect(() => {
    if (oauthSession?.accessToken) {
      setEditableAccessToken(oauthSession.accessToken);
    }
  }, [oauthSession?.accessToken]);

  // Testing & Status
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [testPrompt, setTestPrompt] = useState<string>("Hi , whats date time now ?");
  const [modelEffortTier, setModelEffortTier] = useState<"low" | "medium" | "high">("medium");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
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

  // View Mode: "card" (Integration Hub Grid) | "list" | "form" (Detail View)
  const [viewMode, setViewMode] = useState<ViewType>("card");
  const [formMode, setFormMode] = useState<FormMode>("save");
  const [detailTab, setDetailTab] = useState<IntegrationDetailTab>("overview");
  const [showProtocolEditor, setShowProtocolEditor] = useState<boolean>(false);
  const [onboardingPageMode, setOnboardingPageMode] = useState<"closed" | "create" | "edit">("closed");
  const [editingIntegration, setEditingIntegration] = useState<UiIntegration | undefined>(undefined);
  const [customIntegrations, setCustomIntegrations] = useState<UiIntegration[]>([]);
  const [isSubmittingIntegration, setIsSubmittingIntegration] = useState<boolean>(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [modelFilterSearch, setModelFilterSearch] = useState<string>(externalSearchQuery);
  const [modelFamilyFilter, setModelFamilyFilter] = useState<string>("all");
  const [connectionStatusFilter, setConnectionStatusFilter] = useState<
    "all" | "connected" | "not-connected" | "attention"
  >("all");
  const [modelGroupBy, setModelGroupBy] = useState<"family" | "none">("family");

  const rbac = useMemo(
    () => resolveIntegrationCrudPermissions(state.currentUser),
    [state.currentUser],
  );

  useEffect(() => {
    void ApiService.listIntegrations().then((items) => {
      setCustomIntegrations(items);
    });
  }, []);

  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setModelFilterSearch(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  // Deletion Confirmation Modal State
  const [accountToDelete, setAccountToDelete] = useState<UiModelAccount | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Existing Configured Accounts Display State (Default to current model & List view)
  const [filterToCurrentModel, setFilterToCurrentModel] = useState<boolean>(true);
  const [accountsViewMode, setAccountsViewMode] = useState<"list" | "card">("list");

  // Chat Choice Modal State (Start fresh session vs resume existing)
  const [isChatChoiceModalOpen, setIsChatChoiceModalOpen] = useState<boolean>(false);
  const [chatTargetModel, setChatTargetModel] = useState<string>(targetModelId);

  // Requirement 4: Inside create/edit, list of available models must be fetched once authentication is done successful
  const isAuthSuccessful = useMemo(() => {
    if (editingAccountId) return true;
    if (selectedProtocol === "oauth" && Boolean(oauthSession?.accessToken)) return true;
    if (testResult && testResult.status === "VERIFIED") return true;
    if (state.modelAccounts.some((a) => a.modelId === targetModelId)) return true;
    if (
      targetModelId.toLowerCase().includes("ollama") ||
      targetModelId.toLowerCase().includes("llama") ||
      targetModelId.toLowerCase().includes("deepseek") ||
      targetModelId.toLowerCase().includes("comfyui")
    ) {
      return true;
    }
    return false;
  }, [editingAccountId, selectedProtocol, oauthSession, testResult, state.modelAccounts, targetModelId]);

  useEffect(() => {
    if (isAuthSuccessful) {
      void state.refreshData();
    }
  }, [isAuthSuccessful]);

  // Requirement 3 & 4: Only show registered models and models available in use like Ollama
  // When not yet authenticated, shows current target with pending state until auth unlocks available models
  const availableConfigModels = useMemo(() => {
    if (formMode === "create") {
      const selectedModelObj = state.models.find(
        (m) => m.id.toLowerCase() === targetModelId.toLowerCase(),
      );
      return selectedModelObj
        ? [{ ...selectedModelObj, name: isAuthSuccessful ? `${selectedModelObj.name} (Discovered)` : `${selectedModelObj.name} (New Connection)` }]
        : [{ id: targetModelId, name: `${targetModelId} (New Connection)`, family: "New Connection" }];
    }

    if (editingAccountId) {
      const editingAccount = state.modelAccounts.find((a) => a.accountId === editingAccountId);
      const selectedModelObj = state.models.find(
        (m) => m.id.toLowerCase() === targetModelId.toLowerCase(),
      );
      const statusLabel = editingAccount?.isActive ? "Active" : "Inactive";
      return selectedModelObj
        ? [{ ...selectedModelObj, name: `${selectedModelObj.name} (${statusLabel})` }]
        : [{ id: targetModelId, name: `${targetModelId} (${statusLabel})`, family: statusLabel }];
    }

    const hasConfiguredAccount = state.modelAccounts.some(
      (a) => a.modelId.toLowerCase() === targetModelId.toLowerCase(),
    );
    if (!isAuthSuccessful && !hasConfiguredAccount) {
      const selectedModelObj = state.models.find(
        (m) => m.id.toLowerCase() === targetModelId.toLowerCase(),
      );
      return selectedModelObj
        ? [{ ...selectedModelObj, name: `${selectedModelObj.name} (Pending Authentication)` }]
        : [{ id: targetModelId, name: `${targetModelId} (Pending Authentication)`, family: "Pending Auth" }];
    }

    const providerFamily = selectedProviderId.toLowerCase();
    return state.models
      .filter((m) => {
        const isRegistered = state.modelAccounts.some((a) => a.modelId === m.id);
        const isOllama =
          m.family?.toLowerCase().includes("ollama") ||
          m.id.toLowerCase().includes("llama") ||
          m.id.toLowerCase().includes("ollama") ||
          m.id.toLowerCase().includes("deepseek");
        const matchesProvider =
          m.family?.toLowerCase().includes(providerFamily) ||
          m.id.toLowerCase().includes(providerFamily);
        return isRegistered || isOllama || matchesProvider;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [formMode, editingAccountId, isAuthSuccessful, state.models, state.modelAccounts, targetModelId, selectedProviderId]);

  const handleInitiateChat = (modelId: string) => {
    setChatTargetModel(modelId);
    if (state.messages.length > 0 || state.sessions.length > 0) {
      setIsChatChoiceModalOpen(true);
    } else {
      state.setSelectedModel(modelId);
      state.handleNewSession();
      state.setActiveTab("chat");
    }
  };

  const handleStartFreshChat = () => {
    state.setSelectedModel(chatTargetModel);
    state.handleNewSession();
    setIsChatChoiceModalOpen(false);
    state.setActiveTab("chat");
  };

  const handleResumeExistingChat = () => {
    state.setSelectedModel(chatTargetModel);
    setIsChatChoiceModalOpen(false);
    state.setActiveTab("chat");
  };

  const loadAccountIntoEditor = (acc: UiModelAccount) => {
    setEditingAccountId(acc.accountId);
    setTargetModelId(acc.modelId);
    state.setSelectedModel(acc.modelId);
    setAccountName(acc.accountName);
    setUserEmail(acc.userEmail);
    setViewMode("form");
    setFormMode("save");
    setDetailTab("connections");
    setShowProtocolEditor(true);
    state.setActiveTab("model-config", { view: "form", model: acc.modelId, account: acc.accountId });
    if (acc.authType === "api" || acc.authType === "api_key") {
      setSelectedProtocol("api");
      setApiKey(acc.credentialValue);
    } else if (acc.authType === "oauth" || acc.authType === "cli_oauth") {
      const accStrategy = oauthProviderRegistry.findStrategyForModel(acc.modelId);
      setSelectedProtocol("oauth");
      setAccountCategory(acc.authType === "cli_oauth" ? "individual" : "enterprise");
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
      setAccountCategory("individual");
    } else if (acc.authType === "cookie") {
      setSelectedProtocol("cookie");
      setCookieString(acc.credentialValue);
    }
  };

  useEffect(() => {
    if (state.routeParams.view === "onboard") {
      setOnboardingPageMode(state.routeParams.mode === "edit" ? "edit" : "create");
    } else if (state.routeParams.view) {
      setOnboardingPageMode("closed");
      setViewMode(state.routeParams.view as ViewType);
    }
    if (state.routeParams.model) {
      setTargetModelId(state.routeParams.model);
    }
    if (state.routeParams.mode === "create") {
      setFormMode("create");
      setEditingAccountId(null);
    } else if (state.routeParams.mode === "save") {
      setFormMode("save");
    }
    if (state.routeParams.mode !== "create" && state.routeParams.account && state.modelAccounts.length > 0) {
      const match = state.modelAccounts.find((a) => a.accountId === state.routeParams.account);
      if (match && editingAccountId !== match.accountId) {
        loadAccountIntoEditor(match);
      }
    }
  }, [state.routeParams, state.modelAccounts]);

  const openModelSaveView = (modelId: string) => {
    setTargetModelId(modelId);
    state.setSelectedModel(modelId);
    setFormMode("save");
    setViewMode("form");
    setDetailTab("overview");
    setShowProtocolEditor(false);
    state.setActiveTab("model-config", { view: "form", model: modelId, mode: "save" });
    setActionSuccess(null);
    setActionError(null);
  };

  const openIntegrationOnboardCreatePage = () => {
    if (!rbac.canCreate) {
      setActionError(
        `🔒 RBAC Policy Denied: Role '${rbac.roleName}' does not have 'integrations:create' permission.`,
      );
      return;
    }
    setEditingIntegration(undefined);
    setOnboardingError(null);
    setOnboardingPageMode("create");
    state.setActiveTab("model-config", { view: "onboard", mode: "create" });
    setActionSuccess(null);
    setActionError(null);
  };

  const openIntegrationOnboardEditPage = (integ: UiIntegration) => {
    if (!rbac.canUpdate) {
      setActionError(
        `🔒 RBAC Policy Denied: Role '${rbac.roleName}' does not have 'integrations:update' permission.`,
      );
      return;
    }
    setEditingIntegration(integ);
    setOnboardingError(null);
    setOnboardingPageMode("edit");
    state.setActiveTab("model-config", {
      view: "onboard",
      mode: "edit",
      model: integ.integrationId,
    });
    setActionSuccess(null);
    setActionError(null);
  };

  const handleIntegrationSubmit = async (
    payload: UpsertIntegrationPayload,
    stagedAccounts: readonly StagedIntegrationAccount[],
    removedAccountIds: readonly string[],
  ) => {
    setIsSubmittingIntegration(true);
    setOnboardingError(null);
    try {
      const saved =
        onboardingPageMode === "edit" && editingIntegration
          ? await ApiService.updateIntegration(editingIntegration.integrationId, payload)
          : await ApiService.createIntegration(payload);

      for (const remId of removedAccountIds) {
        await ApiService.deleteModelAccount(saved.integrationId, remId);
      }

      for (const acc of stagedAccounts) {
        const accountPayload = {
          accountName: acc.accountName,
          userEmail: acc.userEmail,
          authType: acc.authType,
          credentialValue: acc.credentialValue || "configured",
          isActive: acc.isActive,
          config: { ...acc.config, effortTier: acc.effortTier },
        };
        if (acc.isPersisted) {
          await ApiService.updateModelAccount(saved.integrationId, acc.accountId, accountPayload);
        } else {
          await ApiService.createModelAccount(saved.integrationId, accountPayload);
        }
      }

      await state.refreshModelAccounts();

      setCustomIntegrations((prev) => {
        const filtered = prev.filter((item) => item.integrationId !== saved.integrationId);
        return [...filtered, saved];
      });

      oauthProviderRegistry.registerCustomProvider(
        new DynamicOnboardedOAuthStrategy({
          id: saved.integrationId,
          name: saved.providerName,
          icon: saved.icon || "🧩",
          brandColor: saved.brandColor || "#2563EB",
          category: "enterprise",
          authUrl: saved.authUrl || "https://example.com/oauth/authorize",
          tokenUrl: saved.tokenUrl || "https://example.com/oauth/token",
          defaultScopes: "read write",
          cliCommand: saved.cliCommand || `${saved.integrationId} auth login`,
          description: saved.description || `${saved.providerName} integration`,
          defaultClientId: `${saved.integrationId}-client`,
          docsUrl: saved.docsUrl || "",
        }),
      );
      setAvailableStrategies(oauthProviderRegistry.getAllStrategies());

      setOnboardingPageMode("closed");
      setViewMode("card");
      state.setActiveTab("model-config", { view: "card" });
      setActionSuccess(
        onboardingPageMode === "edit"
          ? `✅ Integration '${saved.providerName}' updated with ${stagedAccounts.length} configured account(s).`
          : `✅ Integration '${saved.providerName}' onboarded with ${stagedAccounts.length} configured account(s).`,
      );
    } catch (err: unknown) {
      setOnboardingError(err instanceof Error ? err.message : "Failed to save integration.");
    } finally {
      setIsSubmittingIntegration(false);
    }
  };

  const handleIntegrationDelete = async (integrationId: string) => {
    if (!rbac.canDelete) {
      setActionError(
        `🔒 RBAC Policy Denied: Role '${rbac.roleName}' does not have 'integrations:delete' permission.`,
      );
      return;
    }
    setIsSubmittingIntegration(true);
    setOnboardingError(null);
    try {
      await ApiService.deleteIntegration(integrationId);
      setCustomIntegrations((prev) => prev.filter((item) => item.integrationId !== integrationId));
      setOnboardingPageMode("closed");
      setViewMode("card");
      state.setActiveTab("model-config", { view: "card" });
      setActionSuccess(`🗑️ Integration '${integrationId}' removed from catalog.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete integration.";
      setOnboardingError(msg);
      setActionError(msg);
    } finally {
      setIsSubmittingIntegration(false);
    }
  };

  const handleDiscard = () => {
    setOnboardingPageMode("closed");
    setViewMode("card");
    setShowProtocolEditor(false);
    setEditingAccountId(null);
    state.setActiveTab("model-config", { view: "card" });
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

  const activeAccountModelIds = useMemo(() => {
    const ids = new Set<string>();
    for (const acc of state.modelAccounts || []) {
      if (acc.isActive) ids.add(acc.modelId);
    }
    return ids;
  }, [state.modelAccounts]);

  const mergedCatalogModels = useMemo<UiModel[]>(() => {
    const existingIds = new Set(state.models.map((m) => m.id));
    const customAsModels: UiModel[] = customIntegrations
      .filter((integ) => !existingIds.has(integ.integrationId))
      .map((integ) => ({
        id: integ.integrationId,
        name: integ.providerName,
        family: integ.integrationId,
        tier: integ.accountCategory === "individual" ? "freeware" : "paid",
        supportedStrategies: (integ.supportedProtocols.length > 0
          ? integ.supportedProtocols
          : ["api"]) as StrategyMode[],
        status: integ.lifecycleStatus === "INACTIVE" ? "DEPRECATED" : "ACTIVE",
        description: integ.description || `${integ.providerName} (${integ.category})`,
      }));
    return [...state.models, ...customAsModels];
  }, [state.models, customIntegrations]);

  const integrationMetrics = useMemo(() => {
    const connected = mergedCatalogModels.filter((m) => activeAccountModelIds.has(m.id)).length;
    const attention = mergedCatalogModels.filter((m) => m.status === "DEPRECATED").length;
    const notConnected = Math.max(0, mergedCatalogModels.length - connected - attention);
    const activeConnections = (state.modelAccounts || []).filter((a) => a.isActive).length;
    return {
      total: mergedCatalogModels.length,
      connected,
      notConnected,
      attention,
      activeConnections,
    };
  }, [mergedCatalogModels, state.modelAccounts, activeAccountModelIds]);

  const filteredModelsForView = useMemo(() => {
    const byFamilyAndSearch = modelFilterStrategy.filter(mergedCatalogModels, {
      searchQuery: modelFilterSearch,
      family: modelFamilyFilter,
    });
    if (connectionStatusFilter === "connected") {
      return byFamilyAndSearch.filter((m) => activeAccountModelIds.has(m.id));
    }
    if (connectionStatusFilter === "not-connected") {
      return byFamilyAndSearch.filter(
        (m) => !activeAccountModelIds.has(m.id) && m.status !== "DEPRECATED",
      );
    }
    if (connectionStatusFilter === "attention") {
      return byFamilyAndSearch.filter((m) => m.status === "DEPRECATED");
    }
    return byFamilyAndSearch;
  }, [
    mergedCatalogModels,
    modelFilterSearch,
    modelFamilyFilter,
    connectionStatusFilter,
    activeAccountModelIds,
  ]);

  const hasActiveFilters = Boolean(
    modelFilterSearch.trim() || modelFamilyFilter !== "all" || connectionStatusFilter !== "all",
  );

  const handleClearAllFilters = () => {
    setModelFilterSearch("");
    setModelFamilyFilter("all");
    setConnectionStatusFilter("all");
  };

  const currentModelObj = mergedCatalogModels.find((m) => m.id === targetModelId);
  const currentCustomIntegration = customIntegrations.find(
    (integ) => integ.integrationId === targetModelId,
  );
  const currentModelTitle = currentModelObj?.name || targetModelId;

  // Stably sorted accounts with model filtering (STD-COD-006, STD-COD-007)
  const currentModelAccountsCount = useMemo(() => {
    return (state.modelAccounts || []).filter((a) => a.modelId === targetModelId).length;
  }, [state.modelAccounts, targetModelId]);

  const displayedAccounts = useMemo(() => {
    const list = state.modelAccounts || [];
    const filtered = filterToCurrentModel
      ? list.filter((a) => a.modelId === targetModelId)
      : list;
    return [...filtered].sort((a, b) => {
      const modelComp = (a.modelId || "").localeCompare(b.modelId || "");
      if (modelComp !== 0) return modelComp;
      const timeComp = (a.createdTimestamp || "").localeCompare(b.createdTimestamp || "");
      if (timeComp !== 0) return timeComp;
      return (a.accountId || "").localeCompare(b.accountId || "");
    });
  }, [state.modelAccounts, filterToCurrentModel, targetModelId]);

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
  const effectiveCliCommand = useMemo(() => {
    if (selectedStrategy.id === "google") {
      return selectedGoogleCli === "antigravity" ? "antigravity" : "gemini auth login --browser";
    }
    return selectedStrategy.cliCommand;
  }, [selectedStrategy, selectedGoogleCli]);
  const computedAuthRedirectUri = resolvedOAuthConfig?.redirectUri || selectedStrategy.defaultRedirectUri;
  const resolvedDefaultClientId = (resolvedOAuthConfig?.defaultClientId || selectedStrategy.defaultClientId || "").trim();
  const effectiveClientId = (oauthClientId || resolvedDefaultClientId).trim();
  const requiresRegisteredClient = Boolean(resolvedOAuthConfig?.requiresClientRegistration);
  const requiresClientRegistration = Boolean(resolvedOAuthConfig?.requiresClientRegistration && !resolvedDefaultClientId);

  const isUsableOAuthUrl = (url?: string): url is string => {
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) return false;
    if (url.includes("<DB_") || url.includes("%3CDB_")) return false;
    if (url.includes("client_id=&")) return false;
    return true;
  };

  const computedAuthorizationUrl =
    effectiveClientId &&
      (!resolvedOAuthConfig?.authorizationUrl ||
        !isUsableOAuthUrl(resolvedOAuthConfig.authorizationUrl) ||
        effectiveClientId !== resolvedDefaultClientId)
      ? selectedStrategy.buildAuthorizationUrl({
        clientId: effectiveClientId,
        redirectUri: computedAuthRedirectUri,
        scopes: oauthScopes,
        modelId: targetModelId,
        userEmail: userEmail,
      })
      : (isUsableOAuthUrl(resolvedOAuthConfig?.authorizationUrl)
        ? resolvedOAuthConfig.authorizationUrl
        : resolvedOAuthConfig?.executableLaunchUrl) ||
      (effectiveClientId
        ? selectedStrategy.buildAuthorizationUrl({
          clientId: effectiveClientId,
          redirectUri: computedAuthRedirectUri,
          scopes: oauthScopes,
          modelId: targetModelId,
          userEmail: userEmail,
        })
        : selectedStrategy.buildAuthorizationUrl({
          clientId: effectiveClientId,
          redirectUri: computedAuthRedirectUri,
          scopes: oauthScopes,
          modelId: targetModelId,
          userEmail: userEmail,
        }) || resolvedOAuthConfig?.authorizationEndpoint || selectedStrategy.authUrl);

  const executableLaunchUrl =
    effectiveClientId &&
      (!resolvedOAuthConfig?.executableLaunchUrl ||
        !isUsableOAuthUrl(resolvedOAuthConfig.executableLaunchUrl) ||
        effectiveClientId !== resolvedDefaultClientId)
      ? selectedStrategy.buildAuthorizationUrl({
        clientId: effectiveClientId,
        redirectUri: computedAuthRedirectUri,
        scopes: oauthScopes,
        modelId: targetModelId,
        userEmail: userEmail,
      })
      : (isUsableOAuthUrl(resolvedOAuthConfig?.executableLaunchUrl)
        ? resolvedOAuthConfig.executableLaunchUrl
        : "");

  const buildOAuthScopes = (): readonly string[] =>
    oauthScopes
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

  const resolveHostBrowserLaunchTarget = (
    url: string,
  ): { targetUrl: string; usingEdgeProtocol: boolean; requiresExternalBrowser: boolean } => {
    return {
      targetUrl: sanitizeOAuthRedirectUrl(url) || url,
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
  const [authSessionStartedAt, setAuthSessionStartedAt] = useState<number>(0);

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
            setAccountName(selectedStrategy.name);
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
      if (pollCount > 200) {
        setIsWaitingForCallback(false);
        setCliTimeoutSecondsRemaining(0);
        setActionError("CLI OAuth authentication timed out (300s limit exceeded). Authorization code was not provided within the 300-second window. Please click 'Run CLI Authentication' again.");
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
        if (
          session?.accessToken &&
          session.email &&
          (!session.timestamp || session.timestamp >= authSessionStartedAt)
        ) {
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
          setAccountName(selectedStrategy.name);
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

  // Form population is explicitly decoupled from background account active/inactive updates.
  // Form inputs are ONLY populated when the user explicitly clicks the "Edit" button (loadAccountIntoEditor).

  // Handle OAuth success query params on page load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_success") === "true") {
      const email = params.get("email");
      const authCode = params.get("code") || params.get("auth_code");
      if (email) {
        setUserEmail(email);
        setAccountName(selectedStrategy.name);
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
    setAuthSessionStartedAt(Date.now());
    setActionError(null);

    // Open blank window immediately on user gesture to avoid browser popup blockers
    const authPopup = typeof window !== "undefined"
      ? window.open("about:blank", "_blank", "width=650,height=800,scrollbars=yes,resizable=yes")
      : null;

    if (authPopup?.document) {
      try {
        authPopup.document.write(
          `<!DOCTYPE html><html><head><title>Connecting to ${selectedStrategy.name} CLI...</title></head>` +
          `<body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;text-align:center;">` +
          `<div style="font-size:36px;margin-bottom:16px;">⚡</div>` +
          `<h2 style="margin:0 0 8px 0;font-size:18px;">Initializing ${selectedStrategy.name} Authentication</h2>` +
          `<p style="color:#94a3b8;font-size:14px;max-width:420px;line-height:1.5;">Generating authorization session from CLI... You will be redirected momentarily.</p>` +
          `</body></html>`
        );
      } catch {
        // Best effort placeholder
      }
    }

    try {
      const refreshedConfig = await ensureAppliedOAuthClientConfiguration();
      const cliResponse = await ApiService.executeCliLogin(targetModelId, {
        provider: selectedProviderId,
        userEmail,
        accountCategory,
      });

      if (!cliResponse.success || cliResponse.session?.status === "FAILED") {
        if (authPopup && !authPopup.closed) authPopup.close();
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
      const candidateUrls = [
        cliResponse.loginResult?.config?.authorizationUrl,
        cliResponse.session?.oauthUrl,
        fallbackConfig?.executableLaunchUrl,
        computedAuthorizationUrl,
        executableLaunchUrl,
      ];
      const launchUrl =
        candidateUrls.find(
          (candidate): candidate is string =>
            isUsableOAuthUrl(candidate) && !candidate.endsWith("/oauth2callback"),
        ) || "";

      const nextStep = cliResponse.loginResult?.config?.nextStep;
      const setupGuide = cliResponse.loginResult?.config?.setupGuide;
      const needsRegistration = Boolean(
        (cliResponse.loginResult?.config?.requiresClientRegistration || requiresClientRegistration) &&
        !effectiveClientId,
      );

      if (needsRegistration && !launchUrl) {
        if (authPopup && !authPopup.closed) authPopup.close();
        setIsWaitingForCallback(false);
        const guideSuffix = setupGuide ? ` Setup guide: ${setupGuide}` : "";
        setActionError(`OAuth Client ID is required before browser redirect. Configure Client ID in Advanced OAuth settings.${guideSuffix}`);
        return;
      }

      if (!launchUrl) {
        if (authPopup && !authPopup.closed) authPopup.close();
        setIsWaitingForCallback(false);
        const fallbackStep = `Run ${selectedStrategy.cliCommand} and complete sign-in in ${selectedStrategy.name} CLI.`;
        const guideSuffix = setupGuide ? ` Setup guide: ${setupGuide}` : "";
        setActionSuccess(`${nextStep || fallbackStep}${guideSuffix}`);
        return;
      }

      const launchTarget = resolveHostBrowserLaunchTarget(launchUrl);
      if (launchTarget.requiresExternalBrowser) {
        if (authPopup && !authPopup.closed) authPopup.close();
        await navigator.clipboard.writeText(launchTarget.targetUrl).catch(() => undefined);
        setIsWaitingForCallback(false);
        setActionError("Google OAuth is not supported in VS Code embedded browser. Authorization URL copied — open it in host Microsoft Edge.");
        return;
      }

      setIsWaitingForCallback(true);
      setActiveOAuthStep(2);
      setTimerOriginTab(selectedProtocol === "cli" ? "cli" : selectedProtocol === "oauth" && accountCategory === "individual" ? "oauth_individual" : "oauth_enterprise");
      setCliTimeoutSecondsRemaining(300);

      if (authPopup && !authPopup.closed) {
        try {
          authPopup.location.href = launchTarget.targetUrl;
          setActionInfo(`Redirecting to ${selectedStrategy.name} authorization portal in opened window...`);
        } catch {
          window.open(launchTarget.targetUrl, "modelbox_oauth_popup", "width=640,height=760,scrollbars=yes,resizable=yes");
          setActionInfo(`Browser opened for ${selectedStrategy.name} CLI authentication. Please complete sign-in.`);
        }
      } else {
        const opened = window.open(launchTarget.targetUrl, "modelbox_oauth_popup", "width=640,height=760,scrollbars=yes,resizable=yes");
        if (!opened || opened.closed || typeof opened.closed === "undefined") {
          setIsWaitingForCallback(false);
          setActionError("Popup blocked by browser. Allow popups to open the OAuth sign-in window.");
          return;
        }
        setActionInfo(`Browser opened for ${selectedStrategy.name} CLI authentication. Please complete sign-in.`);
      }
    } catch (err: unknown) {
      if (authPopup && !authPopup.closed) authPopup.close();
      setActionError(err instanceof Error ? err.message : "Failed to generate CLI authentication instructions.");
    } finally {
      setIsCliLoggingIn(false);
    }
  };

  const handleInitiateBrowserRedirect = async () => {
    setIsRedirecting(true);
    setIsWaitingForCallback(true);
    setAuthSessionStartedAt(Date.now());
    setTimerOriginTab(selectedProtocol === "cli" ? "cli" : selectedProtocol === "oauth" && accountCategory === "individual" ? "oauth_individual" : "oauth_enterprise");
    setCliTimeoutSecondsRemaining(300);
    setActionError(null);
    void triggerDirectoryVerification("pre-browser-redirect");
    setActionInfo(`Redirecting to ${selectedStrategy.name} Authorization Portal in a new window...`);
    try {
      const refreshedConfig = await ensureAppliedOAuthClientConfiguration();
      const fallbackConfig = refreshedConfig || (await ApiService.fetchModelOAuthConfig(targetModelId));
      const candidateUrls = [
        fallbackConfig?.executableLaunchUrl,
        executableLaunchUrl,
        computedAuthorizationUrl,
      ];
      const resolvedLaunchUrl =
        candidateUrls.find(
          (candidate): candidate is string =>
            isUsableOAuthUrl(candidate) && !candidate.endsWith("/oauth2callback"),
        ) || "";
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
      const popup = window.open(launchTarget.targetUrl, "modelbox_oauth_popup", "width=640,height=760,scrollbars=yes,resizable=yes");
      if (!popup || popup.closed || typeof popup.closed === "undefined") {
        setIsWaitingForCallback(false);
        setActionError("Popup blocked by browser. Allow popups for this site so the OAuth window can authorize and close automatically.");
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

  const handlePasteAuthCode = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          setRedirectAuthCode(text.trim());
          setPastedFeedback(true);
          setTimeout(() => setPastedFeedback(false), 2000);
        }
      } catch {
        // Fallback or browser denied permission
      }
    }
  };

  const handleCompleteOAuthExchange = async (codeToExchange?: string) => {
    if (cliTimeoutSecondsRemaining === 0) {
      setActionError("CLI OAuth authentication timed out (300s limit exceeded). Authorization code submission is rejected. Please click 'Run CLI Authentication' to start a fresh session.");
      return;
    }
    const exchangeCode = codeToExchange || redirectAuthCode;
    const strategy = oauthProviderRegistry.getStrategy(selectedProviderId);
    setIsVerifyingAuthCode(true);
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
            setAccountName(strategy.name);
          }
          setRedirectAuthCode("");
          setTestResult(null);
          setCliTimeoutSecondsRemaining(null);
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
          setAccountName(strategy.name);
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
    } finally {
      setIsVerifyingAuthCode(false);
    }
  };

  const handleDisconnectOAuth = () => {
    setOauthSession(null);
    setTestResult(null);
    setActiveOAuthStep(2);
    setActionWarning("OAuth session revoked. Please authorize with your provider to link credentials.");
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
        effortTier: modelEffortTier,
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

      let tokenValue = editableAccessToken.trim();
      if (tokenValue.startsWith("4/0")) {
        tokenValue = `ya29.authcode_${tokenValue.replace(/[^a-zA-Z0-9_-]/g, "")}`;
        setEditableAccessToken(tokenValue);
      }
      const currentEmail = userEmail.trim() || "punittiwari58@gmail.com";
      const currentName = accountName.trim() || selectedStrategy.name;

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
    setActionInfo(null);
    setActionWarning(null);

    try {
      const protocolStrategy = protocolConfigStrategyRegistry.resolve(selectedProtocol);
      const credVal = getCredentialValueForProtocol();
      const cfg = getProtocolConfigObject();

      if (editingAccountId) {
        await ApiService.updateModelAccount(targetModelId, editingAccountId, {
          accountName: accountName.trim(),
          userEmail: userEmail.trim(),
          authType: protocolStrategy.storageAuthType,
          credentialValue: credVal,
          isActive: true,
          config: cfg,
        });
        setActionSuccess(`Successfully updated configuration '${accountName}' for '${targetModelId}'!`);
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
      setFormMode("save");
      setAccountName("");
      setUserEmail("");
      setApiKey("");
      setCookieString("");
      setRedirectAuthCode("");
      setOauthSession(null);
      setTestResult(null);
      state.setActiveTab("model-config", { view: "form", model: targetModelId, mode: "save" });
      await state.refreshModelAccounts();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDoneEditing = () => {
    setEditingAccountId(null);
    setAccountName("");
    setUserEmail("");
    setApiKey("");
    setCookieString("");
    setRedirectAuthCode("");
    setActionInfo("Exited edit mode. Form is ready for new account registration.");
    state.setActiveTab("model-config", { view: "form", model: targetModelId });
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
      setActionWarning(`Account '${acc.accountName}' is now INACTIVE for '${acc.modelId}'.`);
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
    if (editingAccountId !== acc.accountId) {
      setActionInfo(
        `Click 'Edit' on account '${cleanAccountDisplayName(acc.accountName, acc.userEmail)}' before modifying its active/inactive status.`,
      );
      return;
    }
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
        } catch { }
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

  if (onboardingPageMode !== "closed") {
    const existingIntegrationAccounts = editingIntegration
      ? state.modelAccounts.filter((acc) => acc.modelId === editingIntegration.integrationId)
      : [];
    return (
      <div className="desktop-model-config-page page-stack" data-testid="desktop-model-config-page">
        <IntegrationOnboardingView
          mode={onboardingPageMode === "edit" ? "edit" : "create"}
          initialIntegration={editingIntegration}
          initialAccounts={existingIntegrationAccounts}
          currentUserEmail={state.currentUser?.userEmail}
          rbac={rbac}
          isSubmitting={isSubmittingIntegration}
          errorMessage={onboardingError}
          onCancel={handleDiscard}
          onSubmit={handleIntegrationSubmit}
          onDelete={handleIntegrationDelete}
        />
      </div>
    );
  }

  return (
    <div className="desktop-model-config-page page-stack" data-testid="desktop-model-config-page">
      {viewMode !== "form" && (
        <>
          <PageHeader
            title="Integration Hub"
            subtitle="Discover, connect, and manage external services from one unified workspace."
            actions={
              <>
                <button
                  type="button"
                  className="btn-ui-secondary"
                  onClick={() => void state.refreshData()}
                >
                  🔄 Refresh
                </button>
                <button
                  type="button"
                  className="btn-ui-secondary"
                  disabled={!rbac.canCreate}
                  title={
                    rbac.canCreate
                      ? "Import or configure OAuth clients"
                      : "RBAC: Missing integrations:create permission"
                  }
                  onClick={() => setIsOnboardingModalOpen(true)}
                >
                  ⬆️ Import
                </button>
                <button
                  type="button"
                  className="btn-ui-dark"
                  disabled={!rbac.canCreate}
                  title={
                    rbac.canCreate
                      ? "Onboard a new integration"
                      : `RBAC Denied: Role '${rbac.roleName}' lacks integrations:create permission`
                  }
                  onClick={openIntegrationOnboardCreatePage}
                  data-testid="btn-add-integration"
                >
                  {rbac.canCreate ? "+ Add Integration" : "🔒 + Add Integration"}
                </button>
              </>
            }
          />

          <div
            className="rbac-policy-bar integration-hub-rbac-strip"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              background: "var(--theme-bg-surface)",
              border: "1px solid var(--theme-border-subtle)",
              borderLeft: "3px solid var(--theme-primary)",
              borderRadius: "var(--radius-lg)",
            }}
            data-testid="hub-rbac-banner"
          >
            <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--theme-text-primary)" }}>
              🛡️ RBAC Governance · {rbac.roleName}
            </span>
          </div>

          <StatCardGrid>
            <StatCard
              label="Total Integrations"
              value={integrationMetrics.total}
              icon="🧩"
              tone="primary"
              active={connectionStatusFilter === "all"}
              onClick={() => setConnectionStatusFilter("all")}
            />
            <StatCard
              label="Connected"
              value={integrationMetrics.connected}
              icon="✅"
              tone="success"
              active={connectionStatusFilter === "connected"}
              onClick={() =>
                setConnectionStatusFilter(
                  connectionStatusFilter === "connected" ? "all" : "connected",
                )
              }
            />
            <StatCard
              label="Not Connected"
              value={integrationMetrics.notConnected}
              icon="🔌"
              tone="neutral"
              active={connectionStatusFilter === "not-connected"}
              onClick={() =>
                setConnectionStatusFilter(
                  connectionStatusFilter === "not-connected" ? "all" : "not-connected",
                )
              }
            />
            <StatCard
              label="Attention Required"
              value={integrationMetrics.attention}
              icon="⚠️"
              tone="warning"
              active={connectionStatusFilter === "attention"}
              onClick={() =>
                setConnectionStatusFilter(
                  connectionStatusFilter === "attention" ? "all" : "attention",
                )
              }
            />
            <StatCard
              label="Active Connections"
              value={integrationMetrics.activeConnections}
              icon="🔗"
              tone="info"
              active={connectionStatusFilter === "connected"}
              onClick={() =>
                setConnectionStatusFilter(
                  connectionStatusFilter === "connected" ? "all" : "connected",
                )
              }
            />
          </StatCardGrid>
        </>
      )}

      {/* 1. Unified Control Panel (Hub Grid / List Mode) */}
      {viewMode !== "form" && (
        <ControlPanel
          viewType={viewMode}
          formMode={formMode}
          title="Integration Catalogue"
          subtitle="Browse supported providers and services"
          resultCount={filteredModelsForView.length}
          isSaving={isSaving}
          onViewTypeChange={(type) => {
            setViewMode(type);
            state.setActiveTab("model-config", { view: type });
          }}
          searchQuery={modelFilterSearch}
          onSearchChange={setModelFilterSearch}
          searchPlaceholder="Filter integrations by provider, name, or ID..."
          activeFilter={modelFamilyFilter}
          onFilterChange={setModelFamilyFilter}
          filterOptions={categoriesList}
          activeGroupBy={modelGroupBy}
          onGroupByChange={(g) => setModelGroupBy(g as "family" | "none")}
          groupByOptions={[
            { value: "family", label: "Provider / Family" },
            { value: "none", label: "None (Flat List)" },
          ]}
          onClearAll={handleClearAllFilters}
          hasActiveFilters={hasActiveFilters}
        />
      )}

      {actionInfo && (
        <div className="alert-banner info" data-testid="alert-banner-info">
          <span className="alert-icon">ℹ️</span>
          <span className="alert-text">{actionInfo}</span>
          <button className="alert-close" onClick={() => setActionInfo(null)}>✕</button>
        </div>
      )}

      {actionWarning && (
        <div className="alert-banner warning" data-testid="alert-banner-warning">
          <span className="alert-icon">⚠️</span>
          <span className="alert-text">{actionWarning}</span>
          <button className="alert-close" onClick={() => setActionWarning(null)}>✕</button>
        </div>
      )}

      {actionSuccess && (
        <div className="alert-banner success" data-testid="alert-banner-success">
          <span className="alert-icon">✔</span>
          <span className="alert-text">{actionSuccess}</span>
          <button className="alert-close" onClick={() => setActionSuccess(null)}>✕</button>
        </div>
      )}

      {actionError && (
        <div className="alert-banner error" data-testid="alert-banner-error">
          <span className="alert-icon">✕</span>
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
            handleInitiateChat(mId);
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
          onManageAccountsClick={(mId) => openModelSaveView(mId)}
          onChatSelect={(mId) => openModelSaveView(mId)}
        />
      )}

      {/* 4. Detail Page View (Overview, Connections, Capabilities, Activity + 4-Protocol Editor) */}
      {viewMode === "form" && (
        <IntegrationDetailView
          model={currentModelObj}
          targetModelId={targetModelId}
          customIntegration={currentCustomIntegration}
          accounts={state.modelAccounts.filter((a) => a.modelId === targetModelId)}
          auditLogs={state.auditLogs}
          activeTab={detailTab}
          onTabChange={setDetailTab}
          onBack={handleDiscard}
          canCreate={rbac.canCreate}
          canUpdate={rbac.canUpdate}
          canDelete={rbac.canDelete}
          editingAccountId={editingAccountId}
          onSaveAccount={() => void handleSaveConfiguration()}
          onToggleAccountStatus={handleToggleAccountStatus}
          onEditIntegration={
            currentCustomIntegration
              ? () => openIntegrationOnboardEditPage(currentCustomIntegration)
              : undefined
          }
          onDeleteIntegration={
            currentCustomIntegration
              ? () => void handleIntegrationDelete(currentCustomIntegration.integrationId)
              : undefined
          }
          onAddConnection={() => {
            setDetailTab("connections");
            setFormMode("create");
            setShowProtocolEditor(true);
            setEditingAccountId(null);
            setAccountName("");
            setUserEmail("");
            setApiKey("");
            setCookieString("");
            setRedirectAuthCode("");
            setOauthSession(null);
            setTestResult(null);
            setActionError(null);
            setActionInfo(null);
            state.setActiveTab("model-config", { view: "form", model: targetModelId, mode: "create" });
          }}
          onEditAccount={loadAccountIntoEditor}
          onTestAccount={(acc) => void handleTestExistingAccount(acc)}
          onDisconnectAccount={handleOpenDeleteModal}
          testingAccountId={testingAccountId}
          onOpenModels={() => state.setActiveTab("models")}
          onOpenTools={() => state.setActiveTab("workflows")}
          protocolStudioSlot={
            showProtocolEditor ? (
              <div className="form-view-container" data-testid="form-view">
                <div className="detail-editor-toolbar">
                  <div className="editor-toolbar-title">
                    <strong>{formMode === "create" ? "New Connection" : `Edit: ${accountName || currentModelTitle}`}</strong>
                  </div>
                  <div className="inline-btn-group">
                    {formMode === "save" && (
                      <button
                        type="button"
                        className="btn-ui-danger btn-sm"
                        onClick={handleDeleteActiveAccount}
                        data-testid="btn-delete"
                      >
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-ui-secondary btn-sm"
                      onClick={() => setShowProtocolEditor(false)}
                      data-testid="btn-discard"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <div className={`config-studio-grid ${formMode === "create" ? "single-column" : ""}`}>
                  {/* Left Column: Interactive Protocol Configuration Form */}
                  <div className="config-builder-card">
                    <div className="card-header">
                      <span className="card-icon">⚡</span>
                      <h3>Protocol Configuration Engine</h3>
                    </div>

                    {editingAccountId && (
                      <div className="alert-banner info d-flex align-items-center justify-content-between p-2 mb-3" data-testid="edit-mode-indicator">
                        <div className="d-flex align-items-center gap-2">
                          <span className="badge-pill info">Editing Mode</span>
                          <span>Editing account: <strong>{accountName || editingAccountId}</strong> ({targetModelId})</span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline theme-secondary"
                          onClick={handleDoneEditing}
                          data-testid="btn-done-editing-top"
                        >
                          Done Editing
                        </button>
                      </div>
                    )}

                    {/* Protocol Switcher Tabs */}
                    <div className="protocol-selector-tabs">
                      <button
                        type="button"
                        className={`protocol-tab-btn ${selectedProtocol === "api" ? "active" : ""}`}
                        onClick={() => {
                          setSelectedProtocol("api");
                          setActionError(null);
                          setActionInfo(null);
                        }}
                      >
                        <span className="tab-icon">🔑</span>
                        <span className="tab-label">REST API</span>
                        <span className="tab-hint">Static Key</span>
                      </button>

                      <button
                        type="button"
                        className={`protocol-tab-btn ${selectedProtocol === "oauth" ? "active" : ""}`}
                        onClick={() => {
                          setSelectedProtocol("oauth");
                          setActionError(null);
                          setActionInfo(null);
                        }}
                      >
                        <span className="tab-icon">🌐</span>
                        <span className="tab-label">OAuth 2.0 Redirect</span>
                        <span className="tab-hint">Web Consent</span>
                      </button>

                      <button
                        type="button"
                        className={`protocol-tab-btn ${selectedProtocol === "cli" ? "active" : ""}`}
                        onClick={() => {
                          setSelectedProtocol("cli");
                          setActionError(null);
                          setActionInfo(null);
                        }}
                      >
                        <span className="tab-icon">💻</span>
                        <span className="tab-label">CLI Binary</span>
                        <span className="tab-hint">Host Terminal</span>
                      </button>

                      <button
                        type="button"
                        className={`protocol-tab-btn ${selectedProtocol === "cookie" ? "active" : ""}`}
                        onClick={() => {
                          setSelectedProtocol("cookie");
                          setActionError(null);
                          setActionInfo(null);
                        }}
                      >
                        <span className="tab-icon">🍪</span>
                        <span className="tab-label">Cookie Vault</span>
                        <span className="tab-hint">Session Lineage</span>
                      </button>
                    </div>

                    <form className="protocol-config-form" onSubmit={handleSaveConfiguration}>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label className="form-label-inline-split">
                            <span>Target Model</span>
                            {(() => {
                              const isEditing = Boolean(editingAccountId);
                              const editingAccount = isEditing
                                ? state.modelAccounts.find((a) => a.accountId === editingAccountId)
                                : null;
                              const pillClass = isEditing
                                ? (editingAccount?.isActive ? "verified" : "pending")
                                : (isAuthSuccessful ? "verified" : "pending");
                              const pillText = isEditing
                                ? (editingAccount?.isActive ? "Active" : "Inactive")
                                : (isAuthSuccessful ? "Discovered" : "Pending Auth");
                              return (
                                <span className={`target-auth-pill ${pillClass}`} data-testid="target-auth-pill">
                                  {pillText}
                                </span>
                              );
                            })()}
                          </label>
                          <select
                            className="form-select"
                            value={targetModelId}
                            onChange={(e) => {
                              setTargetModelId(e.target.value);
                              state.setSelectedModel(e.target.value);
                            }}
                            data-testid="select-target-model"
                          >
                            {availableConfigModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.family})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label-inline-split">
                            <span>Account Label</span>
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. Production Gemini CLI"
                            value={accountName}
                            onChange={(e) => setAccountName(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="form-group" style={{ marginTop: "4px" }}>
                        <label>Owner Email</label>
                        <input
                          type="email"
                          className="form-input"
                          value={userEmail}
                          onChange={(e) => setUserEmail(e.target.value)}
                          autoComplete="off"
                          data-lpignore="true"
                          placeholder="user@example.com"
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
                              <strong>REST API Authentication</strong>
                              <p>Header-based bearer token or API key configuration.</p>
                            </div>
                          </div>

                          <div className="form-group">
                            <label>API Key</label>
                            <input
                              type="password"
                              className="form-input code-font"
                              placeholder="Enter API key"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              required={selectedProtocol === "api"}
                            />
                          </div>
                          <div className="form-row-2">
                            <div className="form-group">
                              <label>Endpoint URL</label>
                              <input
                                type="text"
                                className="form-input"
                                value={apiBaseUrl}
                                onChange={(e) => setApiBaseUrl(e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label>API Version</label>
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
                          {/* Sequential Authentication Pipeline */}
                          <div className="oauth-step-progress oauth-sequential-pipeline" data-testid="oauth-step-progress">
                            <button
                              type="button"
                              className={`step-item-btn pipeline-stage-btn ${effectiveOAuthStep === 1 ? "active" : effectiveOAuthStep > 1 ? "completed" : "pending"}`}
                              onClick={() => setActiveOAuthStep(1)}
                            >
                              <span className="step-circle stage-indicator">
                                {effectiveOAuthStep > 1 ? "✔" : <span className="stage-dot" />}
                              </span>
                              <div className="step-info stage-content">
                                <span className="step-label stage-title">Select Provider</span>
                                <span className="stage-state">
                                  {effectiveOAuthStep > 1 ? "Completed" : effectiveOAuthStep === 1 ? "In Progress" : "Pending"}
                                </span>
                              </div>
                            </button>

                            <button
                              type="button"
                              className={`step-item-btn pipeline-stage-btn ${effectiveOAuthStep === 2 ? "active" : Boolean(oauthSession?.accessToken) || effectiveOAuthStep > 2 ? "completed" : "pending"}`}
                              onClick={() => setActiveOAuthStep(2)}
                            >
                              <span className="step-circle stage-indicator">
                                {Boolean(oauthSession?.accessToken) || effectiveOAuthStep > 2 ? "✔" : <span className="stage-dot" />}
                              </span>
                              <div className="step-info stage-content">
                                <span className="step-label stage-title">Browser Consent</span>
                                <span className="stage-state">
                                  {Boolean(oauthSession?.accessToken) || effectiveOAuthStep > 2 ? "Completed" : effectiveOAuthStep === 2 ? "In Progress" : "Pending"}
                                </span>
                              </div>
                            </button>

                            <button
                              type="button"
                              className={`step-item-btn pipeline-stage-btn ${effectiveOAuthStep === 3 ? (isOAuthVerificationFailed ? "active active-failed" : "active active-success") : Boolean(oauthSession?.accessToken) ? "completed" : "pending"}`}
                              onClick={() => setActiveOAuthStep(3)}
                              disabled={!oauthSession}
                            >
                              <span className="step-circle stage-indicator">
                                {isOAuthVerificationFailed ? "⚠️" : Boolean(oauthSession?.accessToken) ? "✔" : <span className="stage-dot" />}
                              </span>
                              <div className="step-info stage-content">
                                <span className="step-label stage-title">
                                  {isOAuthVerificationFailed ? "Verification Failed" : "Token Vault"}
                                </span>
                                <span className="stage-state">
                                  {isOAuthVerificationFailed ? "Action Required" : Boolean(oauthSession?.accessToken) ? "Ready" : "Pending"}
                                </span>
                              </div>
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
                                    <span>Next: Authorization Setup</span>
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
                                        <h4>OAuth 2.0 Authorization</h4>
                                        {Boolean(oauthSession?.accessToken) && (
                                          <span className="verified-status-chip">✔ {selectedStrategy.verifiedStatus}</span>
                                        )}
                                      </div>
                                      <p className="handshake-desc">
                                        Authenticate with <strong>{selectedStrategy.name}</strong> for <strong>{targetModelId}</strong>.
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
                                      📖 Docs ↗
                                    </a>
                                  )}
                                </div>

                                {/* Section 2: Account Category Selector (Individual vs Enterprise) */}
                                <div className="account-mode-container">
                                  <div className="mode-header-label">
                                    <span>Authentication Mode ({selectedStrategy.name})</span>
                                    <span className="mode-subtag">
                                      {accountCategory === "individual" ? "CLI Binary Session" : "Enterprise Web OAuth"}
                                    </span>
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
                                        Personal account bearer sign-in via host CLI (Antigravity or Gemini). No cloud project ID needed.
                                      </div>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setAccountCategory("enterprise")}
                                      className={`mode-card-btn ${accountCategory === "enterprise" ? "active" : ""}`}
                                    >
                                      <div className="mode-card-title">
                                        <span>🏢</span>
                                        <strong>Enterprise Project (Web OAuth)</strong>
                                      </div>
                                      <div className="mode-card-desc">
                                        Corporate consent flow. OAuth Client ID and Client Secret are mandatory.
                                      </div>
                                    </button>
                                  </div>

                                  {/* If Individual: Show CLI Tool Choice */}
                                  {accountCategory === "individual" && selectedStrategy.id === "google" && (
                                    <div className="google-cli-selector-panel">
                                      <div className="cli-selector-text">
                                        <strong>CLI Binary</strong>
                                        <span>Choose tool used for OAuth PKCE session</span>
                                      </div>
                                      <div className="cli-selector-buttons">
                                        <button
                                          type="button"
                                          className={`cli-tool-choice-btn ${selectedGoogleCli === "antigravity" ? "active" : ""}`}
                                          onClick={() => {
                                            setSelectedGoogleCli("antigravity");
                                            setCliExecutable("antigravity");
                                          }}
                                        >
                                          ⚡ Antigravity CLI
                                        </button>
                                        <button
                                          type="button"
                                          className={`cli-tool-choice-btn ${selectedGoogleCli === "gemini" ? "active" : ""}`}
                                          onClick={() => {
                                            setSelectedGoogleCli("gemini");
                                            setCliExecutable("gemini");
                                          }}
                                        >
                                          ✦ Gemini CLI
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* If Enterprise: Mandatory Client ID & Client Secret form */}
                                  {accountCategory === "enterprise" && (
                                    <div className="enterprise-oauth-credentials-card" data-testid="enterprise-oauth-card">
                                      <div className="card-intro-note">
                                        <span>🏢</span>
                                        <span><strong>Enterprise OAuth 2.0 Credentials:</strong> Client ID and Client Secret are mandatory for corporate federation. Authorization code input is not required.</span>
                                      </div>

                                      <div className="form-row-2">
                                        <div className="form-group">
                                          <label>OAuth Client ID <span className="required-star" style={{ color: "#ef4444" }}>*</span></label>
                                          <input
                                            type="text"
                                            className="form-input"
                                            placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                                            value={oauthClientId}
                                            onChange={(e) => setOauthClientId(e.target.value)}
                                            required
                                          />
                                        </div>
                                        <div className="form-group">
                                          <label>OAuth Client Secret <span className="required-star" style={{ color: "#ef4444" }}>*</span></label>
                                          <input
                                            type="password"
                                            className="form-input"
                                            placeholder="Enter corporate client secret"
                                            value={oauthClientSecret}
                                            onChange={(e) => setOauthClientSecret(e.target.value)}
                                            required
                                          />
                                        </div>
                                      </div>

                                      <div className="form-row-2">
                                        <div className="form-group">
                                          <label>Authorization Endpoint</label>
                                          <input
                                            type="url"
                                            className="form-input"
                                            value={oauthAuthUrl || selectedStrategy.authUrl}
                                            onChange={(e) => setOauthAuthUrl(e.target.value)}
                                          />
                                        </div>
                                        <div className="form-group">
                                          <label>Callback Redirect URI</label>
                                          <input
                                            type="url"
                                            className="form-input"
                                            value={computedAuthRedirectUri}
                                            readOnly
                                          />
                                        </div>
                                      </div>

                                      {(!oauthClientId.trim() || !oauthClientSecret.trim()) && (
                                        <div className="alert-banner warning" style={{ margin: 0 }}>
                                          <span className="alert-icon">⚠️</span>
                                          <span className="alert-text">Client ID and Client Secret are mandatory to enable Enterprise OAuth consent.</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Section 3: Computed Authorization URL */}
                                <div className="computed-url-box">
                                  <div className="url-label-row">
                                    <label>Authorization URL</label>
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
                                      {copiedUrl ? "✔ Copied" : "📋 Copy"}
                                    </button>
                                  </div>
                                </div>

                                {/* Local Container VCS & Credentials Directory Verification (Individual CLI only) */}
                                {accountCategory === "individual" && (
                                  <div className="vcs-container-audit-card" data-testid="vcs-container-audit-card">
                                    <div className="vcs-audit-header">
                                      <div className="vcs-badge-group">
                                        <span className="vcs-icon">📁</span>
                                        <span className="vcs-dir-label">{vcsAudit.directoryPath}</span>
                                        <span className="vcs-status-tag" style={{ marginLeft: "8px" }}>
                                          {vcsAudit.isGitRepo ? "Git Active" : "Snapshot VCS"}
                                        </span>
                                        {vcsAudit.currentCommitHash && (
                                          <span className="vcs-commit-tag">
                                            {vcsAudit.currentCommitHash.slice(0, 7)}
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        className="btn-vcs-reverify"
                                        onClick={() => triggerDirectoryVerification("manual-reverify")}
                                        title="Verify credentials directory and check changes"
                                      >
                                        🔄 Verify Directory
                                      </button>
                                    </div>
                                    {vcsAudit.changedFiles.length > 0 && (
                                      <div className="vcs-changed-files-row">
                                        <span className="changed-label">Changed Files:</span>
                                        {vcsAudit.changedFiles.map((f) => (
                                          <code key={f} className="changed-file-pill">{f}</code>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Section 4: Action Buttons Toolbar */}
                                <div className="oauth-action-toolbar">
                                  {accountCategory === "individual" ? (
                                    <button
                                      type="button"
                                      className="btn-oauth-action btn-cli-auth btn-launch-primary"
                                      data-testid="btn-oauth-launch-browser"
                                      onClick={handleExecuteCliLogin}
                                      disabled={isCliLoggingIn || isRedirecting}
                                      title={`Launch browser OAuth sign-in using ${effectiveCliCommand}`}
                                    >
                                      <span className="btn-icon">🌐</span>
                                      <span>
                                        {isCliLoggingIn || isRedirecting
                                          ? "Opening Browser..."
                                          : "Browser Sign-In"}
                                      </span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn-oauth-action btn-cli-auth btn-launch-primary"
                                      data-testid="btn-oauth-launch-browser"
                                      onClick={handleInitiateBrowserRedirect}
                                      disabled={!oauthClientId.trim() || !oauthClientSecret.trim() || isRedirecting}
                                      title="Initiate Corporate OAuth authorization"
                                    >
                                      <span className="btn-icon">🚀</span>
                                      <span>
                                        {isRedirecting
                                          ? "Redirecting..."
                                          : "Enterprise Sign-In"}
                                      </span>
                                    </button>
                                  )}

                                  {cliScriptError && (
                                    <div className="alert-banner error" data-testid="cli-script-error-banner" style={{ marginTop: "0.5rem" }}>
                                      <span className="alert-icon">⚠️</span>
                                      <div className="alert-text">
                                        <strong>CLI Error ({cliScriptError.code || "FAILURE"}):</strong>
                                        <div style={{ fontSize: "0.82rem", marginTop: "0.2rem", fontFamily: "monospace" }}>{cliScriptError.message}</div>
                                      </div>
                                      <button className="alert-close" onClick={() => setCliScriptError(null)}>×</button>
                                    </div>
                                  )}

                                  {isWaitingForCallback && (
                                    <div className="oauth-waiting-banner" data-testid="oauth-waiting-indicator">
                                      <span className="waiting-spinner">⏳</span>
                                      <div className="waiting-text">
                                        <strong>Browser Sign-In Opened</strong>
                                        <span>Complete sign-in in the browser tab. Listening on port 8085...</span>
                                        {isUsableOAuthUrl(executableLaunchUrl || computedAuthorizationUrl) && (
                                          <div style={{ marginTop: "6px" }}>
                                            <button
                                              type="button"
                                              onClick={accountCategory === "individual" ? handleExecuteCliLogin : handleInitiateBrowserRedirect}
                                              style={{
                                                background: "none",
                                                border: "none",
                                                padding: 0,
                                                cursor: "pointer",
                                                color: "var(--theme-primary-hover)",
                                                textDecoration: "underline",
                                                fontWeight: 600,
                                                fontSize: "0.84rem",
                                              }}
                                            >
                                              Re-open Sign-In Window
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {oauthSession && (
                                    <button
                                      type="button"
                                      className="btn-oauth-action btn-return-vault"
                                      onClick={() => setActiveOAuthStep(3)}
                                      title="Navigate to Authenticated Token Vault"
                                    >
                                      <span className="btn-icon">🔒</span>
                                      <span>Token Vault</span>
                                    </button>
                                  )}
                                </div>

                                {/* Section 5: Authorization Code Capture (ONLY Active when CLI mode is selected) */}
                                {accountCategory === "individual" && (
                                  <div className="browser-authcode-capture-card" data-testid="browser-authcode-card">
                                    <div className="authcode-card-header">
                                      <div className="header-title-row">
                                        <span className="card-icon">🔑</span>
                                        <div>
                                          <h5>Authorization Code</h5>
                                          <span className="card-subtext">
                                            Paste the code returned by the browser consent portal to exchange for a token.
                                          </span>
                                        </div>
                                      </div>
                                      <div className="authcode-header-badges">
                                        {timerOriginTab === (accountCategory === "individual" ? "oauth_individual" : "oauth_enterprise") && cliTimeoutSecondsRemaining !== null && (
                                          <span
                                            className={`cli-timeout-badge ${cliTimeoutSecondsRemaining === 0 ? "timed-out" : "active"}`}
                                          >
                                            {cliTimeoutSecondsRemaining > 0
                                              ? `⏱ ${Math.floor(cliTimeoutSecondsRemaining / 60)}m ${(cliTimeoutSecondsRemaining % 60).toString().padStart(2, "0")}s`
                                              : "Timed Out (300s)"}
                                          </span>
                                        )}
                                        {redirectAuthCode ? (
                                          <span className="code-captured-tag">✔ Captured</span>
                                        ) : (
                                          <span className="code-waiting-tag">Awaiting Code</span>
                                        )}
                                      </div>
                                    </div>

                                    {timerOriginTab === (accountCategory === "individual" ? "oauth_individual" : "oauth_enterprise") && cliTimeoutSecondsRemaining === 0 && (
                                      <div className="authcode-timeout-warning">
                                        ⚠️ Session timed out (300s). Click Browser Sign-In to start a new session.
                                      </div>
                                    )}

                                    <div className="authcode-input-container">
                                      <span className="authcode-lead-icon" title="OAuth Authorization Code">🔑</span>
                                      <input
                                        type="text"
                                        className="form-input authcode-text-input"
                                        placeholder="Paste authorization code (e.g. 4/0AUn6...)"
                                        value={redirectAuthCode}
                                        onChange={(e) => setRedirectAuthCode(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && redirectAuthCode.trim() && cliTimeoutSecondsRemaining !== 0 && !isVerifyingAuthCode) {
                                            handleCompleteOAuthExchange(redirectAuthCode);
                                          }
                                        }}
                                        spellCheck={false}
                                        autoComplete="off"
                                      />
                                      <div className="authcode-input-actions">
                                        {redirectAuthCode && (
                                          <button
                                            type="button"
                                            className="btn-clear-code"
                                            onClick={() => setRedirectAuthCode("")}
                                            title="Clear code"
                                          >
                                            ✕
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          className={`btn-paste-code ${pastedFeedback ? "pasted-active" : ""}`}
                                          onClick={handlePasteAuthCode}
                                          title="Paste from clipboard"
                                        >
                                          <span className="paste-icon">{pastedFeedback ? "✔" : "📋"}</span>
                                          <span>{pastedFeedback ? "Pasted" : "Paste"}</span>
                                        </button>
                                      </div>
                                    </div>

                                    <div className="authcode-actions-bar">
                                      <div className="authcode-meta-info">
                                        {redirectAuthCode ? (
                                          <span className="code-char-counter">
                                            <span className="counter-dot"></span>
                                            {redirectAuthCode.length} chars ready
                                          </span>
                                        ) : (
                                          <span className="code-hint-text">
                                            Click Paste or press Enter after pasting the code.
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        className={`btn-submit-authcode ${redirectAuthCode.trim() ? "ready-to-submit" : ""}`}
                                        disabled={!redirectAuthCode.trim() || cliTimeoutSecondsRemaining === 0 || isVerifyingAuthCode}
                                        onClick={() => handleCompleteOAuthExchange(redirectAuthCode)}
                                      >
                                        <span className="submit-icon">{isVerifyingAuthCode ? "⏳" : "✔"}</span>
                                        <span>{isVerifyingAuthCode ? "Verifying..." : "Verify & Save Code"}</span>
                                      </button>
                                    </div>

                                    {redirectAuthCode && (
                                      <div className="authcode-synced-note">
                                        <span>✔ Code ready. Click Verify &amp; Save Code to store token.</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Section 6: Terminal CLI Hint (Individual CLI only) */}
                                {accountCategory === "individual" && (
                                  <div className="cli-terminal-hint">
                                    <div className="terminal-prompt-row">
                                      <span className="terminal-icon">$</span>
                                      <code className="hint-command">{effectiveCliCommand}</code>
                                    </div>
                                    <button
                                      type="button"
                                      className="terminal-copy-btn"
                                      onClick={() => {
                                        navigator.clipboard.writeText(effectiveCliCommand);
                                        setCopiedCliCommand(true);
                                        setTimeout(() => setCopiedCliCommand(false), 2000);
                                      }}
                                    >
                                      {copiedCliCommand ? "✔ Copied" : "📋 Copy Command"}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Collapsible Advanced OAuth Parameters */}
                              <details className="oauth-advanced-details">
                                <summary>OAuth Parameters (Client ID, Secret, Endpoints)</summary>
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
                                      <span className="vcs-status-tag" style={{ marginLeft: "8px" }}>
                                        {vcsAudit.isGitRepo ? "Git Active" : "Snapshot VCS Active"}
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

                                {/* Session Action Toolbar for On-Demand Re-Authentication */}
                                <div className="authenticated-session-toolbar">
                                  {accountCategory === "individual" ? (
                                    <button
                                      type="button"
                                      className="btn-oauth-action btn-cli-auth btn-reauth-action"
                                      onClick={handleExecuteCliLogin}
                                      disabled={isCliLoggingIn}
                                      title="Execute CLI login to refresh OAuth 2.0 token"
                                      data-testid="btn-oauth-cli-auth"
                                    >
                                      <span className="btn-icon">⚡</span>
                                      <span>{isCliLoggingIn ? "Re-Authenticating via CLI..." : "Re-Authenticate"}</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn-oauth-action btn-cli-auth btn-reauth-action"
                                      onClick={handleInitiateBrowserRedirect}
                                      disabled={isRedirecting}
                                      title="Open browser to acquire a fresh OAuth 2.0 token"
                                      data-testid="btn-oauth-browser-auth"
                                    >
                                      <span className="btn-icon">🌐</span>
                                      <span>
                                        {isRedirecting
                                          ? "Opening Browser..."
                                          : "Re-Authenticate"}
                                      </span>
                                    </button>
                                  )}
                                </div>

                                <div className="token-display-box">
                                  <div className="token-header-row">
                                    <label>Issued Bearer Access Token (ya29...)</label>
                                    <button
                                      type="button"
                                      className="toggle-token-btn"
                                      onClick={() => setShowAccessToken(!showAccessToken)}
                                    >
                                      {showAccessToken ? "🙈 Hide" : "👁 Show Token"}
                                    </button>
                                  </div>
                                  {editableAccessToken.startsWith("4/0") && (
                                    <div style={{ fontSize: "0.82rem", color: "#60a5fa", margin: "4px 0" }}>
                                      ℹ Authorization code detected — will auto-format as Bearer access token upon saving.
                                    </div>
                                  )}
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
                              <strong>Local CLI Execution</strong>
                              <p>Execute queries using native binaries configured on the runtime PATH.</p>
                            </div>
                          </div>

                          {selectedStrategy.id === "google" && (
                            <div className="google-cli-selector-panel">
                              <div className="cli-selector-text">
                                <strong>CLI Tool</strong>
                                <span>Select Antigravity or Gemini binary</span>
                              </div>
                              <div className="cli-selector-buttons">
                                <button
                                  type="button"
                                  className={`cli-tool-choice-btn ${selectedGoogleCli === "antigravity" ? "active" : ""}`}
                                  onClick={() => {
                                    setSelectedGoogleCli("antigravity");
                                    setCliExecutable("antigravity");
                                  }}
                                >
                                  ⚡ Antigravity CLI
                                </button>
                                <button
                                  type="button"
                                  className={`cli-tool-choice-btn ${selectedGoogleCli === "gemini" ? "active" : ""}`}
                                  onClick={() => {
                                    setSelectedGoogleCli("gemini");
                                    setCliExecutable("gemini");
                                  }}
                                >
                                  ✦ Gemini CLI
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="cli-terminal-status-card">
                            <div className="status-row">
                              <span className="cli-name">Binary: <code>{cliExecutable}</code></span>
                              <span className="cli-path-badge">/opt/model-connector/npm/bin/{cliExecutable}</span>
                              <span className="cli-status-badge">Available</span>
                            </div>
                            <div className="cli-code-preview">
                              <code>$ {cliExecutable} {cliArgs}</code>
                            </div>
                          </div>

                          <div className="form-row-2">
                            <div className="form-group">
                              <label>CLI Command</label>
                              <input
                                type="text"
                                className="form-input"
                                placeholder="e.g. antigravity, gemini"
                                value={cliExecutable}
                                onChange={(e) => setCliExecutable(e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label>Arguments</label>
                              <input
                                type="text"
                                className="form-input"
                                placeholder={`e.g. --model ${ModelConstants.DEFAULT_MODEL_ID}`}
                                value={cliArgs}
                                onChange={(e) => setCliArgs(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Working Directory</label>
                            <input
                              type="text"
                              className="form-input"
                              value={cliWorkingDir}
                              onChange={(e) => setCliWorkingDir(e.target.value)}
                            />
                          </div>

                          <div className="authenticated-session-toolbar">
                            <button
                              type="button"
                              className="btn-oauth-action btn-cli-auth"
                              onClick={handleExecuteCliLogin}
                              disabled={isCliLoggingIn}
                              title="Run CLI login in container"
                            >
                              <span className="btn-icon">⚡</span>
                              <span>{isCliLoggingIn ? "Running Auth..." : "CLI Auth"}</span>
                            </button>
                            <button
                              type="button"
                              className="btn-oauth-action btn-browser-auth"
                              onClick={handleInitiateBrowserRedirect}
                              disabled={isRedirecting}
                              title="Launch browser OAuth consent"
                            >
                              <span className="btn-icon">🌐</span>
                              <span>{isRedirecting ? "Opening..." : "Browser Sign-In"}</span>
                            </button>
                            <button
                              type="button"
                              className="btn-oauth-action btn-step2-redirect"
                              onClick={() => {
                                navigator.clipboard.writeText(`${cliExecutable} ${cliArgs}`);
                                setCopiedCliCommand(true);
                                setTimeout(() => setCopiedCliCommand(false), 2000);
                              }}
                              title="Copy CLI command"
                            >
                              <span className="btn-icon">{copiedCliCommand ? "✔" : "📋"}</span>
                              <span>{copiedCliCommand ? "Copied" : "Copy Command"}</span>
                            </button>
                          </div>

                          {(isWaitingForCallback || isCliLoggingIn || redirectAuthCode) && (
                            <div className="oauth-step-card step-interactive active-step">
                              <div className="step-card-header">
                                <div className="step-num-badge">🔐</div>
                                <div>
                                  <h4>Authorization Code</h4>
                                  <p>Paste the code from browser consent to complete CLI authentication.</p>
                                </div>
                              </div>

                              <div className="auth-code-wrapper-v2">
                                <div className="code-input-row">
                                  <input
                                    type="text"
                                    className="form-input code-input"
                                    placeholder="Paste authorization code (e.g., 4/0AUn6...)"
                                    value={redirectAuthCode}
                                    onChange={(e) => setRedirectAuthCode(e.target.value.trim())}
                                  />
                                  <button
                                    type="button"
                                    className={`btn-paste-code ${pastedFeedback ? "pasted-active" : ""}`}
                                    onClick={handlePasteAuthCode}
                                    title="Paste code from clipboard"
                                  >
                                    <span className="paste-icon">{pastedFeedback ? "✔" : "📋"}</span>
                                    <span>{pastedFeedback ? "Pasted" : "Paste"}</span>
                                  </button>
                                </div>
                              </div>

                              <div className="authcode-actions-bar">
                                <div className="authcode-meta-info">
                                  {redirectAuthCode ? (
                                    <span className="code-char-counter">
                                      <span className="counter-dot"></span>
                                      {redirectAuthCode.length} chars ready
                                    </span>
                                  ) : (
                                    <span className="code-hint-text">
                                      Click Paste or press Enter after pasting the code.
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className={`btn-submit-authcode ${redirectAuthCode.trim() ? "ready-to-submit" : ""}`}
                                  disabled={!redirectAuthCode.trim() || isVerifyingAuthCode}
                                  onClick={() => handleCompleteOAuthExchange(redirectAuthCode)}
                                >
                                  <span className="submit-icon">{isVerifyingAuthCode ? "⏳" : "✔"}</span>
                                  <span>{isVerifyingAuthCode ? "Verifying..." : "Verify & Save Code"}</span>
                                </button>
                              </div>

                              {redirectAuthCode && (
                                <div className="authcode-synced-note">
                                  <span>✔ Code ready. Click Verify &amp; Save Code to store token.</span>
                                </div>
                              )}
                            </div>
                          )}

                          {vcsAudit.isTracking && (
                            <div className="vcs-sync-card">
                              <div className="vcs-header-row">
                                <span className="vcs-folder-icon">📁</span>
                                <span className="vcs-path">{vcsAudit.directoryPath}</span>
                                <span className="vcs-badge-git">Git Active</span>
                                {vcsAudit.currentCommitHash && (
                                  <span className="vcs-commit-badge">{vcsAudit.currentCommitHash.substring(0, 7)}</span>
                                )}
                              </div>
                              {vcsAudit.changedFiles.length > 0 && (
                                <div className="vcs-detected-files">
                                  <span>Changed Files:</span>
                                  {vcsAudit.changedFiles.map((file, i) => (
                                    <span key={i} className="vcs-file-chip">{file}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {editableAccessToken && (
                            <div className="token-display-box">
                              <div className="token-header-row">
                                <label>Access Token</label>
                                <button
                                  type="button"
                                  className="toggle-token-btn"
                                  onClick={() => setShowAccessToken(!showAccessToken)}
                                >
                                  {showAccessToken ? "Hide" : "Show"}
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
                                  placeholder="Bearer access token..."
                                />
                                <button
                                  type="button"
                                  className="token-copy-btn"
                                  title="Copy token"
                                  onClick={() => {
                                    navigator.clipboard.writeText(editableAccessToken);
                                  }}
                                >
                                  📋
                                </button>
                                <button
                                  type="button"
                                  className="token-save-btn"
                                  title="Save edited token"
                                  disabled={isSavingToken || !editableAccessToken.trim()}
                                  onClick={handleSaveEditedToken}
                                >
                                  {isSavingToken ? "Saving..." : "Save Token"}
                                </button>
                              </div>
                              {tokenSaveSuccess && (
                                <div className="token-save-status-msg">
                                  ✔ {tokenSaveSuccess}
                                </div>
                              )}
                            </div>
                          )}
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

                      {/* Reasoning Effort Tier Selector */}
                      <div className="effort-tier-selector-container" style={{ marginTop: "14px" }}>
                        <div className="tier-header-row">
                          <label className="tier-label">Reasoning Effort</label>
                          <span className="tier-badge-current">
                            {modelEffortTier.toUpperCase()}{modelEffortTier === "medium" ? " (Default)" : ""}
                          </span>
                        </div>
                        <div className="effort-segmented-control">
                          <button
                            type="button"
                            className={`tier-btn tier-low ${modelEffortTier === "low" ? "active" : ""}`}
                            onClick={() => setModelEffortTier("low")}
                            title="Fast response with minimal reasoning tokens"
                          >
                            Low
                          </button>
                          <button
                            type="button"
                            className={`tier-btn tier-medium ${modelEffortTier === "medium" ? "active" : ""}`}
                            onClick={() => setModelEffortTier("medium")}
                            title="Balanced reasoning and response time"
                          >
                            Medium
                          </button>
                          <button
                            type="button"
                            className={`tier-btn tier-high ${modelEffortTier === "high" ? "active" : ""}`}
                            onClick={() => setModelEffortTier("high")}
                            title="Deep reasoning and comprehensive output"
                          >
                            High
                          </button>
                        </div>
                      </div>

                      {/* Verification Prompt & Form Actions */}
                      <div className="form-group" style={{ marginTop: "12px" }}>
                        <label>Verification Prompt</label>
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
                          {isTesting ? "Testing..." : "⚡ Test Connection"}
                        </button>

                        {editingAccountId ? (
                          <>
                            <button
                              type="button"
                              className="test-handshake-btn"
                              title="Exit edit mode without saving changes"
                              onClick={handleDoneEditing}
                              data-testid="btn-done-editing"
                            >
                              Done Editing
                            </button>
                            <button
                              type="submit"
                              className="save-config-btn"
                              disabled={isSaving}
                              data-testid="btn-save"
                            >
                              {isSaving ? "Updating..." : "Update Configuration"}
                            </button>
                          </>
                        ) : (
                          <button
                            type="submit"
                            className="save-config-btn"
                            disabled={isSaving}
                            data-testid="btn-save"
                          >
                            {isSaving ? "Saving..." : "Save Configuration"}
                          </button>
                        )}
                      </div>
                    </form>

                    {/* Test Connection Results Feedback Panel */}
                    {testResult && (() => {
                      const parsed = parseStructuredModelOutput(testResult.modelOutput);
                      return (
                        <div className={`test-feedback-panel ${testResult.status.toLowerCase()}`}>
                          <div className="feedback-header">
                            <span className="feedback-status-pill status-badge">
                              {testResult.status === "VERIFIED" ? "✓ VERIFIED" : "✕ FAILED"}
                            </span>
                            <span className="feedback-protocol protocol-badge">{testResult.protocol.toUpperCase()}</span>
                            <span className={`feedback-effort tier-badge tier-${testResult.effortTier || modelEffortTier}`}>
                              ⚖️ EFFORT: {(testResult.effortTier || modelEffortTier).toUpperCase()} {(testResult.effortTier || modelEffortTier) === "medium" ? "(DEFAULT)" : ""}
                            </span>
                            <span className="feedback-latency latency-badge">⚡ {testResult.latencyMs}ms</span>
                          </div>
                          <p className="feedback-msg feedback-message">{testResult.message}</p>

                          {/* Model Name, CLI Binary, CLI Version, and Reasoning Effort Specs */}
                          <div className="model-cli-specs-card">
                            <div className="spec-item">
                              <span className="spec-label">Model Name</span>
                              <span className="spec-value highlight">🤖 {testResult.modelName || targetModelId}</span>
                            </div>
                            <div className="spec-item">
                              <span className="spec-label">CLI Binary</span>
                              <span className="spec-value">💻 {testResult.cliName || selectedStrategy.cliCommand || cliExecutable || "antigravity"}</span>
                            </div>
                            <div className="spec-item">
                              <span className="spec-label">CLI Version</span>
                              <span className="spec-value">🏷️ {testResult.cliVersion || "v1.4.12"}</span>
                            </div>
                            <div className="spec-item">
                              <span className="spec-label">Reasoning Effort</span>
                              <span className={`spec-value tier-pill tier-${testResult.effortTier || modelEffortTier}`}>
                                {(testResult.effortTier || modelEffortTier).toUpperCase()} {(testResult.effortTier || modelEffortTier) === "medium" ? "(Default)" : ""}
                              </span>
                            </div>
                          </div>

                          {/* Token Consumption, % Consumed, and % Left Quota Meter */}
                          {testResult.tokenMetrics && (
                            <div className="token-quota-meter-card">
                              <div className="meter-header">
                                <span className="meter-title">⚡ Token Consumption & Quota Telemetry</span>
                                <span className="meter-total">{testResult.tokenMetrics.totalTokens} Tokens Consumed</span>
                              </div>
                              <div className="token-breakdown-row">
                                <span className="token-chip prompt-chip">Prompt: <strong>{testResult.tokenMetrics.promptTokens}</strong></span>
                                <span className="token-chip response-chip">Response: <strong>{testResult.tokenMetrics.completionTokens}</strong></span>
                                <span className="token-chip context-chip">Context Limit: <strong>{testResult.tokenMetrics.contextLimit.toLocaleString()}</strong></span>
                                <span className="token-chip quota-chip">Used: <strong>{testResult.tokenMetrics.percentConsumed}%</strong> ({testResult.tokenMetrics.percentLeft}% left)</span>
                              </div>
                              <div className="quota-progress-bar-wrapper">
                                <div
                                  className="quota-progress-bar"
                                  style={{ width: `${Math.max(2, Math.min(100, testResult.tokenMetrics.percentConsumed * 10))}%` }}
                                  title={`${testResult.tokenMetrics.percentConsumed}% of context window consumed`}
                                ></div>
                              </div>
                              <div className="meter-footer-note">
                                <span>✔ <strong>{testResult.tokenMetrics.percentLeft}%</strong> context window available ({((testResult.tokenMetrics.contextLimit - testResult.tokenMetrics.totalTokens)).toLocaleString()} tokens left)</span>
                              </div>
                            </div>
                          )}

                          {parsed && parsed.hasSplit ? (
                            <div className="feedback-model-output model-output-box structured">
                              {parsed.metaText && (
                                <div className="output-meta-banner">
                                  <pre className="meta-text">{parsed.metaText}</pre>
                                </div>
                              )}
                              <div className="output-split-view">
                                <div className="split-block request-block">
                                  <div className="split-label">
                                    <span className="split-icon">⚡</span>
                                    <span>Prompt (Request)</span>
                                  </div>
                                  <div className="split-body">{parsed.promptText}</div>
                                </div>
                                <div className="split-block response-block">
                                  <div className="split-label">
                                    <span className="split-icon">🤖</span>
                                    <span>Model Verification Response</span>
                                  </div>
                                  <div className="split-body">{parsed.responseText}</div>
                                </div>
                              </div>
                            </div>
                          ) : testResult.modelOutput ? (
                            <div className="feedback-model-output model-output-box">
                              <div className="output-header output-label">
                                <span className="output-title-badge">🤖 MODEL VERIFICATION RESPONSE</span>
                              </div>
                              <pre className="output-content">{testResult.modelOutput}</pre>
                            </div>
                          ) : null}

                          {testResult.errorMessage && (
                            <div className="feedback-error-output error-box">
                              <div className="error-header error-label">
                                <span>⚠️ Execution Diagnostic Error:</span>
                              </div>
                              <p className="error-content">{testResult.errorMessage}</p>
                            </div>
                          )}

                          {/* Distributed Telemetry & Investigation Bar */}
                          {(testResult.traceId || testResult.correlationId || testResult.spanId) && (
                            <div className="telemetry-investigation-bar">
                              <div className="telemetry-header">
                                <span className="telemetry-icon">📡</span>
                                <span className="telemetry-title">Distributed Trace Telemetry (W3C OpenTelemetry)</span>
                              </div>
                              <div className="telemetry-grid">
                                {testResult.traceId && (
                                  <div
                                    className="telemetry-item"
                                    onClick={() => {
                                      navigator.clipboard.writeText(testResult.traceId || "");
                                      alert("Trace ID copied!");
                                    }}
                                    title="Click to copy Trace ID"
                                  >
                                    <span className="telemetry-key">Trace ID</span>
                                    <span className="telemetry-val">{testResult.traceId} 📋</span>
                                  </div>
                                )}
                                {testResult.spanId && (
                                  <div
                                    className="telemetry-item"
                                    onClick={() => {
                                      navigator.clipboard.writeText(testResult.spanId || "");
                                      alert("Span ID copied!");
                                    }}
                                    title="Click to copy Span ID"
                                  >
                                    <span className="telemetry-key">Span ID</span>
                                    <span className="telemetry-val">{testResult.spanId} 📋</span>
                                  </div>
                                )}
                                {testResult.correlationId && (
                                  <div
                                    className="telemetry-item"
                                    onClick={() => {
                                      navigator.clipboard.writeText(testResult.correlationId || "");
                                      alert("Correlation ID copied!");
                                    }}
                                    title="Click to copy Correlation ID"
                                  >
                                    <span className="telemetry-key">Correlation ID</span>
                                    <span className="telemetry-val">{testResult.correlationId} 📋</span>
                                  </div>
                                )}
                              </div>
                              {testResult.traceId && (
                                <div className="docker-investigation-row">
                                  <span className="docker-label">Docker Log Filter:</span>
                                  <code className="docker-cmd">docker logs model-connector-service 2&gt;&amp;1 | grep {testResult.traceId}</code>
                                  <button
                                    type="button"
                                    className="copy-docker-btn"
                                    onClick={() => {
                                      navigator.clipboard.writeText(`docker logs model-connector-service 2>&1 | grep ${testResult.traceId}`);
                                      alert("Docker log filter command copied to clipboard!");
                                    }}
                                  >
                                    📋 Copy Docker Filter
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right Column: Existing Configured Accounts Catalog - Hidden when adding an account since list view exists at top */}
                  {formMode !== "create" && (
                    <div className="config-catalog-card">
                      <div className="card-header">
                        <div className="card-header-title">
                          <span className="card-icon">📂</span>
                          <h3>Configured Accounts</h3>
                        </div>

                        <div className="card-header-actions">
                          {/* Model Scope Filter Pills */}
                          <div className="btn-group btn-group-sm" role="group" aria-label="Account scope filter">
                            <button
                              type="button"
                              data-testid="filter-current-model"
                              onClick={() => setFilterToCurrentModel(true)}
                              className={`btn btn-sm ${filterToCurrentModel ? "btn-solid theme-primary active" : "btn-outline theme-secondary"}`}
                              title={`Filter accounts registered to ${targetModelId}`}
                            >
                              Current Model ({currentModelAccountsCount})
                            </button>
                            <button
                              type="button"
                              data-testid="filter-all-models"
                              onClick={() => setFilterToCurrentModel(false)}
                              className={`btn btn-sm ${!filterToCurrentModel ? "btn-solid theme-primary active" : "btn-outline theme-secondary"}`}
                              title="Show all registered accounts across all models"
                            >
                              All ({state.modelAccounts.length})
                            </button>
                          </div>

                          {/* View Mode Switcher: List vs Card */}
                          <div className="btn-group btn-group-sm" role="group" aria-label="Accounts view mode">
                            <button
                              type="button"
                              data-testid="accounts-view-list"
                              onClick={() => setAccountsViewMode("list")}
                              className={`btn btn-sm ${accountsViewMode === "list" ? "btn-solid theme-primary active" : "btn-outline theme-secondary"}`}
                              title="List Mode (Compact table)"
                            >
                              📋 List
                            </button>
                            <button
                              type="button"
                              data-testid="accounts-view-card"
                              onClick={() => setAccountsViewMode("card")}
                              className={`btn btn-sm ${accountsViewMode === "card" ? "btn-solid theme-primary active" : "btn-outline theme-secondary"}`}
                              title="Card Mode (Detailed cards)"
                            >
                              🗂️ Cards
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="credentials-list">
                        {displayedAccounts.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "36px 16px", color: "var(--theme-text-muted)" }}>
                            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📭</div>
                            <p style={{ margin: "0 0 6px 0", fontSize: "0.88rem", color: "var(--theme-text-primary)", fontWeight: 600 }}>
                              {filterToCurrentModel
                                ? `No accounts registered for '${targetModelId}'`
                                : "No accounts configured yet"}
                            </p>
                            <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b" }}>
                              {filterToCurrentModel
                                ? "Configure authentication on the left and click 'Save' to register."
                                : "Select a model and configure credentials to get started."}
                            </p>
                            {filterToCurrentModel && state.modelAccounts.length > 0 && (
                              <button
                                type="button"
                                className="btn btn-outline theme-primary btn-sm"
                                style={{ marginTop: "12px" }}
                                onClick={() => setFilterToCurrentModel(false)}
                              >
                                View All {state.modelAccounts.length} Registered Accounts
                              </button>
                            )}
                          </div>
                        ) : accountsViewMode === "list" ? (
                          /* LIST MODE: Clean Professional List View matching Image 7 */
                          <div className="credentials-list-container">
                            {displayedAccounts.map((acc) => {
                              const isEditingThis = editingAccountId === acc.accountId;
                              const isEditingOther = Boolean(editingAccountId && editingAccountId !== acc.accountId);

                              return (
                                <div
                                  key={acc.accountId}
                                  className={`credential-list-row ${acc.isActive ? "active" : ""} ${isEditingOther ? "account-row-blurred" : isEditingThis ? "account-row-editing" : ""}`}
                                >
                                  <div className="account-row-info">
                                    <div className="account-row-name">
                                      <span
                                        className="account-name-val"
                                        title={cleanAccountDisplayName(acc.accountName, acc.userEmail)}
                                      >
                                        {cleanAccountDisplayName(acc.accountName, acc.userEmail)}
                                      </span>
                                    </div>
                                    <div className="account-row-meta">
                                      <span className="account-owner-val" title={acc.userEmail}>
                                        {acc.userEmail}
                                      </span>
                                      <span className="meta-sep">•</span>
                                      <span className="model-name-text" title={acc.modelId}>
                                        {acc.modelId}
                                      </span>
                                      <span className="meta-sep">•</span>
                                      <span className={`auth-badge ${acc.authType}`}>
                                        {acc.authType === "api" || acc.authType === "api_key"
                                          ? "REST API"
                                          : acc.authType === "cli" || acc.authType === "cli_oauth"
                                            ? "CLI OAuth"
                                            : acc.authType === "oauth"
                                              ? "OAuth 2.0"
                                              : "Cookie"}
                                      </span>
                                      <span className="meta-sep">•</span>
                                      <code className="masked-cred-code" title={acc.maskedCredential}>
                                        {acc.maskedCredential}
                                      </code>
                                    </div>
                                  </div>

                                  <div className="account-row-actions">
                                    <div className="col-status">
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={acc.isActive}
                                        disabled={!isEditingThis}
                                        className={`status-switch ${acc.isActive ? "is-active" : "is-inactive"}`}
                                        onClick={() => handleToggleAccountStatus(acc)}
                                        title={
                                          isEditingThis
                                            ? (acc.isActive ? "Account is ACTIVE. Click to deactivate." : "Account is INACTIVE. Click to activate.")
                                            : "Click 'Edit' on this account to toggle Active/Inactive status"
                                        }
                                      >
                                        <span className="switch-slider">
                                          <span className="switch-knob" />
                                        </span>
                                        <span className="switch-text">{acc.isActive ? "Active" : "Inactive"}</span>
                                      </button>
                                    </div>

                                    <div className="col-actions">
                                      <button
                                        type="button"
                                        className="action-btn test-btn"
                                        onClick={() => handleTestExistingAccount(acc)}
                                        disabled={testingAccountId === acc.accountId}
                                        title="Test connection for this account"
                                      >
                                        {testingAccountId === acc.accountId ? "Testing..." : "Test"}
                                      </button>

                                      <button
                                        type="button"
                                        className={`action-btn select-btn ${isEditingThis ? "save-btn active-save" : ""}`}
                                        onClick={(e) => {
                                          if (isEditingThis) {
                                            void handleSaveConfiguration(e);
                                          } else {
                                            loadAccountIntoEditor(acc);
                                          }
                                        }}
                                        title={isEditingThis ? "Save modifications to this account" : "Load this account into the form editor"}
                                      >
                                        {isEditingThis ? "💾 Save" : "Edit"}
                                      </button>

                                      <button
                                        type="button"
                                        className="action-btn delete-btn"
                                        onClick={() => handleOpenDeleteModal(acc)}
                                        title="Delete this credential"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>

                                  {accountTestResults[acc.accountId] && (() => {
                                    const r = accountTestResults[acc.accountId];
                                    const parsed = parseStructuredModelOutput(r.modelOutput);
                                    return (
                                      <div
                                        className={`account-test-result-panel ${r.status.toLowerCase()}`}
                                        style={{ gridColumn: "1 / -1", marginTop: "6px" }}
                                      >
                                        <div className="res-header">
                                          <span className="res-pill">{r.status}</span>
                                          <span className="res-latency">⚡ {r.latencyMs}ms</span>
                                        </div>
                                        <div className="res-msg">{r.message}</div>
                                        {parsed && parsed.hasSplit ? (
                                          <div className="output-split-view mini">
                                            <div className="split-block request-block">
                                              <div className="split-label">⚡ Prompt:</div>
                                              <div className="split-body">{parsed.promptText}</div>
                                            </div>
                                            <div className="split-block response-block">
                                              <div className="split-label">🤖 Response:</div>
                                              <div className="split-body">{parsed.responseText}</div>
                                            </div>
                                          </div>
                                        ) : r.modelOutput ? (
                                          <pre className="res-output">{r.modelOutput}</pre>
                                        ) : null}
                                        {r.errorMessage && <div className="res-error">{r.errorMessage}</div>}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* CARD MODE: Expanded Kanban Cards */
                          displayedAccounts.map((acc) => {
                            const isEditingThis = editingAccountId === acc.accountId;
                            const isEditingOther = Boolean(editingAccountId && editingAccountId !== acc.accountId);

                            return (
                              <div
                                key={acc.accountId}
                                className={`credential-item-card ${acc.isActive ? "active" : ""} ${isEditingOther ? "card-blurred" : isEditingThis ? "card-editing" : ""}`}
                                data-testid={`credential-card-${acc.accountId}`}
                              >
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

                                  <div className="account-status-toggle-wrapper">
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={acc.isActive}
                                      disabled={!isEditingThis}
                                      data-testid={`status-toggle-${acc.accountId}`}
                                      className={`status-switch ${acc.isActive ? "is-active" : "is-inactive"}`}
                                      onClick={() => handleToggleAccountStatus(acc)}
                                      title={
                                        isEditingThis
                                          ? (acc.isActive ? "Account is ACTIVE. Click to deactivate." : "Account is INACTIVE. Click to activate.")
                                          : "Click 'Edit' on this account to toggle Active/Inactive status"
                                      }
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
                                    <span className="detail-val" title={cleanAccountDisplayName(acc.accountName, acc.userEmail)}>
                                      {cleanAccountDisplayName(acc.accountName, acc.userEmail)}
                                    </span>
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
                                    data-testid={`btn-test-card-${acc.accountId}`}
                                    onClick={() => handleTestExistingAccount(acc)}
                                    disabled={testingAccountId === acc.accountId}
                                    title="Test connection for this account"
                                  >
                                    {testingAccountId === acc.accountId ? "Testing..." : "⚡ Test"}
                                  </button>

                                  <button
                                    type="button"
                                    className={`action-btn select-btn ${isEditingThis ? "save-btn active-save" : ""}`}
                                    data-testid={`btn-edit-card-${acc.accountId}`}
                                    onClick={(e) => {
                                      if (isEditingThis) {
                                        void handleSaveConfiguration(e);
                                      } else {
                                        loadAccountIntoEditor(acc);
                                      }
                                    }}
                                    title={isEditingThis ? "Save modifications to this account" : "Load this account into the form editor"}
                                  >
                                    {isEditingThis ? "💾 Save" : "✏️ Edit"}
                                  </button>

                                  <button
                                    type="button"
                                    className="action-btn delete-btn"
                                    data-testid={`btn-delete-card-${acc.accountId}`}
                                    onClick={() => handleOpenDeleteModal(acc)}
                                    title="Delete this credential"
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>

                                {accountTestResults[acc.accountId] && (() => {
                                  const r = accountTestResults[acc.accountId];
                                  const parsed = parseStructuredModelOutput(r.modelOutput);
                                  return (
                                    <div className={`account-test-result-panel ${r.status.toLowerCase()}`}>
                                      <div className="res-header">
                                        <span className="res-pill">{r.status}</span>
                                        <span className="res-latency">⚡ {r.latencyMs}ms</span>
                                      </div>
                                      <div className="res-msg">{r.message}</div>
                                      {parsed && parsed.hasSplit ? (
                                        <div className="output-split-view mini">
                                          <div className="split-block request-block">
                                            <div className="split-label">⚡ Prompt:</div>
                                            <div className="split-body">{parsed.promptText}</div>
                                          </div>
                                          <div className="split-block response-block">
                                            <div className="split-label">🤖 Response:</div>
                                            <div className="split-body">{parsed.responseText}</div>
                                          </div>
                                        </div>
                                      ) : r.modelOutput ? (
                                        <pre className="res-output">{r.modelOutput}</pre>
                                      ) : null}
                                      {r.errorMessage && <div className="res-error">{r.errorMessage}</div>}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : undefined
          }
        />
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

      {/* Chat Session Choice Modal (Fresh Session vs Resume Existing) */}
      {isChatChoiceModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsChatChoiceModalOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="delete-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "460px",
              width: "90%",
              background: "#1e293b",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <span style={{ fontSize: "1.6rem" }}>💬</span>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#f8fafc", fontWeight: 700 }}>
                  Chat with {chatTargetModel}
                </h3>
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  Select conversation session mode
                </span>
              </div>
            </div>

            <p style={{ margin: "10px 0 16px 0", fontSize: "0.85rem", color: "#cbd5e1", lineHeight: 1.5 }}>
              You have an existing conversation with history. Would you like to spawn a fresh new session or resume your current conversation?
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                type="button"
                onClick={handleStartFreshChat}
                style={{
                  padding: "12px 16px",
                  background: "linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.35) 100%)",
                  border: "1px solid rgba(16, 185, 129, 0.5)",
                  color: "#6ee7b7",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "all 0.2s ease",
                }}
              >
                <span>➕ Start New Chat Session</span>
                <span style={{ fontSize: "0.72rem", opacity: 0.85 }}>Clear context</span>
              </button>

              <button
                type="button"
                onClick={handleResumeExistingChat}
                style={{
                  padding: "12px 16px",
                  background: "rgba(59, 130, 246, 0.15)",
                  border: "1px solid rgba(59, 130, 246, 0.35)",
                  color: "#93c5fd",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "all 0.2s ease",
                }}
              >
                <span>💬 Resume Existing Chat</span>
                <span style={{ fontSize: "0.72rem", opacity: 0.85 }}>Keep previous messages</span>
              </button>
            </div>

            <div style={{ marginTop: "18px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setIsChatChoiceModalOpen(false)}
                style={{
                  padding: "6px 14px",
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "6px",
                  color: "#94a3b8",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
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
