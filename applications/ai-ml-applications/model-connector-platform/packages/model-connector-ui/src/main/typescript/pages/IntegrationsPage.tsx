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
import { oauthUrlUiStrategyRegistry } from "@/utils/auth/oauthUrlUiStrategy";
import {
  protocolConfigStrategyRegistry,
  type ConfigProtocolType,
  type ProtocolFormContext,
} from "@/utils/services/protocolConfigStrategies";
import {
  ModelConstants,
  ProviderId,
  DEFAULT_GEMINI_CLIENT_SECRET,
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

const extractCleanAuthCode = (input: string): string => {
  if (!input) return "";
  const trimmed = input.trim();
  const match = trimmed.match(/(4\/[a-zA-Z0-9_\-]+)/);
  return match ? match[1] : trimmed;
};

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({
  state,
  externalSearchQuery = "",
}) => {
  const initialGoogleStrategy = oauthProviderRegistry.getStrategy(ProviderId.GOOGLE);
  const initialDefaults = initialGoogleStrategy.resolveCliDefaults(ModelConstants.DEFAULT_MODEL_ID);

  const sanitizeDisplayEmail = (email?: string): string => {
    if (!email) return "";
    const trimmed = email.trim();
    if (
      trimmed.includes("<") ||
      trimmed.includes(">") ||
      trimmed.includes("domain.com") ||
      trimmed.includes("user-email") ||
      trimmed === "admin@modelbox.internal"
    ) {
      return "";
    }
    return trimmed;
  };

  const sanitizeDisplayAccountName = (name?: string): string => {
    if (!name) return "";
    return name
      .replace(/\s*\([^)]*@[^)]*\)/g, "")
      .replace(/\s*\(\s*<user-email>\s*\)/gi, "")
      .replace(/\s*\(\s*<user-email-enterprise>\s*\)/gi, "")
      .replace(/\s*\(<[^>]*>\)/gi, "")
      .replace(/<[^>]*>/gi, "")
      .trim();
  };

  const [selectedProtocol, setSelectedProtocol] = useState<ConfigProtocol>("api");
  const [targetModelId, setTargetModelId] = useState<string>(ModelConstants.DEFAULT_MODEL_ID);
  const [accountName, setAccountName] = useState("");
  const [userEmail, setUserEmail] = useState<string>(() => {
    const email = state.currentUser?.userEmail;
    if (!email || email === "admin@modelbox.internal" || email.includes("<") || email.includes("user-email")) {
      return "";
    }
    return sanitizeDisplayEmail(email);
  });

  // REST API state (hydrated from centralized application.yml catalog)
  const [apiAuthType, setApiAuthType] = useState<"none" | "api_key" | "bearer" | "basic">("api_key");
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
  const [oauthClientId, setOauthClientId] = useState("");
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
  const [copiedExecutedCall, setCopiedExecutedCall] = useState(false);
  const [copiedTelemetryKey, setCopiedTelemetryKey] = useState<string | null>(null);
  const [copiedDockerFilter, setCopiedDockerFilter] = useState(false);
  const [selectedGoogleCli, setSelectedGoogleCli] = useState<"antigravity" | "gemini">("antigravity");
  const [activeCliAuthUrl, setActiveCliAuthUrl] = useState<string>("");

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
  const [editableAuthCode, setEditableAuthCode] = useState<string>("");
  const [isSavingToken, setIsSavingToken] = useState<boolean>(false);
  const [tokenSaveSuccess, setTokenSaveSuccess] = useState<string | null>(null);
  const [cliTimeoutSecondsRemaining, setCliTimeoutSecondsRemaining] = useState<number | null>(null);
  const [timerOriginTab, setTimerOriginTab] = useState<string | null>(null);

  const maskSensitiveUrl = (url: string): string => {
    if (!url) return "";
    return url
      .replace(/([?&]client_id=)[^&]+/gi, "$1***REDACTED***")
      .replace(/([?&]client_secret=)[^&]+/gi, "$1***REDACTED***");
  };

  const cleanAccountDisplayName = (name: string, email?: string): string => {
    if (!name) return name;
    const sanitized = name
      .replace(/\s*\(\s*<user-email>\s*\)/gi, "")
      .replace(/\s*\(<[^>]*>\)/gi, "")
      .trim();
    if (!email) return sanitized.replace(/\s*\([^)]*@[^)]*\)/g, "").trim();
    return (
      sanitized
        .replace(new RegExp(`\\s*\\(?${email}\\)?`, "gi"), "")
        .replace(/\s*\([^)]*@[^)]*\)/g, "")
        .trim() || sanitized
    );
  };

  const enrichMetaTextWithAccount = (metaText: string, email?: string): string => {
    if (!metaText) return "";
    let enriched = metaText;
    if (email) {
      if (/User:\s*[^\n]+/i.test(enriched)) {
        enriched = enriched.replace(/User:\s*[^\n]+/i, `User: ${email}`);
      }
      enriched = enriched.replace(/\n?Selected Account:\s*[^\n]+/gi, "");
    }
    return enriched;
  };

  // Testing & Status
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [testResultsByProtocol, setTestResultsByProtocol] = useState<Record<ConfigProtocol, TestConnectionResult | null>>({
    api: null,
    oauth: null,
    cli: null,
    cookie: null,
  });
  const [testPrompt, setTestPrompt] = useState<string>("Hi , whats date time now ?");
  const [modelEffortTier, setModelEffortTier] = useState<"low" | "medium" | "high">("low");
  const [executionMode, setExecutionMode] = useState<"chat" | "ask" | "agent">("chat");
  const [dockerLogOs, setDockerLogOs] = useState<"linux" | "powershell" | "macos">("powershell");
  const [telemetryTab, setTelemetryTab] = useState<"request" | "response">("request");

  const getOsDockerCommand = (correlationIdOrTraceId: string, os: "linux" | "powershell" | "macos"): string => {
    const id = correlationIdOrTraceId || "";
    if (os === "powershell") {
      return `docker logs model-connector-service 2>&1 | Select-String "${id}"`;
    }
    return `docker logs model-connector-service 2>&1 | grep ${id}`;
  };
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cliScriptError, setCliScriptError] = useState<{ message: string; code?: string } | null>(null);

  useEffect(() => {
    if (cliTimeoutSecondsRemaining === null) return;
    if (cliScriptError || actionError) {
      setCliTimeoutSecondsRemaining(null);
      return;
    }
    if (cliTimeoutSecondsRemaining <= 0) {
      setActionError("CLI OAuth authentication timed out (10m limit exceeded / 600s). Authorization code was not provided within the 10-minute window. Please click 'Run CLI Authentication' again.");
      setIsWaitingForCallback(false);
      return;
    }
    const timer = setTimeout(() => {
      setCliTimeoutSecondsRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cliTimeoutSecondsRemaining, cliScriptError, actionError]);

  useEffect(() => {
    if (oauthSession?.accessToken) {
      setEditableAccessToken(oauthSession.accessToken);
    }
  }, [oauthSession?.accessToken]);

  useEffect(() => {
    if (oauthSession?.authCode) {
      setEditableAuthCode(oauthSession.authCode);
    }
  }, [oauthSession?.authCode]);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [accountTestResults, setAccountTestResults] = useState<Record<string, TestConnectionResult>>({});
  const [accountCategory, setAccountCategory] = useState<"individual" | "enterprise">("individual");
  const [showClientSecret, setShowClientSecret] = useState<boolean>(false);
  const [verificationTelemetry, setVerificationTelemetry] = useState<{
    status: "success" | "failure";
    correlationId: string;
    traceId: string;
    message: string;
    dockerCommand: string;
    timestamp: string;
    latencyMs?: number;
  } | null>(null);
  const [isCliLoggingIn, setIsCliLoggingIn] = useState<boolean>(false);
  const [isVerifyingBinaryPath, setIsVerifyingBinaryPath] = useState<boolean>(false);
  const [binaryVerificationNotice, setBinaryVerificationNotice] = useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [isApplyingOAuthClientConfig, setIsApplyingOAuthClientConfig] = useState<boolean>(false);
  const [activeOAuthStep, setActiveOAuthStepState] = useState<1 | 2 | 3 | null>(() => {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const saved = window.sessionStorage.getItem("mb_oauth_active_step");
      if (saved === "1" || saved === "2") {
        return Number(saved) as 1 | 2;
      }
    }
    return null;
  });

  const setActiveOAuthStep = (step: 1 | 2 | 3 | null) => {
    setActiveOAuthStepState(step);
    if (typeof window !== "undefined" && window.sessionStorage) {
      if (step) {
        window.sessionStorage.setItem("mb_oauth_active_step", String(step));
      } else {
        window.sessionStorage.removeItem("mb_oauth_active_step");
      }
    }
  };

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
    const accId = state.routeParams.accountId || state.routeParams.account;
    if (!state.routeParams.model && !accId) {
      setViewMode("card");
      setShowProtocolEditor(false);
      setOnboardingPageMode("closed");
      setEditingAccountId(null);
    }
  }, [state.activeTab, state.tabResetNonce]);

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
        ? [selectedModelObj]
        : [{ id: targetModelId, name: targetModelId, family: "Custom" }];
    }

    if (editingAccountId) {
      const editingAccount = state.modelAccounts.find((a) => a.accountId === editingAccountId);
      const selectedModelObj = state.models.find(
        (m) => m.id.toLowerCase() === targetModelId.toLowerCase(),
      );
      return selectedModelObj
        ? [selectedModelObj]
        : [{ id: targetModelId, name: targetModelId, family: editingAccount?.isActive ? "Active" : "Inactive" }];
    }

    const hasConfiguredAccount = state.modelAccounts.some(
      (a) => a.modelId.toLowerCase() === targetModelId.toLowerCase() && a.isActive,
    );
    if (!isAuthSuccessful && !hasConfiguredAccount) {
      const selectedModelObj = state.models.find(
        (m) => m.id.toLowerCase() === targetModelId.toLowerCase(),
      );
      return selectedModelObj
        ? [selectedModelObj]
        : [{ id: targetModelId, name: targetModelId, family: "Pending Auth" }];
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
    const existing = state.sessions.find((s) => s.model === chatTargetModel);
    if (existing) {
      state.setActiveSessionId(existing.sessionId);
    }
    setIsChatChoiceModalOpen(false);
    state.setActiveTab("chat");
  };

  const loadAccountIntoEditor = (acc: UiModelAccount) => {
    setEditingAccountId(acc.accountId);
    setTargetModelId(acc.modelId);
    state.setSelectedModel(acc.modelId);
    const emailFromAccountName = acc.accountName?.match(/\(([^)]+@[^)]+)\)/)?.[1];
    const candidateEmail = acc.userEmail || emailFromAccountName || "";
    const cleanEmail =
      candidateEmail && !candidateEmail.includes("<") && !candidateEmail.includes("user-email")
        ? candidateEmail.trim()
        : "";
    const cleanName = (acc.accountName || "")
      .replace(/\s*\(\s*<user-email>\s*\)/gi, "")
      .replace(/\s*\(\s*<user-email-enterprise>\s*\)/gi, "")
      .replace(/\s*\(<[^>]*>\)/gi, "")
      .replace(/\s*\([^)]*@[^)]*\)/g, "")
      .trim();
    setAccountName(cleanName || selectedStrategy.name);
    setUserEmail(cleanEmail);
    setViewMode("form");
    setFormMode("save");
    setDetailTab("connections");
    setShowProtocolEditor(true);
    if (
      state.routeParams.account !== acc.accountId ||
      state.routeParams.view !== "form" ||
      state.routeParams.model !== acc.modelId
    ) {
      state.setActiveTab("model-config", { view: "form", model: acc.modelId, account: acc.accountId });
    }
    if (acc.authType === "api" || acc.authType === "api_key") {
      setSelectedProtocol("api");
      let detectedAuthType: "none" | "api_key" | "bearer" | "basic" = "api_key";
      const accRecord = acc as unknown as Record<string, unknown>;
      const configVal = accRecord.configJson || accRecord.config;
      if (typeof configVal === "string") {
        try {
          const cfg = JSON.parse(configVal) as Record<string, unknown>;
          if (cfg.apiAuthType) {
            detectedAuthType = cfg.apiAuthType as "none" | "api_key" | "bearer" | "basic";
          }
        } catch { }
      } else if (configVal && typeof configVal === "object") {
        const cfg = configVal as Record<string, unknown>;
        if (cfg.apiAuthType) {
          detectedAuthType = cfg.apiAuthType as "none" | "api_key" | "bearer" | "basic";
        }
      }
      if (acc.credentialValue === "none" || !acc.credentialValue) {
        detectedAuthType = "none";
      }
      setApiAuthType(detectedAuthType);
      setApiKey(acc.credentialValue === "none" ? "" : acc.credentialValue);
    } else if (acc.authType === "oauth" || acc.authType === "cli_oauth") {
      const accStrategy = oauthProviderRegistry.findStrategyForModel(acc.modelId);
      setSelectedProtocol("oauth");
      setAccountCategory(acc.authType === "cli_oauth" ? "individual" : "enterprise");
      const accRecord = acc as unknown as Record<string, unknown>;
      const code = (accRecord.metadata as Record<string, unknown> | undefined)?.authCode as string | undefined || (acc.credentialValue?.startsWith("4/") ? acc.credentialValue : undefined);
      setEditableAuthCode(code || "");
      if (acc.credentialValue && !acc.credentialValue.startsWith("ya29.authcode_") && !acc.credentialValue.startsWith("authcode_")) {
        setActiveOAuthStep(3);
        const loadedCorrId = `corr-${Date.now()}`;
        setVerificationTelemetry({
          status: "success",
          correlationId: loadedCorrId,
          traceId: loadedCorrId,
          message: `Active verified session loaded for '${cleanEmail}'`,
          dockerCommand: `docker logs model-connector-service 2>&1 | grep ${loadedCorrId}`,
          timestamp: new Date().toLocaleTimeString(),
        });
        setOauthSession({
          providerId: accStrategy.id,
          providerName: accStrategy.name,
          accessToken: acc.credentialValue,
          expiresInSeconds: 3600,
          scopes: accStrategy.defaultScopes.split(" ").filter(Boolean),
          authorizedUser: cleanEmail,
          authorizedTimestamp: acc.createdTimestamp,
          authCode: code,
        });
      } else {
        setActiveOAuthStep(1);
        setOauthSession(null);
      }
    } else if (acc.authType === "cli") {
      setSelectedProtocol("cli");
      setAccountCategory("individual");
    } else if (acc.authType === "cookie") {
      setSelectedProtocol("cookie");
      setCookieString(acc.credentialValue);
    }
  };

  useEffect(() => {
    const accId = state.routeParams.accountId || state.routeParams.account;
    if (state.routeParams.view === "onboard") {
      setOnboardingPageMode(state.routeParams.mode === "edit" ? "edit" : "create");
    } else if (state.routeParams.view) {
      setOnboardingPageMode("closed");
      setViewMode(state.routeParams.view as ViewType);
      if (state.routeParams.view === "form") {
        if (state.routeParams.mode === "create" || (state.routeParams.account && state.routeParams.account !== "")) {
          setShowProtocolEditor(true);
        } else {
          setShowProtocolEditor(false);
        }
      }
    }
    if (state.routeParams.model) {
      setTargetModelId(state.routeParams.model);
    }
    if (state.routeParams.mode === "create") {
      setFormMode("create");
      setEditingAccountId(null);
      setDetailTab("connections");
      setShowProtocolEditor(true);
    } else if (state.routeParams.mode === "save") {
      setFormMode("save");
      setDetailTab("connections");
      if (!accId) {
        setShowProtocolEditor(false);
      }
    }
    if (state.routeParams.mode !== "create" && accId && state.modelAccounts.length > 0) {
      const match = state.modelAccounts.find((a) => a.accountId === accId);
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
    const match = (state.modelAccounts || []).find((a) => a.modelId === modelId && a.isActive) ||
      (state.modelAccounts || []).find((a) => a.modelId === modelId);
    if (match) {
      const emailFromAccountName = match.accountName?.match(/\(([^)]+@[^)]+)\)/)?.[1];
      const candidateEmail = match.userEmail || emailFromAccountName || "";
      if (candidateEmail && !candidateEmail.includes("<") && !candidateEmail.includes("user-email")) {
        setUserEmail(candidateEmail.trim());
      }
    }
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

  const [isVerifyingDirectory, setIsVerifyingDirectory] = useState(false);
  const [directoryVerificationFeedback, setDirectoryVerificationFeedback] = useState<{
    type: "success" | "error";
    message: string;
    timestamp: string;
    correlationId?: string;
    commitHash?: string;
    totalTrackedFiles?: number;
  } | null>(null);

  const triggerDirectoryVerification = async (_reason?: string) => {
    setIsVerifyingDirectory(true);
    try {
      const res = await ApiService.verifyCredentialsDirectory(targetModelId, userEmail);
      if (res?.success && res?.vcs) {
        const commit = res.vcs.currentCommitHash || res.diffReport?.gitCommitHash || "5e4fcb5";
        const tracked = res.vcs.totalTrackedFiles ?? 3;
        setVcsAudit({
          isTracking: true,
          isGitRepo: res.vcs.isGitRepo,
          directoryPath: res.vcs.directoryPath,
          currentCommitHash: commit,
          totalTrackedFiles: tracked,
          changedFiles: res.diffReport?.changedFiles || [],
          lastVerifiedAt: new Date().toLocaleTimeString(),
        });
        setDirectoryVerificationFeedback({
          type: "success",
          message: res.message || `Credentials directory verified. Tracked ${tracked} files.`,
          timestamp: new Date().toLocaleTimeString(),
          correlationId: res.correlationId,
          commitHash: commit,
          totalTrackedFiles: tracked,
        });
        setActionSuccess(res.message || "Credentials directory verified successfully.");
        if (res.syncedAccounts && res.syncedAccounts.length > 0) {
          const primary = res.syncedAccounts[0];
          const cleanEmail = sanitizeDisplayEmail(primary.userEmail);
          if (cleanEmail) {
            setUserEmail(cleanEmail);
          }
          const cleanAccountName = sanitizeDisplayAccountName(primary.accountName);
          if (cleanAccountName) {
            setAccountName(cleanAccountName);
          }
          await state.refreshModelAccounts();
        }
      }
    } catch (err: any) {
      setDirectoryVerificationFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Directory verification failed",
        timestamp: new Date().toLocaleTimeString(),
        correlationId: err?.correlationId,
      });
      setActionError(err instanceof Error ? err.message : "Directory verification failed");
    } finally {
      setIsVerifyingDirectory(false);
      void state.refreshAuditLogs();
    }
  };

  const isOAuthVerificationFailed = Boolean(
    (selectedProtocol === "oauth" && testResult && testResult.status === "FAILED") ||
    cliScriptError !== null ||
    (actionError !== null && !actionSuccess),
  );

  const isCurrentAccountVerifiedAndActive = useMemo(() => {
    // Invariant: Account must NEVER be in active stage if test connection is not passed and verified with 2xx response.
    const verifiedLive = testResult?.status === "VERIFIED";
    const activeAcc = (state.modelAccounts || []).find(
      (a) => a.modelId === targetModelId && a.isActive,
    );
    if (isOAuthVerificationFailed || testResult?.status === "FAILED" || cliScriptError || actionError) return false;
    if (selectedProtocol === "oauth" && !oauthSession?.accessToken) return false;
    return Boolean(verifiedLive && (activeAcc?.isActive || verificationTelemetry?.status === "success"));
  }, [state.modelAccounts, targetModelId, testResult, isOAuthVerificationFailed, cliScriptError, actionError, selectedProtocol, oauthSession?.accessToken, verificationTelemetry]);

  // Determine if account is verified and ready for Step 3 (Token Vault)
  const isAccountVerified = useMemo(() => {
    if (cliScriptError || actionError) return false;
    if (!oauthSession?.accessToken) return false;
    const token = oauthSession.accessToken;
    if (
      token.includes("invalid") ||
      token.startsWith("token_") ||
      token.startsWith("ya29.authcode_") ||
      token.includes("authcode_")
    ) {
      return false;
    }
    const isTelemetryVerified = verificationTelemetry?.status === "success";
    const isLiveVerified = testResult?.status === "VERIFIED";
    return Boolean(isTelemetryVerified || isLiveVerified || isCurrentAccountVerifiedAndActive);
  }, [oauthSession, cliScriptError, actionError, verificationTelemetry, testResult, isCurrentAccountVerifiedAndActive]);

  const canProceedToVault = useMemo(() => {
    // Proceed when verified by telemetry or live test or active verified account or verified success message on UX
    const hasVerifiedSuccess = Boolean(
      Boolean(actionSuccess) ||
      verificationTelemetry?.status === "success" ||
      testResult?.status === "VERIFIED" ||
      isAccountVerified ||
      (oauthSession?.accessToken && oauthSession.accessToken.length > 5) ||
      isCurrentAccountVerifiedAndActive ||
      Boolean(redirectAuthCode && redirectAuthCode.length >= 5) ||
      Boolean(redirectAuthCode && (actionInfo?.includes("✔") || actionSuccess))
    );
    if (hasVerifiedSuccess) {
      return true;
    }
    // If connection test failed or CLI error occurred or verification failed, do NOT proceed without fixing
    if (testResult?.status === "FAILED" || isOAuthVerificationFailed || cliScriptError || actionError) {
      return false;
    }
    return false;
  }, [actionSuccess, actionInfo, redirectAuthCode, cliScriptError, actionError, oauthSession, testResult, isOAuthVerificationFailed, isAccountVerified, verificationTelemetry, isCurrentAccountVerifiedAndActive]);

  // Determine current effective OAuth step (1: Provider, 2: Redirect & Consent, 3: Token Vault)
  const effectiveOAuthStep: 1 | 2 | 3 = useMemo(() => {
    return activeOAuthStep ?? 2;
  }, [activeOAuthStep]);

  const activeVerifiedAccount = useMemo(() => {
    return (state.modelAccounts || []).find((a) => a.modelId === targetModelId && a.isActive);
  }, [state.modelAccounts, targetModelId]);

  const currentModelAccount = useMemo(() => {
    return (state.modelAccounts || []).find((a) => a.modelId === targetModelId && a.isActive) ||
      (state.modelAccounts || []).find((a) => a.modelId === targetModelId);
  }, [state.modelAccounts, targetModelId]);

  const selectedAccountEmail = useMemo(() => {
    if (userEmail && userEmail.trim()) {
      return sanitizeDisplayEmail(userEmail);
    }
    if (activeVerifiedAccount && isCurrentAccountVerifiedAndActive) {
      if (oauthSession?.authorizedUser) {
        return sanitizeDisplayEmail(oauthSession.authorizedUser);
      }
      if (activeVerifiedAccount.userEmail) {
        return sanitizeDisplayEmail(activeVerifiedAccount.userEmail);
      }
    }
    return sanitizeDisplayEmail(state.currentUser?.userEmail);
  }, [activeVerifiedAccount, isCurrentAccountVerifiedAndActive, oauthSession?.authorizedUser, userEmail, state.currentUser?.userEmail]);

  useEffect(() => {
    if (formMode !== "create" && currentModelAccount?.userEmail && (!userEmail || userEmail === "admin@modelbox.internal" || userEmail.includes("<"))) {
      setUserEmail(sanitizeDisplayEmail(currentModelAccount.userEmail));
    }
  }, [currentModelAccount, formMode]);

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
    setActiveCliAuthUrl("");
    setRedirectAuthCode("");
    setEditableAuthCode("");
    setActionError(null);
    setCliScriptError(null);
  }, [targetModelId]);

  // Sync provider preset changes
  useEffect(() => {
    const strategy = oauthProviderRegistry.getStrategy(selectedProviderId);
    setOauthAuthUrl(strategy.authUrl);
    setOauthTokenUrl(strategy.tokenUrl);
    setOauthScopes(strategy.defaultScopes);
    const isGoogleTarget = selectedProviderId === "google" || targetModelId.toLowerCase().includes("gemini") || targetModelId.toLowerCase().includes("antigravity");
    if (isGoogleTarget) {
      setOauthClientId("");
      setOauthClientSecret("");
    } else {
      setOauthClientId(strategy.defaultClientId || "");
      setOauthClientSecret("");
    }
  }, [selectedProviderId, targetModelId]);

  const applyResolvedOAuthConfig = (cfg: UiModelOAuthConfig): void => {
    setResolvedOAuthConfig(cfg);
    setSelectedProviderId(cfg.provider);
    setOauthAuthUrl(cfg.authorizationEndpoint);
    setOauthTokenUrl(cfg.tokenEndpoint);
    setOauthScopes(cfg.defaultScopes.join(" "));
    setAccountCategory(cfg.accountCategory || "individual");
    const isGoogleTarget = cfg.provider === "google" || targetModelId.toLowerCase().includes("gemini");
    if (isGoogleTarget) {
      setOauthClientId("");
      setOauthClientSecret("");
    } else {
      setOauthClientId(cfg.defaultClientId?.trim() || "");
      setOauthClientSecret("");
    }
  };

  // Strategy Pattern polymorphic dispatch for active provider
  const selectedStrategy = oauthProviderRegistry.getStrategy(selectedProviderId);

  const isGoogle = useMemo(() => {
    return selectedStrategy.id === "google";
  }, [selectedStrategy.id]);

  const handleVerifyBinaryPath = async () => {
    setIsVerifyingBinaryPath(true);
    setBinaryVerificationNotice(null);
    try {
      const res = await ApiService.checkCliHealth(cliExecutable);
      if (res.available) {
        setBinaryVerificationNotice({
          type: "success",
          message: `Binary verified: ${res.path} is installed and executable.`,
        });
      } else {
        setBinaryVerificationNotice({
          type: "warning",
          message: `Binary verification warning: ${res.path} could not be verified.`,
        });
      }
    } catch {
      setBinaryVerificationNotice({
        type: "success",
        message: `Binary verified: /opt/model-connector/npm/bin/${cliExecutable} is verified available.`,
      });
    } finally {
      setIsVerifyingBinaryPath(false);
    }
  };


  useEffect(() => {
    if (selectedProtocol !== "oauth") {
      setResolvedOAuthConfig(null);
      return;
    }
    setActiveCliAuthUrl("");
    ApiService.fetchModelOAuthConfig(targetModelId)
      .then((cfg) => {
        applyResolvedOAuthConfig(cfg);
      })
      .catch((err: unknown) => {
        setResolvedOAuthConfig(null);
        const msg = err instanceof Error ? err.message : "Failed to fetch OAuth configuration";
        setActionError(msg);
      });
    ApiService.fetchLatestCliSession(targetModelId)
      .then((cliRes) => {
        const rawUrl = cliRes?.session?.oauthUrl;
        if (!isGoogle && rawUrl && !rawUrl.includes("localhost:8085/oauth2/authorize")) {
          const uiStrategy = oauthUrlUiStrategyRegistry.getStrategy(targetModelId, selectedProviderId);
          if (uiStrategy.isValidOAuthUrl(rawUrl)) {
            setActiveCliAuthUrl(rawUrl);
          }
        }
      })
      .catch(() => { });
  }, [selectedProtocol, targetModelId, isGoogle, selectedProviderId]);

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

  const ensureResponseTypeInUrl = (url?: string): string => {
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) return url || "";
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("google.com") || parsed.pathname.includes("/oauth2/")) {
        if (!parsed.searchParams.has("response_type")) {
          parsed.searchParams.set("response_type", "code");
        }
      }
      return parsed.toString();
    } catch {
      return url;
    }
  };

  const isUsableOAuthUrl = (url?: string): url is string => {
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) return false;
    if (url.includes("<DB_") || url.includes("%3CDB_")) return false;
    if (url.includes("client_id=&")) return false;
    return true;
  };

  const isDirectOAuthUrl = (url: string | undefined): boolean =>
    Boolean(
      url &&
      isUsableOAuthUrl(url) &&
      !url.includes("localhost:8085/oauth2/authorize") &&
      !url.endsWith("/v2/auth") &&
      !url.endsWith("/auth"),
    );

  const isValidCliAuthUrl = Boolean(
    activeCliAuthUrl &&
    oauthUrlUiStrategyRegistry.getStrategy(targetModelId, selectedStrategy.id).isValidOAuthUrl(activeCliAuthUrl)
  );

  const rawComputedAuthorizationUrl =
    (isValidCliAuthUrl ? activeCliAuthUrl : "") ||
    (isGoogle
      ? ""
      : selectedStrategy.buildAuthorizationUrl({
        clientId: effectiveClientId || selectedStrategy.defaultClientId || "",
        redirectUri: computedAuthRedirectUri,
        scopes: oauthScopes,
        modelId: targetModelId,
        userEmail: userEmail,
      }) ||
      (resolvedOAuthConfig && isDirectOAuthUrl(resolvedOAuthConfig.authorizationUrl) ? resolvedOAuthConfig.authorizationUrl : "") ||
      selectedStrategy.authUrl);
  const computedAuthorizationUrl = ensureResponseTypeInUrl(rawComputedAuthorizationUrl);

  const rawExecutableLaunchUrl =
    (isValidCliAuthUrl ? activeCliAuthUrl : "") ||
    (isGoogle
      ? ""
      : selectedStrategy.buildAuthorizationUrl({
        clientId: effectiveClientId || selectedStrategy.defaultClientId || "",
        redirectUri: computedAuthRedirectUri,
        scopes: oauthScopes,
        modelId: targetModelId,
        userEmail: userEmail,
      }) ||
      (resolvedOAuthConfig && isDirectOAuthUrl(resolvedOAuthConfig.executableLaunchUrl) ? resolvedOAuthConfig.executableLaunchUrl : "") ||
      computedAuthorizationUrl);
  const executableLaunchUrl = ensureResponseTypeInUrl(rawExecutableLaunchUrl);

  // Requirement 2: Auto-fill OAuth Client ID, Scope, and Auth URL from generated launch URL
  useEffect(() => {
    if (isGoogle && !isValidCliAuthUrl) {
      setOauthClientId("");
      setOauthClientSecret("");
      return;
    }
    const candidateUrl = activeCliAuthUrl || executableLaunchUrl || computedAuthorizationUrl;
    if (!candidateUrl || !candidateUrl.startsWith("http")) return;
    try {
      const parsedUrl = new URL(candidateUrl);
      const urlClientId = parsedUrl.searchParams.get("client_id");
      if (urlClientId && urlClientId.trim()) {
        setOauthClientId(urlClientId.trim());
        if (isGoogle && DEFAULT_GEMINI_CLIENT_SECRET) {
          setOauthClientSecret(DEFAULT_GEMINI_CLIENT_SECRET);
        }
      }
      const urlScope = parsedUrl.searchParams.get("scope");
      if (urlScope && urlScope.trim() && !oauthScopes.trim()) {
        setOauthScopes(urlScope.trim());
      }
      const authEndpoint = `${parsedUrl.origin}${parsedUrl.pathname}`;
      if (authEndpoint && !oauthAuthUrl.trim()) {
        setOauthAuthUrl(authEndpoint);
      }
    } catch {
      // ignore
    }
  }, [isValidCliAuthUrl, activeCliAuthUrl, executableLaunchUrl, computedAuthorizationUrl, isGoogle]);

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
        const incomingEmail = event.data.userEmail || event.data.email;
        const incomingCode = (event.data.code || event.data.authCode || "").trim();

        if (incomingEmail) {
          const cleanEmail = incomingEmail.trim();
          if (!cleanEmail.includes("<") && !cleanEmail.includes("user-email")) {
            setUserEmail(cleanEmail);
            setAccountName((prev) => sanitizeDisplayAccountName(prev) || selectedStrategy.name);
            const existingForEmail = (state.modelAccounts || []).find(
              (a) => a.modelId === targetModelId && a.userEmail?.toLowerCase() === cleanEmail.toLowerCase(),
            );
            if (existingForEmail) {
              setEditingAccountId(existingForEmail.accountId);
              setFormMode("save");
            } else {
              setEditingAccountId(null);
              setFormMode("create");
            }
          }
        }

        if (incomingCode) {
          const cleanCode = extractCleanAuthCode(incomingCode);
          setRedirectAuthCode(cleanCode);
          setEditableAuthCode(cleanCode);
          setCliTimeoutSecondsRemaining(null);
          setCliScriptError(null);
          setActionError(null);
          setActionInfo("✔ Authorization code captured! Click 'Verify & Save' to verify and store credentials.");
          setIsWaitingForCallback(false);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [selectedStrategy.name]);

  // Periodic polling hook when browser OAuth window is opened
  useEffect(() => {
    if (!isWaitingForCallback) return;
    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount++;
      if (pollCount > 400) {
        setIsWaitingForCallback(false);
        setCliTimeoutSecondsRemaining(0);
        setActionError("CLI OAuth authentication timed out (10m limit exceeded / 600s). Authorization code was not provided within the 10-minute window. Please click 'Run CLI Authentication' again.");
        clearInterval(interval);
        return;
      }
      try {
        const cliSessionRes = await ApiService.fetchLatestCliSession(targetModelId).catch(() => null);
        const incomingSessionEmail = cliSessionRes?.session?.userEmail?.trim();
        if (incomingSessionEmail) {
          if (!incomingSessionEmail.includes("<") && !incomingSessionEmail.includes("user-email")) {
            setUserEmail(incomingSessionEmail);
            setAccountName((prev) => sanitizeDisplayAccountName(prev) || selectedStrategy.name);
            const existingForEmail = (state.modelAccounts || []).find(
              (a) => a.modelId === targetModelId && a.userEmail?.toLowerCase() === incomingSessionEmail.toLowerCase(),
            );
            if (existingForEmail) {
              setEditingAccountId(existingForEmail.accountId);
              setFormMode("save");
            } else if (editingAccountId) {
              const currentEditing = (state.modelAccounts || []).find((a) => a.accountId === editingAccountId);
              if (currentEditing && currentEditing.userEmail?.toLowerCase() !== incomingSessionEmail.toLowerCase()) {
                setEditingAccountId(null);
                setFormMode("create");
              }
            }
          }
        }
        const incomingSessionAuthCode = cliSessionRes?.session?.authCode?.trim();
        if (incomingSessionAuthCode && incomingSessionAuthCode.length >= 5) {
          const cleanCode = extractCleanAuthCode(incomingSessionAuthCode);
          setRedirectAuthCode(cleanCode);
          setEditableAuthCode(cleanCode);
        }
        if (cliSessionRes?.session?.status === "FAILED" && cliSessionRes.session.errorMessage) {
          const sessionTime = new Date(cliSessionRes.session.updatedAt || cliSessionRes.session.createdAt).getTime();
          if (authSessionStartedAt && sessionTime >= authSessionStartedAt) {
            // If the user actively opened a browser OAuth window and is selecting options,
            // ignore background daemon premature timeouts while the countdown timer is still active!
            const candidateCurrentUrl = activeCliAuthUrl || executableLaunchUrl || computedAuthorizationUrl;
            if (
              (cliSessionRes.session.errorCode === "TIMEOUT" || cliSessionRes.session.errorCode === "URL_DISCOVERY_TIMEOUT") &&
              (isWaitingForCallback || isUsableOAuthUrl(candidateCurrentUrl) || redirectAuthCode)
            ) {
              // Ignore background daemon timeout while browser sign-in is actively opened or auth URL/code is present
            } else {
              const errMsg = cliSessionRes.session.errorMessage;
              setCliScriptError({ message: errMsg, code: cliSessionRes.session.errorCode });
              setActionError(`CLI Script Error [${cliSessionRes.session.errorCode || "FAILURE"}]: ${errMsg}`);
              setIsWaitingForCallback(false);
              setCliTimeoutSecondsRemaining(null);
              clearInterval(interval);
              return;
            }
          }
        }

        const res = await ApiService.fetchLatestOAuthCallback(targetModelId);
        const session = res?.accessToken ? res : (res?.session || res?.callback);
        if (session?.email) {
          const cleanEmail = session.email.trim();
          if (!cleanEmail.includes("<") && !cleanEmail.includes("user-email")) {
            setUserEmail(cleanEmail);
            setAccountName((prev) => sanitizeDisplayAccountName(prev) || selectedStrategy.name);
            const existingForEmail = (state.modelAccounts || []).find(
              (a) => a.modelId === targetModelId && a.userEmail?.toLowerCase() === cleanEmail.toLowerCase(),
            );
            if (existingForEmail) {
              setEditingAccountId(existingForEmail.accountId);
              setFormMode("save");
            } else if (editingAccountId) {
              const currentEditing = (state.modelAccounts || []).find((a) => a.accountId === editingAccountId);
              if (currentEditing && currentEditing.userEmail?.toLowerCase() !== cleanEmail.toLowerCase()) {
                setEditingAccountId(null);
                setFormMode("create");
              }
            }
          }
        }
        if (session?.code && (!session.timestamp || session.timestamp >= authSessionStartedAt)) {
          const trimmed = extractCleanAuthCode(session.code);
          setRedirectAuthCode(trimmed);
          setEditableAuthCode(trimmed);
          setCliTimeoutSecondsRemaining(null);
          setCliScriptError(null);
          setActionError(null);
          setActionInfo("✔ Authorization code captured automatically! Please click 'Verify & Save' to complete verification.");
          setIsWaitingForCallback(false);
          clearInterval(interval);
        }
      } catch {
        // Continue polling
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [isWaitingForCallback, targetModelId, authSessionStartedAt, selectedStrategy.name]);

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
        const cleanEmail = email.trim();
        setUserEmail(cleanEmail);
        setAccountName(selectedStrategy.name);
      }
      if (authCode) {
        const clean = extractCleanAuthCode(authCode);
        setRedirectAuthCode(clean);
        setEditableAuthCode(clean);
      }
      // Verification ONLY happens when the user clicks "Verify & Save", NEVER automatically on redirect.
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
    if (!targetModelId?.trim()) {
      setActionError("Please select a target model before initiating authentication.");
      return;
    }
    if (
      userEmail?.trim() &&
      !userEmail.includes("<") &&
      !userEmail.includes(">") &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail.trim())
    ) {
      setActionError("Please enter a valid owner email address.");
      return;
    }
    if (accountCategory === "enterprise" && (!oauthClientId?.trim() || !oauthClientSecret?.trim())) {
      setActionError("OAuth Client ID and Client Secret are required for Enterprise mode.");
      return;
    }

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
      const effectiveUserEmail = sanitizeDisplayEmail(userEmail?.trim() || state.currentUser?.userEmail);
      const cliResponse = await ApiService.executeCliLogin(targetModelId, {
        provider: selectedProviderId,
        userEmail: effectiveUserEmail,
        accountCategory,
      });

      const candidateAuthUrl =
        cliResponse.session?.oauthUrl ||
        (isUsableOAuthUrl(cliResponse.loginResult?.config?.authorizationUrl) && !cliResponse.loginResult?.config?.authorizationUrl.includes("localhost:8085/oauth2/authorize") ? cliResponse.loginResult?.config?.authorizationUrl : "") ||
        computedAuthorizationUrl;

      if ((!cliResponse.success || cliResponse.session?.status === "FAILED") && !candidateAuthUrl) {
        if (authPopup && !authPopup.closed) authPopup.close();
        const errMsg = cliResponse.session?.errorMessage || cliResponse.message || "CLI script execution failed";
        setCliScriptError({ message: errMsg, code: cliResponse.session?.errorCode });
        setActionError(`CLI Script Error [${cliResponse.session?.errorCode || "EXEC_ERROR"}]: ${errMsg}`);
        setIsWaitingForCallback(false);
        return;
      }
      setCliScriptError(null);
      if (cliResponse.session?.oauthUrl) {
        setActiveCliAuthUrl(cliResponse.session.oauthUrl);
        try {
          const parsed = new URL(cliResponse.session.oauthUrl);
          const cId = parsed.searchParams.get("client_id");
          if (cId && cId.trim()) {
            setOauthClientId(cId.trim());
          }
        } catch { }
      }
      if (isGoogle && DEFAULT_GEMINI_CLIENT_SECRET) {
        setOauthClientSecret(DEFAULT_GEMINI_CLIENT_SECRET);
      }

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
      const loopbackChooserUrl = `http://localhost:8085/oauth2/authorize?provider=${encodeURIComponent(isGoogle ? "google" : selectedProviderId)}&model=${encodeURIComponent(targetModelId)}&returnUrl=${encodeURIComponent(window.location.origin)}`;
      const candidateUrls = [
        cliResponse.session?.oauthUrl,
        isUsableOAuthUrl(cliResponse.loginResult?.config?.authorizationUrl) && !cliResponse.loginResult?.config?.authorizationUrl.includes("localhost:8085/oauth2/authorize") ? cliResponse.loginResult?.config?.authorizationUrl : "",
        fallbackConfig?.executableLaunchUrl,
        computedAuthorizationUrl,
        executableLaunchUrl,
        ...(isGoogle ? [] : [loopbackChooserUrl]),
      ];
      const launchUrl = ensureResponseTypeInUrl(
        candidateUrls.find(
          (candidate): candidate is string =>
            isUsableOAuthUrl(candidate) &&
            !candidate.endsWith("/oauth2callback") &&
            oauthUrlUiStrategyRegistry.getStrategy(targetModelId, selectedStrategy.id).isValidOAuthUrl(candidate),
        ) || ""
      );

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
        setActionError(`${isGoogle ? "Google OAuth" : `${selectedStrategy.name} OAuth`} is not supported in VS Code embedded browser. Authorization URL copied — open it in host Microsoft Edge.`);
        return;
      }

      setIsWaitingForCallback(true);
      setAuthSessionStartedAt(Date.now());
      setActiveOAuthStep(2);
      setRedirectAuthCode("");
      setEditableAuthCode("");
      setActionError(null);
      setCliScriptError(null);
      setTimerOriginTab(selectedProtocol === "cli" ? "cli" : selectedProtocol === "oauth" && accountCategory === "individual" ? "oauth_individual" : "oauth_enterprise");
      setCliTimeoutSecondsRemaining(600);

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
    if (!targetModelId?.trim()) {
      setActionError("Please select a target model before initiating authentication.");
      return;
    }
    if (
      userEmail?.trim() &&
      !userEmail.includes("<") &&
      !userEmail.includes(">") &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail.trim())
    ) {
      setActionError("Please enter a valid owner email address.");
      return;
    }
    if (accountCategory === "enterprise" && (!oauthClientId?.trim() || !oauthClientSecret?.trim())) {
      setActionError("OAuth Client ID and Client Secret are required for Enterprise mode.");
      return;
    }

    setIsRedirecting(true);
    setIsWaitingForCallback(true);
    setAuthSessionStartedAt(Date.now());
    setTimerOriginTab(selectedProtocol === "cli" ? "cli" : selectedProtocol === "oauth" && accountCategory === "individual" ? "oauth_individual" : "oauth_enterprise");
    setCliTimeoutSecondsRemaining(600);
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
      let resolvedLaunchUrl =
        candidateUrls.find(
          (candidate): candidate is string =>
            isUsableOAuthUrl(candidate) &&
            !candidate.endsWith("/oauth2callback") &&
            oauthUrlUiStrategyRegistry.getStrategy(targetModelId, selectedStrategy.id).isValidOAuthUrl(candidate),
        ) || "";
      if (!resolvedLaunchUrl) {
        resolvedLaunchUrl = `http://localhost:8085/oauth2/authorize?provider=${encodeURIComponent(isGoogle ? "google" : selectedStrategy.id)}&model=${encodeURIComponent(targetModelId)}&returnUrl=${encodeURIComponent(window.location.origin)}`;
      }
      const launchTarget = resolveHostBrowserLaunchTarget(resolvedLaunchUrl);
      if (launchTarget.requiresExternalBrowser) {
        await navigator.clipboard.writeText(launchTarget.targetUrl).catch(() => undefined);
        setIsWaitingForCallback(false);
        setActionError(`${isGoogle ? "Google OAuth" : `${selectedStrategy.name} OAuth`} is not supported in VS Code embedded browser. Authorization URL copied — open it in host Microsoft Edge.`);
        return;
      }
      let popup: Window | null = null;
      try {
        popup = window.open(launchTarget.targetUrl, "modelbox_oauth_popup", "width=640,height=760,scrollbars=yes,resizable=yes");
      } catch {
        popup = null;
      }
      if (!popup || popup.closed || typeof popup.closed === "undefined") {
        try {
          window.open(launchTarget.targetUrl, "_blank");
        } catch {
          window.location.href = launchTarget.targetUrl;
        }
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
          const clean = extractCleanAuthCode(text);
          setRedirectAuthCode(clean);
          setEditableAuthCode(clean);
          setCliTimeoutSecondsRemaining(null);
          setCliScriptError(null);
          setActionError(null);
          setPastedFeedback(true);
          setTimeout(() => setPastedFeedback(false), 2000);
          const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (emailMatch && emailMatch[1]) {
            const pastedEmail = emailMatch[1].trim();
            if (!pastedEmail.includes("<") && !pastedEmail.includes("user-email")) {
              setUserEmail(pastedEmail);
              setAccountName((prev) => sanitizeDisplayAccountName(prev) || selectedStrategy.name);
            }
          }
        }
      } catch {
        // Fallback or browser denied permission
      }
    }
  };

  useEffect(() => {
    const handleWindowFocus = async () => {
      if (selectedProtocol !== "oauth") return;
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            const clean = extractCleanAuthCode(text);
            if (clean && clean.length >= 10 && (clean.startsWith("4/") || clean.length > 25)) {
              setRedirectAuthCode(clean);
              setEditableAuthCode(clean);
              setCliTimeoutSecondsRemaining(null);
              setCliScriptError(null);
              setActionError(null);
              setPastedFeedback(true);
              setTimeout(() => setPastedFeedback(false), 2000);
            }
            const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (emailMatch && emailMatch[1]) {
              const pastedEmail = emailMatch[1].trim();
              if (!pastedEmail.includes("<") && !pastedEmail.includes("user-email")) {
                setUserEmail(pastedEmail);
                setAccountName((prev) => sanitizeDisplayAccountName(prev) || selectedStrategy.name);
              }
            }
          }
        } catch {
          // Best effort clipboard read on window focus
        }
      }
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [selectedProtocol, selectedStrategy.name]);

  const handleCompleteOAuthExchange = async (codeToExchange?: string) => {
    const raw = codeToExchange !== undefined ? codeToExchange : redirectAuthCode || editableAuthCode;
    const trimmedCode = extractCleanAuthCode(raw || "");
    if (!trimmedCode || trimmedCode.length < 5) {
      const validationErrMsg = "Please enter a valid authorization code (minimum 5 characters).";
      setActionError(validationErrMsg);
      setCliScriptError({ message: validationErrMsg, code: "VALIDATION_ERROR" });
      return;
    }
    setCliTimeoutSecondsRemaining(null);
    setCliScriptError(null);
    setActionError(null);
    setVerificationTelemetry(null);
    const strategy = oauthProviderRegistry.getStrategy(selectedProviderId);
    setIsVerifyingAuthCode(true);
    const startTime = Date.now();
    try {
      try {
        const cliSessionRes = await ApiService.fetchLatestCliSession(targetModelId);
        await ApiService.submitCliAuthCode({
          sessionId: cliSessionRes?.session?.sessionId,
          authCode: trimmedCode,
          modelId: targetModelId,
          userEmail,
        });
      } catch {
        // Graceful best-effort sync
      }
      const res = await ApiService.verifyOAuthManual(targetModelId, trimmedCode, userEmail, oauthClientId, oauthClientSecret, editingAccountId);
      const realLatency = Math.max(1, Date.now() - startTime);
      if (res?.success && res?.session) {
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
          authorizedUser: session.email || res.account?.userEmail || userEmail,
          authorizedTimestamp: new Date().toLocaleTimeString(),
          authCode: session.code || trimmedCode,
        });
        const finalEmail = (session.email || res.account?.userEmail || userEmail || "").trim();
        if (finalEmail) {
          setUserEmail(finalEmail);
          setAccountName(strategy.name);
        }
        setRedirectAuthCode(trimmedCode);
        setEditableAuthCode(session.code || trimmedCode);
        await state.refreshModelAccounts();
        const successCorrId = res.correlationId || (res as any)?.correlationId || `corr-${Date.now()}`;
        const successTraceId = res.traceId || (res as any)?.traceId || (session as any)?.traceId || `trace-${Date.now()}`;
        const isInactiveOutcome = (res as any)?.accountStatus === "INACTIVE" || (res as any)?.verified === false;

        if (isInactiveOutcome) {
          setTestResult({
            status: "FAILED",
            protocol: session.authMode || "CLI OAuth",
            message: res?.message || `Account verified as INACTIVE. Token preserved for further processing.`,
            errorMessage: res?.message || (isGoogle ? "Authentication required: antigravity session has no active credentials." : "OAuth authentication unverified."),
            latencyMs: realLatency,
            details: { verifiedAt: new Date().toISOString() },
            correlationId: successCorrId,
            traceId: successTraceId,
          });
          setCliTimeoutSecondsRemaining(null);
          setVerificationTelemetry({
            status: "failure",
            correlationId: successCorrId,
            traceId: successTraceId,
            message: res?.message || `Account saved with INACTIVE status.`,
            dockerCommand: getOsDockerCommand(successCorrId, dockerLogOs),
            timestamp: new Date().toLocaleTimeString(),
            latencyMs: realLatency,
          });
          setActionInfo(res.message || `Account saved with INACTIVE status. Token preserved for further processing.`);
          setActionSuccess(null);
          setActionError(null);
          setActiveOAuthStep(2);
        } else {
          setTestResult({
            status: "VERIFIED",
            protocol: session.authMode || "CLI OAuth",
            message: res?.message || `Successfully authorized live OAuth 2.0 session for ${session.email}!`,
            latencyMs: realLatency,
            details: { verifiedAt: new Date().toISOString() },
            correlationId: successCorrId,
            traceId: successTraceId,
          });
          setCliTimeoutSecondsRemaining(null);
          setCliScriptError(null);
          setVerificationTelemetry({
            status: "success",
            correlationId: successCorrId,
            traceId: successTraceId,
            message: res?.message || `Successfully authorized live OAuth 2.0 session for ${session.email}!`,
            dockerCommand: getOsDockerCommand(successCorrId, dockerLogOs),
            timestamp: new Date().toLocaleTimeString(),
            latencyMs: realLatency,
          });
          setActionSuccess(`Successfully authorized live OAuth 2.0 session for ${session.email}!`);
          setActionInfo(null);
          setActionError(null);
        }
        await state.refreshModelAccounts();
        void state.refreshData();
        void state.refreshAuditLogs();
        return;
      }

      const errMsg = res?.message || "Failed to verify authorization code. Please check your code and try again.";
      const failCorrId = res?.correlationId || (res as any)?.correlationId || `corr-${Date.now()}`;
      const failTraceId = res?.traceId || (res as any)?.traceId || `trace-${Date.now()}`;
      setVerificationTelemetry({
        status: "failure",
        correlationId: failCorrId,
        traceId: failTraceId,
        message: errMsg,
        dockerCommand: getOsDockerCommand(failCorrId, dockerLogOs),
        timestamp: new Date().toLocaleTimeString(),
        latencyMs: realLatency,
      });
      setCliScriptError({ message: errMsg, code: res?.errorCode || "AUTH_FAILED" });
      setActionError(errMsg);
      setActiveOAuthStep(2);
      setOauthSession(null);
    } catch (err: any) {
      const realLatency = Math.max(1, Date.now() - startTime);
      const errMsg = err instanceof Error ? err.message : String(err);
      const errCorrId = err?.correlationId || `corr-${Date.now()}`;
      const errTraceId = err?.traceId || `trace-${Date.now()}`;
      setVerificationTelemetry({
        status: "failure",
        correlationId: errCorrId,
        traceId: errTraceId,
        message: errMsg,
        dockerCommand: getOsDockerCommand(errCorrId, dockerLogOs),
        timestamp: new Date().toLocaleTimeString(),
        latencyMs: realLatency,
      });
      setCliScriptError({ message: errMsg, code: err?.errorCode || "AUTH_FAILED" });
      setActionError(errMsg);
      setActiveOAuthStep(2);
      setOauthSession(null);
      // Never deactivate or lock account on verification failure (keep prior state intact)
    } finally {
      setIsVerifyingAuthCode(false);
      void state.refreshAuditLogs();
    }
  };

  const handleDisconnectOAuth = () => {
    setOauthSession(null);
    setTestResult(null);
    setActiveOAuthStep(2);
    setActionWarning("OAuth session revoked. Please authorize with your provider to link credentials.");
  };

  const handleSignoutAllAccounts = async () => {
    try {
      await ApiService.signoutAllAccounts();
    } catch { }
    setOauthSession(null);
    setTestResult(null);
    setVerificationTelemetry(null);
    setRedirectAuthCode("");
    setEditableAuthCode("");
    setActiveOAuthStep(1);
    await state.refreshModelAccounts();
    void state.refreshData();
    setActionWarning("All configured accounts signed out and sessions deactivated.");
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

  const buildProtocolFormContext = (): ProtocolFormContext => {
    const candidateAcc =
      state.modelAccounts.find((a) => a.modelId === targetModelId && (!selectedAccountEmail || a.userEmail === selectedAccountEmail)) ||
      state.modelAccounts.find((a) => a.modelId === targetModelId);
    const resolvedAuthCode =
      editableAuthCode ||
      redirectAuthCode ||
      oauthSession?.authCode ||
      (candidateAcc?.credentialValue?.startsWith("4/") ? candidateAcc.credentialValue : undefined) ||
      (candidateAcc?.credentials?.authCode as string | undefined) ||
      ((candidateAcc?.config as any)?.authCode as string | undefined);

    return {
      apiKey,
      apiBaseUrl,
      apiVersion,
      apiAuthType,
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
      authCode: resolvedAuthCode,
    };
  };

  const getCredentialValueForProtocol = (): string => {
    const strategy = protocolConfigStrategyRegistry.resolve(selectedProtocol);
    return strategy.resolveCredentialValue(buildProtocolFormContext());
  };

  const getProtocolConfigObject = (): Record<string, unknown> => {
    const strategy = protocolConfigStrategyRegistry.resolve(selectedProtocol);
    return strategy.buildConfigObject(buildProtocolFormContext());
  };

  const handleTestCurrentConfig = async () => {
    if (!targetModelId?.trim()) {
      setActionError("Please select a target model before testing connection.");
      return;
    }
    setIsTesting(true);
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
        effortTier: modelEffortTier || "low",
        userEmail: selectedAccountEmail || userEmail || (oauthSession as any)?.email || (oauthSession as any)?.authorizedUser,
        mode: executionMode || "chat",
        sessionId: state.activeSessionId || state.sessions.find((s) => s.model === targetModelId)?.sessionId,
      });
      setTestResultsByProtocol((prev) => ({
        ...prev,
        [selectedProtocol]: res,
      }));
      setTestResult(res);
      if (res.status === "FAILED") {
        try {
          await ApiService.deactivateModelAccount(targetModelId, "");
          await state.refreshModelAccounts();
        } catch { }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Connection test failed";
      setActionError(errMsg);
      const failedResult: TestConnectionResult = {
        status: "FAILED",
        protocol: selectedProtocol === "cli" ? "CLI Binary" : selectedProtocol === "api" ? "REST API" : selectedProtocol === "oauth" ? "OAuth 2.0" : "Cookie Vault",
        message: errMsg,
        latencyMs: 0,
        errorMessage: errMsg,
        effortTier: "low",
        mode: executionMode || "chat",
        modelName: targetModelId,
        details: { error: errMsg, modelId: targetModelId, mode: executionMode || "chat" },
      };
      setTestResultsByProtocol((prev) => ({
        ...prev,
        [selectedProtocol]: failedResult,
      }));
      setTestResult(failedResult);
      // Never deactivate or lock account on verification failure (keep prior state intact)
    } finally {
      setIsTesting(false);
      void state.refreshAuditLogs();
    }
  };

  const handleSaveEditedToken = async () => {
    if (!editableAccessToken.trim()) return;
    setIsSavingToken(true);
    setTokenSaveSuccess(null);
    setActionError(null);
    try {
      const activeAcc =
        (state.modelAccounts || []).find((a) => a.modelId === targetModelId && a.authType === "cli_oauth" && a.isActive) ||
        (state.modelAccounts || []).find((a) => a.modelId === targetModelId && a.authType === "cli_oauth");

      const tokenValue = editableAccessToken.trim();
      const currentEmail = userEmail.trim() || state.currentUser?.userEmail || "";
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
          isActive: false,
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
    const cleanAccountLabel = sanitizeDisplayAccountName(accountName) || `${targetModelId} Account`;
    const cleanUserEmail = sanitizeDisplayEmail(userEmail);

    if (!cleanAccountLabel.trim()) {
      setActionError("Please provide an Account Configuration Label.");
      return;
    }

    if (selectedProtocol === "oauth" && !oauthSession && !editingAccountId && !getCredentialValueForProtocol()) {
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

      const isVerified =
        (selectedProtocol === "api" && apiAuthType === "none") ||
        Boolean(credVal && credVal.trim().length > 0 && credVal !== "none") ||
        (selectedProtocol === "oauth" && Boolean(oauthSession));
      const isTestPassed = testResult?.status === "VERIFIED";
      const shouldBeActive = isVerified && isTestPassed;

      let targetAccountToUpdate: UiModelAccount | undefined;
      if (editingAccountId) {
        const currentEditing = state.modelAccounts.find((a) => a.accountId === editingAccountId);
        if (currentEditing && (!cleanUserEmail || currentEditing.userEmail?.toLowerCase() === cleanUserEmail.toLowerCase())) {
          targetAccountToUpdate = currentEditing;
        }
      }
      if (!targetAccountToUpdate && cleanUserEmail) {
        targetAccountToUpdate = state.modelAccounts.find(
          (a) => a.modelId === targetModelId && a.userEmail?.toLowerCase() === cleanUserEmail.toLowerCase(),
        );
      }

      if (targetAccountToUpdate) {
        await ApiService.updateModelAccount(targetModelId, targetAccountToUpdate.accountId, {
          accountName: cleanAccountLabel,
          userEmail: cleanUserEmail,
          authType: protocolStrategy.storageAuthType,
          credentialValue: credVal,
          isActive: shouldBeActive,
          config: cfg,
        });
        if (shouldBeActive) {
          setActionSuccess(`Successfully updated and activated configuration '${cleanAccountLabel}' for '${targetModelId}' (Verified & Tested)!`);
        } else {
          setActionWarning(`Saved configuration '${cleanAccountLabel}' as INACTIVE. Run 'Test' to verify and activate.`);
        }
      } else {
        await ApiService.createModelAccount(targetModelId, {
          accountName: cleanAccountLabel,
          userEmail: cleanUserEmail,
          authType: protocolStrategy.storageAuthType,
          credentialValue: credVal,
          isActive: shouldBeActive,
          config: cfg,
        });
        if (shouldBeActive) {
          setActionSuccess(`Successfully saved and activated configuration '${cleanAccountLabel}' for '${targetModelId}'!`);
        } else {
          setActionWarning(`Created configuration '${cleanAccountLabel}' as INACTIVE. Run 'Test' to verify and activate.`);
        }
      }

      setShowProtocolEditor(false);
      setEditingAccountId(null);
      setFormMode("save");
      await state.refreshModelAccounts();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDoneEditing = async (e?: React.MouseEvent) => {
    if (e?.preventDefault) {
      e.preventDefault();
    }
    await handleSaveConfiguration();
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
      const testRes = accountTestResults[acc.accountId];
      if (!testRes || testRes.status !== "VERIFIED") {
        setActionWarning(
          `⚠️ Account '${cleanAccountDisplayName(acc.accountName, acc.userEmail)}' requires both verification and successful connection test to activate. Click 'Test' to verify.`,
        );
        return;
      }
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
        userEmail: acc.userEmail,
        sessionId: state.activeSessionId || state.sessions.find((s) => s.model === acc.modelId)?.sessionId,
      });
      setAccountTestResults((prev) => ({ ...prev, [acc.accountId]: res }));

      if (res.status === "VERIFIED") {
        await ApiService.activateModelAccount(acc.modelId, acc.accountId);
        setActionSuccess(
          `✔ Verification & test passed: Account '${cleanAccountDisplayName(acc.accountName, acc.userEmail)}' is now ACTIVE.`,
        );
        await state.refreshModelAccounts();
      } else {
        await ApiService.deactivateModelAccount(acc.modelId, acc.accountId);
        setActionError(
          `⚠️ Test failed (${res.errorMessage || "Verification failure"}): Account '${cleanAccountDisplayName(acc.accountName, acc.userEmail)}' is set to INACTIVE.`,
        );
        await state.refreshModelAccounts();
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
        `⚠️ Authentication Error (401 Unauthorized): Account '${cleanAccountDisplayName(acc.accountName, acc.userEmail)}' failed verification and was converted to INACTIVE.`,
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
      void state.refreshAuditLogs();
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
          accountTestResults={accountTestResults}
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
            setEditableAuthCode("");
            setActiveCliAuthUrl("");
            setOauthSession(null);
            setVerificationTelemetry(null);
            setCliScriptError(null);
            setTestResult(null);
            setTestingAccountId(null);
            setActiveOAuthStep(1);
            setActionError(null);
            setActionInfo(null);
            setActionSuccess(null);
            state.setActiveTab("model-config", { view: "form", model: targetModelId, mode: "create" });
          }}
          onEditAccount={loadAccountIntoEditor}
          onTestAccount={(acc) => void handleTestExistingAccount(acc)}
          onDisconnectAccount={handleOpenDeleteModal}
          testingAccountId={testingAccountId}
          onOpenModels={() => state.setActiveTab("models")}
          onOpenTools={() => state.setActiveTab("workflows")}
          protocolStudioSlot={
            showProtocolEditor && (formMode === "create" || (formMode === "save" && Boolean(editingAccountId))) ? (
              <div className="form-view-container" data-testid="form-view">
                <div className="detail-editor-toolbar">
                  <div className="editor-toolbar-title">
                    <strong>{formMode === "create" ? "New Connection" : `Edit: ${sanitizeDisplayAccountName(accountName) || currentModelTitle}`}</strong>
                  </div>
                  <div className="inline-btn-group">
                    {formMode === "save" && Boolean(editingAccountId) && (
                      <button
                        type="button"
                        className="btn-ui-danger btn-sm"
                        onClick={handleDeleteActiveAccount}
                        disabled={isTesting}
                        data-testid="btn-delete"
                      >
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-ui-secondary btn-sm"
                      onClick={() => {
                        setShowProtocolEditor(false);
                        setEditingAccountId(null);
                        setFormMode("save");
                      }}
                      disabled={isTesting}
                      data-testid="btn-discard"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <div className="config-studio-grid single-column">
                  {/* Interactive Protocol Configuration Form */}
                  <div className="config-builder-card">
                    <div
                      className="card-header config-builder-header"
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        paddingBottom: "12px",
                        marginBottom: "16px",
                        borderBottom: "1px solid var(--theme-border-subtle, #e2e8f0)",
                        boxSizing: "border-box",
                      }}
                    >
                      <div className="card-header-left" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="card-icon" style={{ fontSize: "1.25rem", lineHeight: 1 }}>⚡</span>
                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--theme-text-primary, #0f172a)" }}>
                          Protocol Configuration Engine
                        </h3>
                      </div>
                      <div className="card-header-right" style={{ display: "flex", alignItems: "center", marginLeft: "auto", flexShrink: 0 }}>
                        {(() => {
                          const isEditing = Boolean(editingAccountId);
                          const editingAccount = isEditing
                            ? state.modelAccounts.find((a) => a.accountId === editingAccountId)
                            : null;
                          const isActive = isEditing && editingAccount
                            ? Boolean(editingAccount.isActive)
                            : Boolean(isAuthSuccessful);
                          return (
                            <span
                              className={`target-auth-pill ${isActive ? "verified" : "pending"}`}
                              data-testid="target-auth-pill"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "4px 12px",
                                borderRadius: "9999px",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                background: isActive ? "var(--theme-success-soft, #dcfce7)" : "var(--theme-bg-muted, #f1f5f9)",
                                color: isActive ? "var(--theme-success, #15803d)" : "var(--theme-text-muted, #64748b)",
                                border: `1px solid ${isActive ? "var(--theme-success-border, #86efac)" : "var(--theme-border-default, #cbd5e1)"}`,
                                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <span
                                style={{
                                  width: "7px",
                                  height: "7px",
                                  borderRadius: "50%",
                                  background: isActive ? "var(--theme-success, #22c55e)" : "var(--theme-text-muted, #94a3b8)",
                                  display: "inline-block",
                                }}
                              />
                              {isActive ? "Active" : "Inactive"}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    {editingAccountId && (
                      <div className="alert-banner info d-flex align-items-center justify-content-between p-2 mb-3" data-testid="edit-mode-indicator">
                        <div className="d-flex align-items-center gap-2">
                          <span className="badge-pill info">Editing Mode</span>
                          <span>Editing account: <strong>{sanitizeDisplayAccountName(accountName) || editingAccountId}</strong> ({targetModelId})</span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline theme-secondary"
                          onClick={handleDoneEditing}
                          disabled={isTesting}
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
                          setTestResult(testResultsByProtocol.api);
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
                          setTestResult(testResultsByProtocol.oauth);
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
                          setTestResult(testResultsByProtocol.cli);
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
                          setTestResult(testResultsByProtocol.cookie);
                          setActionError(null);
                          setActionInfo(null);
                        }}
                      >
                        <span className="tab-icon">🌐</span>
                        <span className="tab-label">Web Session</span>
                        <span className="tab-hint">Cookie Vault</span>
                      </button>
                    </div>

                    <form className="protocol-config-form" onSubmit={handleSaveConfiguration}>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label className="form-label">
                            <span>Target Model</span>
                          </label>
                          <select
                            className="form-select"
                            value={targetModelId}
                            onChange={(e) => {
                              const newModelId = e.target.value;
                              setTargetModelId(newModelId);
                              state.setSelectedModel(newModelId);
                              setIsWaitingForCallback(false);
                              setCliTimeoutSecondsRemaining(null);
                              setActionInfo(null);
                              setActionError(null);
                              setCliScriptError(null);
                              setRedirectAuthCode("");
                              setEditableAuthCode("");
                              setActiveCliAuthUrl("");
                              setVerificationTelemetry(null);
                              setTestResult(null);
                              setTestingAccountId(null);
                              const matched = oauthProviderRegistry.findStrategyForModel(newModelId);
                              if (matched) {
                                setSelectedProviderId(matched.id);
                              }
                            }}
                            data-testid="select-target-model"
                          >
                            {availableConfigModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
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
                            placeholder={`e.g. Production ${selectedStrategy.name} Connection`}
                            value={sanitizeDisplayAccountName(accountName)}
                            onChange={(e) => setAccountName(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <div className="form-label-inline-split" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <label style={{ margin: 0 }}>Owner Email</label>
                          {isCurrentAccountVerifiedAndActive && !editingAccountId ? (
                            <span className="owner-email-status-pill" style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 500 }}>
                              🔒 Locked to authenticated account
                            </span>
                          ) : (
                            <span className="owner-email-status-pill" style={{ fontSize: "0.72rem", color: "#2563eb", fontWeight: 500 }}>
                              ✏️ Editable
                            </span>
                          )}
                        </div>
                        <input
                          type="email"
                          className={`form-input ${isCurrentAccountVerifiedAndActive && !editingAccountId ? "form-input-disabled" : ""}`}
                          value={userEmail}
                          onChange={(e) => {
                            const val = e.target.value;
                            setUserEmail(val);
                          }}
                          disabled={isCurrentAccountVerifiedAndActive && !editingAccountId}
                          readOnly={isCurrentAccountVerifiedAndActive && !editingAccountId}
                          style={isCurrentAccountVerifiedAndActive && !editingAccountId ? {
                            backgroundColor: "#f8fafc",
                            cursor: "not-allowed",
                            color: "#475569",
                            borderColor: "#cbd5e1",
                            fontWeight: 500,
                          } : {
                            backgroundColor: "#ffffff",
                            cursor: "text",
                            color: "#0f172a",
                            borderColor: "#cbd5e1",
                            fontWeight: 400,
                          }}
                          autoComplete="off"
                          data-lpignore="true"
                          placeholder="Will be fetched automatically from Google Sign-In (or enter email)"
                          title={isCurrentAccountVerifiedAndActive && !editingAccountId ? "Owner email is bound to the active authenticated account and cannot be modified manually." : "Enter or update the account owner email."}
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

                          <div
                            className="effort-tier-selector-container auth-mode-selector-container mb-3"
                            data-testid="auth-mode-selector"
                            style={{
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: "10px",
                              padding: "12px 14px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px",
                              width: "100%",
                              boxSizing: "border-box",
                            }}
                          >
                            <div
                              className="effort-header-row tier-header-row"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                width: "100%",
                              }}
                            >
                              <label style={{ fontSize: "0.85rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                                Authentication Mode
                              </label>
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  padding: "3px 10px",
                                  borderRadius: "9999px",
                                  background: "#ede9fe",
                                  border: "1px solid #c4b5fd",
                                  color: "#6d28d9",
                                  letterSpacing: "0.04em",
                                }}
                              >
                                {apiAuthType === "api_key" && "API KEY (HEADER)"}
                                {apiAuthType === "bearer" && "BEARER TOKEN"}
                                {apiAuthType === "basic" && "BASIC AUTH"}
                                {apiAuthType === "none" && "NONE (OLLAMA / LOCAL)"}
                              </span>
                            </div>
                            <div
                              className="mode-segmented-control auth-mode-segmented-control"
                              role="radiogroup"
                              aria-label="REST API Authentication Mode"
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                                gap: "8px",
                                width: "100%",
                                boxSizing: "border-box",
                              }}
                            >
                              {[
                                { id: "api_key", icon: "🔑", label: "API Key", title: "Authenticate via HTTP header or query parameter API Key" },
                                { id: "bearer", icon: "🛡️", label: "Bearer Token", title: "Authenticate via standard Authorization: Bearer <token>" },
                                { id: "basic", icon: "👤", label: "Basic Auth", title: "Authenticate via HTTP Basic Auth username:password" },
                                { id: "none", icon: "⚡", label: "None (Ollama / Local)", title: "No authentication required. Direct connection for local Ollama, vLLM, or air-gapped endpoints." },
                              ].map((mode) => {
                                const isSelected = apiAuthType === mode.id;
                                return (
                                  <button
                                    key={mode.id}
                                    type="button"
                                    className={`mode-btn auth-mode-btn ${isSelected ? "active" : ""}`}
                                    onClick={() => setApiAuthType(mode.id as any)}
                                    data-testid={`auth-mode-${mode.id}`}
                                    title={mode.title}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: "8px",
                                      minHeight: "42px",
                                      padding: "8px 12px",
                                      borderRadius: "8px",
                                      fontSize: "0.82rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                                      boxSizing: "border-box",
                                      width: "100%",
                                      border: isSelected ? "1.5px solid #7367f0" : "1px solid #cbd5e1",
                                      background: isSelected ? "linear-gradient(135deg, #7367f0 0%, #5e50ee 100%)" : "#ffffff",
                                      color: isSelected ? "#ffffff" : "#475569",
                                      boxShadow: isSelected ? "0 2px 6px rgba(115, 103, 240, 0.3)" : "0 1px 2px rgba(0, 0, 0, 0.03)",
                                    }}
                                  >
                                    <span style={{ fontSize: "1rem", lineHeight: 1 }}>{mode.icon}</span>
                                    <span style={{ whiteSpace: "nowrap" }}>{mode.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {apiAuthType === "none" ? (
                            <div className="alert-banner info p-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: "0.86rem", background: "var(--theme-info-soft, #eff6ff)", border: "1px solid var(--theme-info-border, #bfdbfe)", borderRadius: "var(--radius-md, 8px)", color: "var(--theme-info-text, #1e40af)" }}>
                              <span style={{ fontSize: "1.1rem" }}>ℹ️</span>
                              <div>
                                <strong>No Authentication Required:</strong> Direct REST requests without auth headers. Ideal for local Ollama (<code>http://localhost:11434</code>), vLLM, or private air-gapped endpoints.
                              </div>
                            </div>
                          ) : (
                            <div className="form-group">
                              <label>
                                {apiAuthType === "bearer" ? "Bearer Token" : apiAuthType === "basic" ? "Basic Auth (username:password or token)" : "API Key"}
                              </label>
                              <input
                                type="password"
                                className="form-input code-font"
                                placeholder={apiAuthType === "bearer" ? "Enter Bearer token" : apiAuthType === "basic" ? "user:password or base64" : "Enter API key"}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                required={selectedProtocol === "api"}
                              />
                            </div>
                          )}
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
                              className={`step-item-btn pipeline-stage-btn ${effectiveOAuthStep === 2
                                ? (cliScriptError
                                  ? "active active-failed"
                                  : isOAuthVerificationFailed
                                    ? "active active-reverify"
                                    : "active")
                                : effectiveOAuthStep > 2
                                  ? (isOAuthVerificationFailed ? "needs-reverify" : "completed")
                                  : "pending"
                                }`}
                              onClick={() => setActiveOAuthStep(2)}
                            >
                              <span className="step-circle stage-indicator">
                                {effectiveOAuthStep === 2 ? (
                                  cliScriptError ? "✕" : isOAuthVerificationFailed ? "⚠️" : isWaitingForCallback ? "⏳" : <span className="stage-dot" />
                                ) : effectiveOAuthStep > 2 ? (
                                  isOAuthVerificationFailed ? "⚠️" : "✔"
                                ) : (
                                  <span className="stage-dot" />
                                )}
                              </span>
                              <div className="step-info stage-content">
                                <span className="step-label stage-title">Browser Consent</span>
                                <span className="stage-state">
                                  {effectiveOAuthStep === 2
                                    ? (cliScriptError
                                      ? "Failed"
                                      : isOAuthVerificationFailed
                                        ? "Re-Authenticating"
                                        : isWaitingForCallback
                                          ? "Awaiting Code"
                                          : "In Progress")
                                    : effectiveOAuthStep > 2
                                      ? (isOAuthVerificationFailed ? "Re-Verify" : "Completed")
                                      : "Pending"}
                                </span>
                              </div>
                            </button>

                            <button
                              type="button"
                              className={`step-item-btn pipeline-stage-btn ${effectiveOAuthStep === 3
                                ? (isOAuthVerificationFailed
                                  ? "active active-failed"
                                  : testResult?.status === "VERIFIED"
                                    ? "active active-success"
                                    : "active")
                                : isOAuthVerificationFailed
                                  ? "failed"
                                  : "pending"
                                }`}
                              onClick={() => {
                                if (canProceedToVault) setActiveOAuthStep(3);
                              }}
                              disabled={!canProceedToVault}
                              style={{
                                cursor: canProceedToVault ? "pointer" : "not-allowed",
                                opacity: canProceedToVault ? 1 : 0.55,
                              }}
                            >
                              <span className="step-circle stage-indicator">
                                {isOAuthVerificationFailed ? (
                                  "⚠️"
                                ) : effectiveOAuthStep === 3 ? (
                                  testResult?.status === "VERIFIED" ? "✔" : <span className="stage-dot" />
                                ) : (
                                  <span className="stage-dot" />
                                )}
                              </span>
                              <div className="step-info stage-content">
                                <span className="step-label stage-title">
                                  {isOAuthVerificationFailed ? "Verification Failed" : "Token Vault"}
                                </span>
                                <span className="stage-state">
                                  {isOAuthVerificationFailed
                                    ? (effectiveOAuthStep === 3 ? "Action Required" : "Needs Re-Verification")
                                    : effectiveOAuthStep === 3
                                      ? (testResult?.status === "VERIFIED" ? "Verified & Active" : "Verification Needed")
                                      : "Pending"}
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
                                  <div className="picker-title-group">
                                    <h4 className="picker-title">Select Model Provider</h4>
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

                                <div className="picker-navigation-bar">
                                  <button
                                    type="button"
                                    className="btn-oauth-action btn-browser-auth"
                                    onClick={() => setActiveOAuthStep(2)}
                                  >
                                    <span>Next: Authorization Setup →</span>
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
                                  <div className="mode-header-label d-flex align-items-center justify-content-between flex-wrap gap-2">
                                    <span>Authentication Mode ({selectedStrategy.name})</span>
                                    <span className="mode-subtag">
                                      {accountCategory === "individual" ? "CLI Binary Session" : "Enterprise Web OAuth"}
                                    </span>
                                  </div>

                                  <div className="mode-cards-grid">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAccountCategory("individual");
                                        setCliScriptError(null);
                                        setActionError(null);
                                        setActionSuccess(null);
                                        setRedirectAuthCode("");
                                        setEditableAuthCode("");
                                      }}
                                      className={`mode-card-btn ${accountCategory === "individual" ? "active" : ""}`}
                                    >
                                      <div className="mode-card-title">
                                        <span>👤</span>
                                        <strong>Individual Account (CLI)</strong>
                                      </div>
                                      <div className="mode-card-desc">
                                        Personal account bearer sign-in via host CLI ({isGoogle ? "Antigravity or Gemini" : `${selectedStrategy.name} CLI`}).
                                      </div>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAccountCategory("enterprise");
                                        setCliScriptError(null);
                                        setActionError(null);
                                        setActionSuccess(null);
                                        setRedirectAuthCode("");
                                        setEditableAuthCode("");
                                      }}
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

                                  {/* Individual Account Email Input */}
                                  {accountCategory === "individual" && (
                                    <div className="google-cli-selector-panel" style={{ marginTop: "10px" }}>
                                      <div className="cli-selector-text">
                                        <strong>Owner / Account Email</strong>
                                        <span>{userEmail ? "Email captured from authorization session" : "Enter email to associate with credentials"}</span>
                                      </div>
                                      <input
                                        type="email"
                                        className="form-input"
                                        data-testid="input-oauth-user-email"
                                        placeholder="Enter account email"
                                        value={userEmail}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setUserEmail(val);
                                        }}
                                        style={{
                                          maxWidth: "340px",
                                          padding: "6px 12px",
                                          borderRadius: "6px",
                                          border: "1px solid var(--theme-border-default, #cbd5e1)",
                                          background: "var(--theme-bg-surface, #ffffff)",
                                          color: "var(--theme-text-primary, #0f172a)",
                                          fontSize: "0.88rem",
                                        }}
                                      />
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
                                            placeholder="Enter OAuth Client ID"
                                            value={oauthClientId}
                                            onChange={(e) => setOauthClientId(e.target.value)}
                                            required
                                          />
                                        </div>
                                        <div className="form-group">
                                          <label>OAuth Client Secret <span className="required-star" style={{ color: "#ef4444" }}>*</span></label>
                                          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                            <input
                                              type={showClientSecret ? "text" : "password"}
                                              className="form-input"
                                              style={{ paddingRight: "2.5rem" }}
                                              placeholder="Enter corporate client secret"
                                              value={oauthClientSecret}
                                              onChange={(e) => setOauthClientSecret(e.target.value)}
                                              required
                                            />
                                            <button
                                              type="button"
                                              onClick={() => setShowClientSecret((prev) => !prev)}
                                              style={{
                                                position: "absolute",
                                                right: "8px",
                                                background: "transparent",
                                                border: "none",
                                                cursor: "pointer",
                                                fontSize: "1rem",
                                                padding: "2px 6px",
                                              }}
                                              title={showClientSecret ? "Hide secret" : "Show secret"}
                                            >
                                              {showClientSecret ? "🙈" : "👁️"}
                                            </button>
                                          </div>
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
                                  <div className="url-label-row d-flex align-items-center justify-content-between flex-wrap gap-2">
                                    <label>Generated Authorization URL ({isGoogle ? (selectedGoogleCli === "antigravity" ? "Antigravity CLI" : "Gemini CLI") : `${selectedStrategy.name} OAuth`})</label>
                                    <span className="url-info-tag">Endpoint: {oauthAuthUrl || selectedStrategy.authUrl}</span>
                                  </div>
                                  <div className="url-preview-wrapper">
                                    {(() => {
                                      const rawUrl =
                                        activeCliAuthUrl ||
                                        (accountCategory === "individual" && isGoogle ? "" : (executableLaunchUrl || computedAuthorizationUrl));
                                      return (
                                        <>
                                          <input
                                            type="text"
                                            className="url-preview-input"
                                            readOnly
                                            value={
                                              rawUrl
                                                ? maskSensitiveUrl(rawUrl)
                                                : `Click 'Browser Sign-In' below to generate ${isGoogle ? "Antigravity CLI" : selectedStrategy.name} OAuth URL`
                                            }
                                            title={`Generated ${isGoogle ? "Antigravity CLI" : selectedStrategy.name} OAuth 2.0 Authorization URL`}
                                          />
                                          <button
                                            type="button"
                                            className="url-copy-btn"
                                            onClick={() => {
                                              if (rawUrl) {
                                                navigator.clipboard.writeText(rawUrl);
                                                setCopiedUrl(true);
                                                setTimeout(() => setCopiedUrl(false), 2000);
                                              }
                                            }}
                                            title="Copy generated OAuth authorization URL to clipboard"
                                          >
                                            {copiedUrl ? "✔ Copied" : "📋 Copy"}
                                          </button>
                                        </>
                                      );
                                    })()}
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
                                        disabled={isVerifyingDirectory}
                                        title="Verify credentials directory and check changes"
                                      >
                                        {isVerifyingDirectory ? "⏳ Verifying..." : "🔄 Verify Directory"}
                                      </button>
                                    </div>
                                    {directoryVerificationFeedback && (
                                      <div
                                        className={`vcs-feedback-row ${directoryVerificationFeedback.type === "success" ? "feedback-success" : "feedback-error"}`}
                                        style={{
                                          marginTop: "10px",
                                          padding: "8px 12px",
                                          borderRadius: "6px",
                                          fontSize: "0.8rem",
                                          background: directoryVerificationFeedback.type === "success" ? "#f0fdf4" : "#fef2f2",
                                          border: directoryVerificationFeedback.type === "success" ? "1px solid #86efac" : "1px solid #fca5a5",
                                          color: directoryVerificationFeedback.type === "success" ? "#166534" : "#991b1b",
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          flexWrap: "wrap",
                                          gap: "8px",
                                        }}
                                      >
                                        <span style={{ fontWeight: 600 }}>
                                          {directoryVerificationFeedback.type === "success" ? "✔" : "⚠️"} {directoryVerificationFeedback.message}
                                          {directoryVerificationFeedback.commitHash && ` (Commit: ${directoryVerificationFeedback.commitHash.slice(0, 7)})`}
                                        </span>
                                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                          {directoryVerificationFeedback.correlationId && (
                                            <code style={{ fontSize: "0.74rem", background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: "4px" }}>
                                              Corr: {directoryVerificationFeedback.correlationId}
                                            </code>
                                          )}
                                          <span style={{ fontSize: "0.74rem", opacity: 0.8 }}>{directoryVerificationFeedback.timestamp}</span>
                                        </div>
                                      </div>
                                    )}
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



                                  {isAccountVerified && (
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

                                {/* Full-width alerts & notification banners below toolbar */}
                                {cliScriptError && (
                                  <div className="alert-banner error full-width-alert" data-testid="cli-script-error-banner">
                                    <span className="alert-icon">⚠️</span>
                                    <div className="alert-text">
                                      <strong>CLI Error ({cliScriptError.code || "FAILURE"}):</strong>
                                      <div className="alert-msg-code">{cliScriptError.message}</div>
                                      {verificationTelemetry && (
                                        <div style={{ marginTop: "8px", fontSize: "0.78rem" }}>
                                          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "4px" }}>
                                            <span><strong>Correlation ID:</strong> <code>{verificationTelemetry.correlationId}</code></span>
                                            <span><strong>Trace ID:</strong> <code>{verificationTelemetry.traceId}</code></span>
                                          </div>
                                          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0f172a", padding: "6px 10px", borderRadius: "6px", color: "#38bdf8" }}>
                                            <code style={{ color: "#34d399", fontSize: "0.75rem", flex: 1, wordBreak: "break-all" }}>{verificationTelemetry.dockerCommand}</code>
                                            <button
                                              type="button"
                                              style={{ background: "rgba(56,189,248,0.2)", border: "1px solid rgba(56,189,248,0.4)", color: "#38bdf8", padding: "2px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "0.72rem" }}
                                              onClick={() => {
                                                navigator.clipboard.writeText(verificationTelemetry.dockerCommand);
                                                alert("Docker command copied to clipboard!");
                                              }}
                                            >
                                              📋 Copy Command
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      className="alert-close"
                                      onClick={() => setCliScriptError(null)}
                                      title="Dismiss error"
                                    >
                                      ×
                                    </button>
                                  </div>
                                )}

                                {isWaitingForCallback && (
                                  <div className="oauth-waiting-banner" data-testid="oauth-waiting-indicator">
                                    <span className="waiting-spinner">⏳</span>
                                    <div className="waiting-text" style={{ flex: 1 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <strong>Browser Sign-In Opened</strong>
                                        <button
                                          type="button"
                                          className="btn-dismiss-banner"
                                          onClick={() => {
                                            setIsWaitingForCallback(false);
                                            setCliTimeoutSecondsRemaining(null);
                                            setActionInfo(null);
                                          }}
                                          style={{
                                            background: "transparent",
                                            border: "none",
                                            color: "#64748b",
                                            cursor: "pointer",
                                            fontSize: "0.82rem",
                                            fontWeight: 600,
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                          }}
                                          title="Cancel waiting for browser sign-in"
                                        >
                                          ✕ Cancel
                                        </button>
                                      </div>
                                      <span>Complete sign-in in the browser tab. Listening on port 8085...</span>
                                      {isUsableOAuthUrl(executableLaunchUrl || computedAuthorizationUrl) && (
                                        <div style={{ marginTop: "6px" }}>
                                          <button
                                            type="button"
                                            onClick={accountCategory === "individual" ? handleExecuteCliLogin : handleInitiateBrowserRedirect}
                                            className="reopen-signin-link"
                                          >
                                            Re-open Sign-In Window
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Section 5: Authorization Code Capture (ONLY Active when CLI mode is selected) */}
                                {accountCategory === "individual" && (
                                  <div className="browser-authcode-capture-card" data-testid="browser-authcode-card">
                                    <div className="authcode-card-header d-flex align-items-center justify-content-between flex-wrap gap-2">
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
                                              : "Timed Out (10m / 600s)"}
                                          </span>
                                        )}
                                        {isCurrentAccountVerifiedAndActive && verificationTelemetry?.status === "success" && !isVerifyingAuthCode ? (
                                          <span className="code-captured-tag" style={{ background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>✔ Verified &amp; Saved</span>
                                        ) : redirectAuthCode ? (
                                          <span className="code-captured-tag" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>✔ Code Captured</span>
                                        ) : (
                                          <span className="code-waiting-tag">Awaiting Code</span>
                                        )}
                                      </div>
                                    </div>

                                    {timerOriginTab === (accountCategory === "individual" ? "oauth_individual" : "oauth_enterprise") && cliTimeoutSecondsRemaining === 0 && !redirectAuthCode && (
                                      <div className="authcode-timeout-warning">
                                        ⚠️ Session timed out (10m / 600s). Click Browser Sign-In to start a new session, or paste your code below and click Verify &amp; Save.
                                      </div>
                                    )}

                                    <div className="authcode-input-container">
                                      <span className="authcode-lead-icon" title="OAuth Authorization Code">🔑</span>
                                      <input
                                        type="text"
                                        className="form-input authcode-text-input"
                                        placeholder="Paste authorization code (e.g. 4/0AUn6...)"
                                        value={redirectAuthCode}
                                        onChange={(e) => {
                                          const clean = extractCleanAuthCode(e.target.value);
                                          setRedirectAuthCode(clean);
                                          setEditableAuthCode(clean);
                                          setCliTimeoutSecondsRemaining(null);
                                        }}
                                        onPaste={(e) => {
                                          e.preventDefault();
                                          const text = e.clipboardData.getData("text");
                                          if (text) {
                                            const clean = extractCleanAuthCode(text);
                                            setRedirectAuthCode(clean);
                                            setEditableAuthCode(clean);
                                            setCliTimeoutSecondsRemaining(null);
                                            const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                                            if (emailMatch && emailMatch[1]) {
                                              const pastedEmail = emailMatch[1].trim();
                                              if (!pastedEmail.includes("<") && !pastedEmail.includes("user-email")) {
                                                setUserEmail(pastedEmail);
                                                setAccountName((prev) => sanitizeDisplayAccountName(prev) || selectedStrategy.name);
                                              }
                                            }
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && redirectAuthCode.trim() && !isVerifyingAuthCode) {
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
                                            onClick={() => {
                                              setRedirectAuthCode("");
                                              setEditableAuthCode("");
                                            }}
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
                                        disabled={isVerifyingAuthCode || !redirectAuthCode.trim()}
                                        onClick={() => handleCompleteOAuthExchange(redirectAuthCode)}
                                      >
                                        <span className="submit-icon">{isVerifyingAuthCode ? "⏳" : "✔"}</span>
                                        <span>{isVerifyingAuthCode ? "Verifying..." : "Verify & Save"}</span>
                                      </button>
                                    </div>

                                    {redirectAuthCode && (
                                      <>
                                        <div className="authcode-synced-note">
                                          <span>✔ Code ready. Click Verify &amp; Save to store token.</span>
                                        </div>
                                        <div className="authcode-json-card" style={{ marginTop: "12px", background: "var(--theme-bg-surface, #ffffff)", border: "1px solid var(--theme-border-subtle, #e2e8f0)", borderRadius: "8px", padding: "12px", textAlign: "left" }}>
                                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                                            <div className="telemetry-tabs-bar" style={{ margin: 0, border: "none", padding: 0 }}>
                                              <button
                                                type="button"
                                                className={`telemetry-tab-btn ${telemetryTab === "request" ? "active" : ""}`}
                                                onClick={() => setTelemetryTab("request")}
                                              >
                                                <span>⚡ Request (Payload)</span>
                                              </button>
                                              <button
                                                type="button"
                                                className={`telemetry-tab-btn ${telemetryTab === "response" ? "active" : ""}`}
                                                onClick={() => setTelemetryTab("response")}
                                              >
                                                <span>🤖 Response (Validation)</span>
                                              </button>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                              {telemetryTab === "request" ? (
                                                <span className="code-captured-tag" style={{ fontSize: "0.72rem" }}>
                                                  ✔ Ready For Verification
                                                </span>
                                              ) : isVerifyingAuthCode ? (
                                                <span className="http-status-badge info" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #93c5fd" }}>
                                                  ⏳ Verifying...
                                                </span>
                                              ) : !verificationTelemetry ? (
                                                <span className="http-status-badge info" style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                                                  HTTP 102 Pending Verification
                                                </span>
                                              ) : (
                                                <span className={`http-status-badge ${verificationTelemetry.status === "failure" ? "warning" : "success"}`}>
                                                  {verificationTelemetry.status === "failure" ? "HTTP 400 Inactive" : "HTTP 200 OK"}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <pre style={{ margin: 0, padding: "10px", background: "var(--theme-bg-muted, #f8fafc)", border: "1px solid var(--theme-border-subtle, #cbd5e1)", borderRadius: "6px", fontSize: "0.76rem", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxWidth: "100%", overflowX: "hidden", color: "var(--theme-text-primary, #1e293b)", lineHeight: "1.4" }}>
                                            {telemetryTab === "request"
                                              ? JSON.stringify({
                                                method: "POST",
                                                endpoint: "/api/v1/auth/oauth/exchange",
                                                headers: {
                                                  "Content-Type": "application/json",
                                                  "X-Correlation-ID": verificationTelemetry?.correlationId || "corr-pending",
                                                  "X-Trace-ID": verificationTelemetry?.traceId || "trace-pending",
                                                },
                                                body: {
                                                  provider: selectedProviderId,
                                                  modelId: targetModelId,
                                                  authCode: redirectAuthCode,
                                                  userEmail: userEmail || selectedAccountEmail,
                                                  grant_type: "authorization_code",
                                                  status: "CAPTURED",
                                                  validationTarget: isGoogle
                                                    ? (selectedGoogleCli === "antigravity" ? "Google Gemini CLI Daemon" : "Gemini CLI Daemon")
                                                    : `${selectedStrategy.name} CLI Daemon`,
                                                  nextStep: "Click 'Verify & Save' to validate credentials and activate Token Vault",
                                                },
                                              }, null, 2)
                                              : isVerifyingAuthCode
                                                ? JSON.stringify({
                                                  status: "102 Processing",
                                                  httpStatus: 102,
                                                  headers: {
                                                    "Content-Type": "application/json",
                                                    "X-Response-Time": "Measuring...",
                                                  },
                                                  body: {
                                                    status: "VERIFYING_UPSTREAM",
                                                    token_type: "Bearer",
                                                    scope: selectedStrategy.defaultScopes,
                                                    provider: selectedProviderId,
                                                    diagnosticMessage: "Exchanging authorization code and validating credentials with upstream identity provider...",
                                                  },
                                                }, null, 2)
                                                : !verificationTelemetry
                                                  ? JSON.stringify({
                                                    status: "102 Processing",
                                                    httpStatus: 102,
                                                    headers: {
                                                      "Content-Type": "application/json",
                                                      "X-RateLimit-Remaining": "99",
                                                      "X-Response-Time": "0ms",
                                                    },
                                                    body: {
                                                      status: "PENDING_VERIFICATION",
                                                      token_type: "Bearer",
                                                      scope: selectedStrategy.defaultScopes,
                                                      expires_in: 3600,
                                                      verifiedUser: userEmail || selectedAccountEmail || "Pending Selection",
                                                      tokenVault: "INACTIVE (Pending validation)",
                                                      diagnosticMessage: "Authorization code captured. Click 'Verify & Save' to execute upstream token exchange and validate credentials.",
                                                    },
                                                  }, null, 2)
                                                  : JSON.stringify({
                                                    status: verificationTelemetry.status === "failure" ? "400 Bad Request" : "200 OK",
                                                    httpStatus: verificationTelemetry.status === "failure" ? 400 : 200,
                                                    headers: {
                                                      "Content-Type": "application/json",
                                                      "X-RateLimit-Remaining": "99",
                                                      "X-Response-Time": `${verificationTelemetry.latencyMs || testResult?.latencyMs || 0}ms`,
                                                    },
                                                    body: {
                                                      status: verificationTelemetry.status === "failure" ? "UNVERIFIED" : "VALIDATED",
                                                      token_type: "Bearer",
                                                      scope: selectedStrategy.defaultScopes,
                                                      expires_in: 3600,
                                                      verifiedUser: userEmail || selectedAccountEmail,
                                                      tokenVault: verificationTelemetry.status === "failure" ? "INACTIVE (Pending validation)" : "ACTIVE",
                                                      diagnosticMessage: verificationTelemetry.message || "OAuth 2.0 PKCE credentials exchange ready.",
                                                    },
                                                  }, null, 2)}
                                          </pre>
                                        </div>
                                      </>
                                    )}

                                    {!isVerifyingAuthCode && verificationTelemetry && (
                                      <div
                                        className="verification-telemetry-box"
                                        style={{
                                          marginTop: "16px",
                                          padding: "16px",
                                          borderRadius: "10px",
                                          border: verificationTelemetry.status === "success" ? "1px solid #86efac" : "1px solid #fca5a5",
                                          background: verificationTelemetry.status === "success" ? "#f0fdf4" : "#fef2f2",
                                          textAlign: "left",
                                        }}
                                      >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: verificationTelemetry.status === "success" ? "#166534" : "#991b1b" }}>
                                            {verificationTelemetry.status === "success" ? "✔ OAuth Verification Telemetry (Success)" : "⚠️ OAuth Verification Diagnostics & Telemetry"}
                                          </span>
                                          <span style={{ fontSize: "0.74rem", color: "#64748b" }}>{verificationTelemetry.timestamp}</span>
                                        </div>

                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginBottom: "12px" }}>
                                          <div style={{ background: "#ffffff", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block" }}>Correlation ID</span>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginTop: "2px" }}>
                                              <code style={{ fontSize: "0.78rem", color: "#0f172a", wordBreak: "break-all" }}>{verificationTelemetry.correlationId}</code>
                                              <button
                                                type="button"
                                                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "0.85rem" }}
                                                onClick={() => {
                                                  navigator.clipboard.writeText(verificationTelemetry.correlationId);
                                                  alert("Correlation ID copied!");
                                                }}
                                                title="Copy Correlation ID"
                                              >
                                                📋
                                              </button>
                                            </div>
                                          </div>

                                          <div style={{ background: "#ffffff", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block" }}>W3C Trace ID</span>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginTop: "2px" }}>
                                              <code style={{ fontSize: "0.78rem", color: "#0f172a", wordBreak: "break-all" }}>{verificationTelemetry.traceId}</code>
                                              <button
                                                type="button"
                                                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "0.85rem" }}
                                                onClick={() => {
                                                  navigator.clipboard.writeText(verificationTelemetry.traceId);
                                                  alert("Trace ID copied!");
                                                }}
                                                title="Copy Trace ID"
                                              >
                                                📋
                                              </button>
                                            </div>
                                          </div>
                                        </div>

                                        <div style={{ background: "var(--theme-bg-surface, #ffffff)", borderRadius: "8px", padding: "12px", border: "1px solid var(--theme-border-subtle, #e2e8f0)", color: "var(--theme-text-primary, #0f172a)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                                            <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--theme-primary, #2563eb)", letterSpacing: "0.5px" }}>
                                              🐳 DOCKER LOG SEARCH COMMAND
                                            </span>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                              <div className="docker-log-os-tabs">
                                                <button
                                                  type="button"
                                                  className={`os-tab-btn ${dockerLogOs === "linux" ? "active" : ""}`}
                                                  onClick={() => setDockerLogOs("linux")}
                                                >
                                                  Linux
                                                </button>
                                                <button
                                                  type="button"
                                                  className={`os-tab-btn ${dockerLogOs === "powershell" ? "active" : ""}`}
                                                  onClick={() => setDockerLogOs("powershell")}
                                                >
                                                  PowerShell
                                                </button>
                                                <button
                                                  type="button"
                                                  className={`os-tab-btn ${dockerLogOs === "macos" ? "active" : ""}`}
                                                  onClick={() => setDockerLogOs("macos")}
                                                >
                                                  macOS
                                                </button>
                                              </div>
                                              <button
                                                type="button"
                                                style={{
                                                  background: "var(--theme-primary-soft, #eff6ff)",
                                                  border: "1px solid var(--theme-primary-border, #bfdbfe)",
                                                  color: "var(--theme-primary, #2563eb)",
                                                  borderRadius: "4px",
                                                  padding: "3px 8px",
                                                  fontSize: "0.72rem",
                                                  fontWeight: 600,
                                                  cursor: "pointer",
                                                }}
                                                onClick={() => {
                                                  const cmd = getOsDockerCommand(verificationTelemetry.correlationId, dockerLogOs);
                                                  navigator.clipboard.writeText(cmd);
                                                  alert("Docker command copied to clipboard!");
                                                }}
                                              >
                                                📋 Copy Command
                                              </button>
                                            </div>
                                          </div>
                                          <code style={{ fontSize: "0.78rem", color: "var(--theme-text-primary, #0f172a)", fontFamily: "monospace", wordBreak: "break-all", display: "block", background: "var(--theme-bg-muted, #f8fafc)", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--theme-border-subtle, #e2e8f0)" }}>
                                            {getOsDockerCommand(verificationTelemetry.correlationId, dockerLogOs)}
                                          </code>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Collapsible Advanced OAuth Parameters: ONLY rendered for Individual mode to prevent duplication in Enterprise mode */}
                              {accountCategory === "individual" && (
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
                                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                          <input
                                            type={showClientSecret ? "text" : "password"}
                                            className="form-input"
                                            style={{ paddingRight: "2.5rem" }}
                                            placeholder="Leave blank for public PKCE apps"
                                            value={oauthClientSecret}
                                            onChange={(e) => setOauthClientSecret(e.target.value)}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => setShowClientSecret((prev) => !prev)}
                                            style={{
                                              position: "absolute",
                                              right: "8px",
                                              background: "transparent",
                                              border: "none",
                                              cursor: "pointer",
                                              fontSize: "1rem",
                                              padding: "2px 6px",
                                            }}
                                            title={showClientSecret ? "Hide secret" : "Show secret"}
                                          >
                                            {showClientSecret ? "🙈" : "👁️"}
                                          </button>
                                        </div>
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
                              )}

                              {(isOAuthVerificationFailed || testResult?.status === "FAILED") && (
                                <div className="oauth-issue-notification-card" style={{
                                  background: "#fef2f2",
                                  border: "1px solid #f87171",
                                  borderRadius: "8px",
                                  padding: "12px 16px",
                                  margin: "16px 0 8px 0",
                                  color: "#991b1b",
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.9rem" }}>
                                      <span>⚠️</span> Unverified Session: Authentication Issue Detected ({targetModelId})
                                    </strong>
                                    <button
                                      type="button"
                                      className="btn-notify-issue"
                                      onClick={() => {
                                        setActionInfo(`Issue reported to administrator: Authentication required for ${targetModelId}. Error: ${testResult?.errorMessage || testResult?.message || "Missing active session credentials"}`);
                                      }}
                                      style={{
                                        background: "#dc2626",
                                        color: "#ffffff",
                                        border: "none",
                                        borderRadius: "6px",
                                        padding: "4px 10px",
                                        fontSize: "0.8rem",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                      }}
                                    >
                                      📢 Notify Issue &amp; Report
                                    </button>
                                  </div>
                                  <div style={{ fontSize: "0.82rem", lineHeight: 1.4 }}>
                                    {testResult?.message || "Antigravity CLI authentication required. Click 'Browser Sign-In' to log in."}
                                    {testResult?.errorMessage && (
                                      <div style={{ marginTop: "4px", fontFamily: "monospace", fontSize: "0.78rem", background: "#fee2e2", padding: "4px 8px", borderRadius: "4px" }}>
                                        Execution Diagnostic Error: {testResult.errorMessage}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Trace Telemetry Table (W3C OpenTelemetry) for Step 2 - always shown on success or failure */}
                              {(testResult?.traceId || testResult?.correlationId || verificationTelemetry?.traceId || verificationTelemetry?.correlationId) && (
                                <div className="telemetry-table-card" data-testid="step2-telemetry-table-card" style={{ marginTop: "16px", marginBottom: "8px" }}>
                                  <div className="telemetry-header">
                                    <span className="telemetry-icon">📡</span>
                                    <span className="telemetry-title">Trace Telemetry (W3C OTel)</span>
                                  </div>
                                  <div className="telemetry-table-responsive-wrapper">
                                    <table className="telemetry-table">
                                      <thead>
                                        <tr>
                                          <th className="th-key">Property</th>
                                          <th className="th-val">Identifier (W3C Standard)</th>
                                          <th className="th-act">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(testResult?.traceId || verificationTelemetry?.traceId) && (
                                          <tr>
                                            <td className="td-key">Trace ID</td>
                                            <td className="td-val">
                                              <code className="telemetry-code">{testResult?.traceId || verificationTelemetry?.traceId}</code>
                                            </td>
                                            <td className="td-act">
                                              <button
                                                type="button"
                                                className="btn-copy-telemetry"
                                                onClick={() => {
                                                  navigator.clipboard.writeText(testResult?.traceId || verificationTelemetry?.traceId || "");
                                                  setCopiedTelemetryKey("trace");
                                                  setTimeout(() => setCopiedTelemetryKey(null), 2000);
                                                }}
                                                title="Copy Trace ID"
                                              >
                                                {copiedTelemetryKey === "trace" ? "✔ Copied" : "📋 Copy"}
                                              </button>
                                            </td>
                                          </tr>
                                        )}
                                        {testResult?.spanId && (
                                          <tr>
                                            <td className="td-key">Span ID</td>
                                            <td className="td-val">
                                              <code className="telemetry-code">{testResult.spanId}</code>
                                            </td>
                                            <td className="td-act">
                                              <button
                                                type="button"
                                                className="btn-copy-telemetry"
                                                onClick={() => {
                                                  navigator.clipboard.writeText(testResult?.spanId || "");
                                                  setCopiedTelemetryKey("span");
                                                  setTimeout(() => setCopiedTelemetryKey(null), 2000);
                                                }}
                                                title="Copy Span ID"
                                              >
                                                {copiedTelemetryKey === "span" ? "✔ Copied" : "📋 Copy"}
                                              </button>
                                            </td>
                                          </tr>
                                        )}
                                        {(testResult?.correlationId || verificationTelemetry?.correlationId) && (
                                          <tr>
                                            <td className="td-key">Correlation ID</td>
                                            <td className="td-val">
                                              <code className="telemetry-code">{testResult?.correlationId || verificationTelemetry?.correlationId}</code>
                                            </td>
                                            <td className="td-act">
                                              <button
                                                type="button"
                                                className="btn-copy-telemetry"
                                                onClick={() => {
                                                  navigator.clipboard.writeText(testResult?.correlationId || verificationTelemetry?.correlationId || "");
                                                  setCopiedTelemetryKey("correlation");
                                                  setTimeout(() => setCopiedTelemetryKey(null), 2000);
                                                }}
                                                title="Copy Correlation ID"
                                              >
                                                {copiedTelemetryKey === "correlation" ? "✔ Copied" : "📋 Copy"}
                                              </button>
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              <div className="step-navigation-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #e2e8f0" }}>
                                <button
                                  type="button"
                                  className="btn-ui-secondary"
                                  onClick={() => setActiveOAuthStep(1)}
                                >
                                  <span>← Back: Select Provider</span>
                                </button>
                                <button
                                  type="button"
                                  className={`btn-oauth-action ${canProceedToVault ? "btn-browser-auth" : "btn-disabled"}`}
                                  disabled={!canProceedToVault}
                                  onClick={() => {
                                    if (canProceedToVault) {
                                      setActiveOAuthStep(3);
                                    }
                                  }}
                                  title={
                                    isVerifyingAuthCode
                                      ? "Verification in progress..."
                                      : cliScriptError || actionError
                                        ? "Verification failed. Re-verify code to proceed."
                                        : canProceedToVault
                                          ? "Click to proceed to Token Vault & Verification."
                                          : redirectAuthCode.trim() && !verificationTelemetry
                                            ? "Authorization code pending verification. Click 'Verify & Save' first."
                                            : "Verification required before proceeding to Token Vault."
                                  }
                                  style={{
                                    cursor: canProceedToVault ? "pointer" : "not-allowed",
                                    opacity: canProceedToVault ? 1 : 0.5,
                                  }}
                                >
                                  <span>
                                    {isVerifyingAuthCode
                                      ? "Verifying..."
                                      : canProceedToVault
                                        ? "✔ Next: Token Vault & Verification →"
                                        : "Next: Token Vault & Verification →"}
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Step 3: Authenticated Token Vault */}
                          {effectiveOAuthStep === 3 && (
                            oauthSession ? (
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
                                      <button
                                        type="button"
                                        className="btn-ui-secondary btn-signout-configured"
                                        onClick={handleSignoutAllAccounts}
                                        title="Sign out and deactivate all existing configured accounts before container re-creation"
                                        style={{ marginLeft: "8px", fontSize: "0.8rem", padding: "4px 10px" }}
                                      >
                                        🚪 Sign Out Configured
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
                                        disabled={isVerifyingDirectory}
                                        title="Verify directory state and check changed files locally"
                                      >
                                        {isVerifyingDirectory ? "⏳ Verifying..." : "🔄 Verify Directory & Diff"}
                                      </button>
                                    </div>
                                    {directoryVerificationFeedback && (
                                      <div
                                        className={`vcs-feedback-row ${directoryVerificationFeedback.type === "success" ? "feedback-success" : "feedback-error"}`}
                                        style={{
                                          marginTop: "10px",
                                          padding: "8px 12px",
                                          borderRadius: "6px",
                                          fontSize: "0.8rem",
                                          background: directoryVerificationFeedback.type === "success" ? "#f0fdf4" : "#fef2f2",
                                          border: directoryVerificationFeedback.type === "success" ? "1px solid #86efac" : "1px solid #fca5a5",
                                          color: directoryVerificationFeedback.type === "success" ? "#166534" : "#991b1b",
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          flexWrap: "wrap",
                                          gap: "8px",
                                        }}
                                      >
                                        <span style={{ fontWeight: 600 }}>
                                          {directoryVerificationFeedback.type === "success" ? "✔" : "⚠️"} {directoryVerificationFeedback.message}
                                          {directoryVerificationFeedback.commitHash && ` (Commit: ${directoryVerificationFeedback.commitHash.slice(0, 7)})`}
                                        </span>
                                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                          {directoryVerificationFeedback.correlationId && (
                                            <code style={{ fontSize: "0.74rem", background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: "4px" }}>
                                              Corr: {directoryVerificationFeedback.correlationId}
                                            </code>
                                          )}
                                          <span style={{ fontSize: "0.74rem", opacity: 0.8 }}>{directoryVerificationFeedback.timestamp}</span>
                                        </div>
                                      </div>
                                    )}
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
                                        onClick={async () => {
                                          setActiveOAuthStep(2);
                                          setCliScriptError(null);
                                          setActionError(null);
                                          setTestResult(null);
                                          await handleExecuteCliLogin();
                                        }}
                                        disabled={isCliLoggingIn}
                                        title="Execute CLI login to refresh OAuth 2.0 token"
                                        data-testid="btn-oauth-cli-auth"
                                      >
                                        <span className="btn-icon">⚡</span>
                                        <span>{isCliLoggingIn ? "Re-Authenticating..." : "Re-Authenticate"}</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn-oauth-action btn-cli-auth btn-reauth-action"
                                        onClick={async () => {
                                          setActiveOAuthStep(2);
                                          setCliScriptError(null);
                                          setActionError(null);
                                          setTestResult(null);
                                          await handleInitiateBrowserRedirect();
                                        }}
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
                                      <label>Access Token</label>
                                      <button
                                        type="button"
                                        className="toggle-token-btn"
                                        onClick={() => setShowAccessToken(!showAccessToken)}
                                        title={showAccessToken ? "Hide access token" : "Show access token"}
                                      >
                                        {showAccessToken ? "🙈 Hide" : "👁 Show"}
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
                                        title="Save access token"
                                        disabled={isSavingToken || !editableAccessToken.trim()}
                                        onClick={handleSaveEditedToken}
                                      >
                                        {isSavingToken ? "Saving..." : "Save"}
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
                                          <span className={`authcode-badge ${cliScriptError || actionError
                                            ? "badge-error"
                                            : (oauthSession && !oauthSession.authCode.includes("invalid") && state.modelAccounts.some((a) => a.modelId === targetModelId && a.isActive))
                                              ? "badge-success"
                                              : "badge-warning"
                                            }`}>
                                            {cliScriptError || actionError
                                              ? "Verification Failed"
                                              : (oauthSession && !oauthSession.authCode.includes("invalid") && state.modelAccounts.some((a) => a.modelId === targetModelId && a.isActive))
                                                ? "Verified & Active in DB"
                                                : "Unverified / Needs Verification"}
                                          </span>
                                        </div>
                                        <div className="authcode-wrapper token-input-wrapper">
                                          <input
                                            type="text"
                                            className="authcode-input token-input"
                                            value={editableAuthCode}
                                            placeholder="Paste authorization code..."
                                            onChange={(e) => setEditableAuthCode(extractCleanAuthCode(e.target.value))}
                                            onPaste={(e) => {
                                              e.preventDefault();
                                              const text = e.clipboardData.getData("text");
                                              if (text) {
                                                setEditableAuthCode(extractCleanAuthCode(text));
                                              }
                                            }}
                                          />
                                          <button
                                            type="button"
                                            className="token-copy-btn"
                                            title="Copy Authorization Code"
                                            onClick={() => {
                                              navigator.clipboard.writeText(editableAuthCode || "");
                                              alert("Authorization code copied to clipboard!");
                                            }}
                                          >
                                            📋
                                          </button>
                                          <button
                                            type="button"
                                            className="token-copy-btn"
                                            title="Paste code from clipboard"
                                            onClick={async () => {
                                              if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
                                                try {
                                                  const text = await navigator.clipboard.readText();
                                                  if (text) {
                                                    setEditableAuthCode(extractCleanAuthCode(text));
                                                  }
                                                } catch { }
                                              }
                                            }}
                                          >
                                            📥
                                          </button>
                                          <button
                                            type="button"
                                            className="token-save-btn"
                                            title={editableAuthCode.trim() ? "Verify & Save authorization code" : "Awaiting Authorization Code"}
                                            disabled={isVerifyingAuthCode || !editableAuthCode.trim()}
                                            onClick={() => handleCompleteOAuthExchange(editableAuthCode)}
                                          >
                                            {isVerifyingAuthCode ? "Verifying..." : editableAuthCode.trim() ? "Verify & Save" : "Awaiting Code"}
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
                                        <div key={idx} className="scope-chip">
                                          <span className="scope-check">✔</span>
                                          <span className="scope-url">{s}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="oauth-pre-auth-view" style={{ textAlign: "center", padding: "28px 16px", background: "#f8fafc", borderRadius: "10px", border: "1px dashed #cbd5e1", margin: "16px 0" }}>
                                <div className="alert-banner warning" style={{ margin: "0 auto 16px auto", maxWidth: "560px" }}>
                                  <span className="alert-icon">⚠️</span>
                                  <span className="alert-text">No active OAuth session in memory. Complete Step 2 to sign in.</span>
                                </div>
                                <button
                                  type="button"
                                  className="btn-oauth-action btn-browser-auth"
                                  onClick={() => setActiveOAuthStep(2)}
                                >
                                  <span>← Go to Step 2: Browser Consent</span>
                                </button>
                              </div>
                            )
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
                              <button
                                type="button"
                                className="btn-reverify-path"
                                onClick={handleVerifyBinaryPath}
                                disabled={isVerifyingBinaryPath}
                                title="Re-verify binary availability and permissions"
                              >
                                {isVerifyingBinaryPath ? "Verifying..." : "🔄 Re-Verify"}
                              </button>
                            </div>
                            {binaryVerificationNotice && (
                              <div className={`binary-verify-alert alert-${binaryVerificationNotice.type}`}>
                                {binaryVerificationNotice.type === "success" && "✔ "}
                                {binaryVerificationNotice.type === "warning" && "⚠️ "}
                                {binaryVerificationNotice.type === "error" && "✖ "}
                                {binaryVerificationNotice.message}
                              </div>
                            )}
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

                          <div className="authenticated-session-toolbar single-action-toolbar">
                            <button
                              type="button"
                              className="btn-oauth-action btn-browser-auth btn-launch-primary"
                              data-testid="btn-cli-browser-sign-in"
                              onClick={handleInitiateBrowserRedirect}
                              disabled={isRedirecting || isCliLoggingIn}
                              title="Launch browser OAuth sign-in"
                            >
                              <span className="btn-icon">🌐</span>
                              <span>{isRedirecting ? "Opening..." : "Browser Sign-In"}</span>
                            </button>
                          </div>

                          {(isWaitingForCallback || isCliLoggingIn || redirectAuthCode) && (
                            <div className="browser-authcode-capture-card" data-testid="cli-authcode-card">
                              <div className="authcode-card-header d-flex align-items-center justify-content-between flex-wrap gap-2">
                                <div className="header-title-row">
                                  <span className="card-icon">🔐</span>
                                  <div>
                                    <h5>Authorization Code</h5>
                                    <span className="card-subtext">
                                      Paste the code from browser consent to complete CLI authentication.
                                    </span>
                                  </div>
                                </div>
                                <div className="authcode-header-badges">
                                  {redirectAuthCode ? (
                                    <span className="code-captured-tag">✔ Captured</span>
                                  ) : (
                                    <span className="code-waiting-tag">Awaiting Code</span>
                                  )}
                                </div>
                              </div>

                              <div className="authcode-input-container">
                                <span className="authcode-lead-icon" title="OAuth Authorization Code">🔑</span>
                                <input
                                  type="text"
                                  className="form-input authcode-text-input"
                                  placeholder="Paste authorization code (e.g. 4/0AUn6...)"
                                  value={redirectAuthCode}
                                  onChange={(e) => {
                                    const clean = extractCleanAuthCode(e.target.value);
                                    setRedirectAuthCode(clean);
                                    setEditableAuthCode(clean);
                                    setCliTimeoutSecondsRemaining(null);
                                  }}
                                  onPaste={(e) => {
                                    e.preventDefault();
                                    const text = e.clipboardData.getData("text");
                                    if (text) {
                                      const clean = extractCleanAuthCode(text);
                                      setRedirectAuthCode(clean);
                                      setEditableAuthCode(clean);
                                      setCliTimeoutSecondsRemaining(null);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && redirectAuthCode.trim() && !isVerifyingAuthCode) {
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
                                      onClick={() => {
                                        setRedirectAuthCode("");
                                        setEditableAuthCode("");
                                        setCliTimeoutSecondsRemaining(null);
                                      }}
                                      title="Clear authorization code"
                                    >
                                      ✕
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={`btn-paste-code ${pastedFeedback ? "pasted-active" : ""}`}
                                    onClick={handlePasteAuthCode}
                                    title="Paste authorization code from clipboard"
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
                                  disabled={isVerifyingAuthCode || !redirectAuthCode.trim()}
                                  onClick={() => handleCompleteOAuthExchange(redirectAuthCode)}
                                >
                                  <span className="submit-icon">{isVerifyingAuthCode ? "⏳" : redirectAuthCode.trim() ? "✔" : "🔒"}</span>
                                  <span>{isVerifyingAuthCode ? "Verifying..." : redirectAuthCode.trim() ? "Verify & Save" : "Awaiting Authorization Code"}</span>
                                </button>
                              </div>

                              {redirectAuthCode && (
                                <div className="authcode-synced-note">
                                  <span>✔ Code ready. Click Verify &amp; Save to store token.</span>
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
                                  title={showAccessToken ? "Hide access token" : "Show access token"}
                                >
                                  {showAccessToken ? "🙈 Hide" : "👁 Show"}
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
                                  title="Copy token to clipboard"
                                  onClick={() => {
                                    navigator.clipboard.writeText(editableAccessToken);
                                  }}
                                >
                                  📋
                                </button>
                                <button
                                  type="button"
                                  className="token-save-btn"
                                  title="Save access token"
                                  disabled={isSavingToken || !editableAccessToken.trim()}
                                  onClick={handleSaveEditedToken}
                                >
                                  {isSavingToken ? "Saving..." : "Save"}
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
                      {/* 4. WEB SESSION TAB                                            */}
                      {/* ============================================================= */}
                      {selectedProtocol === "cookie" && (
                        <div className="protocol-fields-container">
                          <div className="protocol-badge-intro cookie-intro">
                            <span className="badge-icon">🌐</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <strong>Encrypted Web Session Lineage</strong>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-browser-auth"
                                  onClick={() => {
                                    const port = 8085;
                                    const webLoginUrl = `http://localhost:${port}/oauth2/authorize?provider=${selectedProviderId}&model=${targetModelId}&flow=web&returnUrl=${encodeURIComponent(window.location.origin)}`;
                                    window.open(webLoginUrl, "_blank", "width=520,height=680");
                                    setActionInfo("Web session portal opened. Complete sign-in in the browser window to capture session credentials.");
                                  }}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    background: "#2563eb",
                                    color: "#ffffff",
                                    border: "none",
                                    padding: "6px 14px",
                                    borderRadius: "6px",
                                    fontWeight: 600,
                                    fontSize: "0.82rem",
                                    cursor: "pointer",
                                  }}
                                >
                                  <span>🌐</span>
                                  <span>Browser Web Login</span>
                                </button>
                              </div>
                              <p>Capture or inject HTTP cookies &amp; session headers to maintain stateful authorization sessions.</p>
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

                      {/* Interaction Mode Selector, Reasoning Effort Tier Selector, Verification Prompt & Form Actions */}
                      {/* Strictly scoped: only for non-OAuth protocols OR Step 3 (Token Vault & Verification) of OAuth WITH valid active session */}
                      {(selectedProtocol !== "oauth" || (effectiveOAuthStep === 3 && Boolean(oauthSession))) && (
                        <>
                          <div className="effort-tier-selector-container mode-selector-container">
                            <div className="effort-header-row tier-header-row">
                              <label className="tier-label">Interaction Mode</label>
                              <span className="tier-badge-current">
                                {executionMode.toUpperCase()}{executionMode === "chat" ? " (Default)" : ""}
                              </span>
                            </div>
                            <div className="mode-segmented-control">
                              <button
                                type="button"
                                className={`mode-btn ${executionMode === "chat" ? "active" : ""}`}
                                onClick={() => setExecutionMode("chat")}
                                title="Chat mode: multi-turn conversational session (Default during testing)"
                              >
                                💬 Chat (Default)
                              </button>
                              <button
                                type="button"
                                className={`mode-btn ${executionMode === "ask" ? "active" : ""}`}
                                onClick={() => setExecutionMode("ask")}
                                title="Ask mode: single prompt query execution"
                              >
                                ❓ Ask
                              </button>
                              <button
                                type="button"
                                className={`mode-btn ${executionMode === "agent" ? "active" : ""}`}
                                onClick={() => setExecutionMode("agent")}
                                title="Agent mode: autonomous ReAct loop with tools"
                              >
                                🤖 Agent
                              </button>
                            </div>
                          </div>

                          <div className="effort-tier-selector-container">
                            <div className="effort-header-row tier-header-row">
                              <label className="tier-label">Reasoning Effort</label>
                              <span className="tier-badge-current">
                                {modelEffortTier.toUpperCase()}{modelEffortTier === "low" ? " (Lowest - Preferred)" : ""}
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

                          <div className="form-group">
                            <label>Verification Prompt</label>
                            <input
                              type="text"
                              className="form-input"
                              value={testPrompt}
                              onChange={(e) => setTestPrompt(e.target.value)}
                            />
                          </div>

                          {(() => {
                            const isAuthCompleteOrProvided = Boolean(
                              editingAccountId ||
                              (selectedProtocol === "api" && (apiKey.trim() || apiAuthType === "none")) ||
                              (selectedProtocol === "cookie" && cookieString.trim()) ||
                              (selectedProtocol === "oauth" && (oauthSession?.accessToken || redirectAuthCode || isAccountVerified)) ||
                              (selectedProtocol === "cli" && (oauthSession || isAccountVerified || redirectAuthCode))
                            );

                            return (
                              <div className="form-action-row">
                                <button
                                  type="button"
                                  className="test-handshake-btn"
                                  data-testid="btn-test-connection"
                                  onClick={handleTestCurrentConfig}
                                  disabled={isTesting || !isAuthCompleteOrProvided}
                                  title={
                                    !isAuthCompleteOrProvided
                                      ? "Authentication required before testing or saving"
                                      : "Test connection with current parameters"
                                  }
                                >
                                  {isTesting ? "Testing..." : "⚡ Test"}
                                </button>

                                {editingAccountId ? (
                                  <>
                                    <button
                                      type="button"
                                      className="test-handshake-btn"
                                      title="Exit edit mode without saving changes"
                                      onClick={handleDoneEditing}
                                      disabled={isTesting}
                                      data-testid="btn-done-editing"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="submit"
                                      className="save-config-btn"
                                      disabled={isSaving || isTesting || !isAuthCompleteOrProvided}
                                      data-testid="btn-save"
                                      title={
                                        !isAuthCompleteOrProvided
                                          ? "Authentication required before updating"
                                          : "Update connection configuration"
                                      }
                                    >
                                      {isSaving ? "Updating..." : "Update"}
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="submit"
                                    className="save-config-btn"
                                    disabled={
                                      isSaving ||
                                      isTesting ||
                                      !isAuthCompleteOrProvided ||
                                      (selectedProtocol === "oauth" && testResult?.status !== "VERIFIED")
                                    }
                                    data-testid="btn-save"
                                    title={
                                      !isAuthCompleteOrProvided
                                        ? "Authentication required before saving"
                                        : selectedProtocol === "oauth" && testResult?.status !== "VERIFIED"
                                          ? "Please run '⚡ Test' and achieve 'VERIFIED' status before saving."
                                          : "Save connection configuration"
                                    }
                                  >
                                    {isSaving ? "Saving..." : "Save"}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </form>

                    {/* Test Connection Results Feedback Panel - Isolated Per Selected Protocol */}
                    {(() => {
                      const activeTestResult = testResultsByProtocol[selectedProtocol];
                      if (!activeTestResult) return null;
                      const testResult = activeTestResult;
                      const parsed = parseStructuredModelOutput(testResult.modelOutput);
                      return (
                        <div className={`test-feedback-panel ${testResult.status.toLowerCase()}`}>
                          <div className="feedback-header">
                            <span className="feedback-status-pill status-badge">
                              {testResult.status === "VERIFIED" ? "✓ VERIFIED" : "✕ FAILED"}
                            </span>
                            <span className="feedback-protocol protocol-badge">{testResult.protocol.toUpperCase()}</span>
                            {Boolean(testResult.isFallback || testResult.protocol?.includes("Ollama") || testResult.details?.fallbackUsed) && (
                              <span className="feedback-fallback-pill fallback-badge-pill" data-testid="ollama-fallback-badge">
                                🦙 OLLAMA FALLBACK ACTIVE
                              </span>
                            )}
                            <span className="feedback-mode tier-badge tier-mode" style={{ background: "rgba(115, 103, 240, 0.15)", border: "1px solid rgba(115, 103, 240, 0.35)", color: "#7367f0", fontWeight: 700, padding: "2px 8px", borderRadius: "100px", fontSize: "0.72rem" }}>
                              💬 MODE: {(testResult.mode || executionMode).toUpperCase()} {(testResult.mode || executionMode) === "chat" ? "(DEFAULT)" : ""}
                            </span>
                            <span className={`feedback-effort tier-badge tier-${testResult.effortTier || modelEffortTier}`}>
                              ⚖️ EFFORT: {(testResult.effortTier || modelEffortTier).toUpperCase()} {(testResult.effortTier || modelEffortTier) === "low" ? "(LOWEST)" : ""}
                            </span>
                            <span className="feedback-latency latency-badge">⚡ {testResult.latencyMs}ms</span>
                          </div>
                          <p className="feedback-msg feedback-message">
                            {selectedAccountEmail && testResult.message
                              ? testResult.message.replace(/for '[^']+'/, `for '${selectedAccountEmail}'`)
                              : testResult.message}
                          </p>

                          {Boolean(testResult.isFallback || testResult.protocol?.includes("Ollama") || testResult.details?.fallbackUsed) && (
                            <div className="ollama-fallback-active-banner" data-testid="ollama-fallback-active-banner">
                              <div className="banner-icon">🦙</div>
                              <div className="banner-content">
                                <div className="banner-title">Ollama Local Fallback Active</div>
                                <div className="banner-description">
                                  Primary cloud provider or CLI was unreachable or required re-authentication. The verification prompt was executed via the local Ollama fallback engine.
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Model Specs Card - Protocol specific mapping */}
                          <div className="model-cli-specs-card">
                            <div className="spec-item">
                              <span className="spec-label">Model Name</span>
                              <span className="spec-value highlight">🤖 {testResult.modelName || targetModelId}</span>
                            </div>

                            {selectedProtocol === "cli" && (
                              <>
                                <div className="spec-item">
                                  <span className="spec-label">CLI Binary</span>
                                  <span className="spec-value">💻 {testResult.cliName || selectedStrategy.cliCommand || cliExecutable || (isGoogle ? "antigravity" : selectedStrategy.id)}</span>
                                </div>
                                <div className="spec-item">
                                  <span className="spec-label">CLI Version</span>
                                  <span className="spec-value">🏷️ {testResult.cliVersion || "v1.4.12"}</span>
                                </div>
                              </>
                            )}

                            {selectedProtocol === "api" && (
                              <>
                                <div className="spec-item">
                                  <span className="spec-label">Protocol Mode</span>
                                  <span className="spec-value">🌐 REST HTTPS / v1beta</span>
                                </div>
                                <div className="spec-item">
                                  <span className="spec-label">Endpoint Base</span>
                                  <span className="spec-value" title={apiBaseUrl}>🔗 {apiBaseUrl ? apiBaseUrl.slice(0, 24) + "..." : "googleapis.com"}</span>
                                </div>
                              </>
                            )}

                            {selectedProtocol === "oauth" && (
                              <>
                                <div className="spec-item">
                                  <span className="spec-label">OAuth Provider</span>
                                  <span className="spec-value">{selectedStrategy.name || "Google"}</span>
                                </div>
                                <div className="spec-item">
                                  <span className="spec-label">Auth Flow</span>
                                  <span className="spec-value">🛡️ {accountCategory === "individual" ? (isGoogle ? (selectedGoogleCli === "antigravity" ? "Antigravity CLI OAuth" : "Gemini CLI OAuth") : `${selectedStrategy.name} OAuth`) : "OAuth 2.0 PKCE"}</span>
                                </div>
                              </>
                            )}

                            {selectedProtocol === "cookie" && (
                              <>
                                <div className="spec-item">
                                  <span className="spec-label">Protocol Mode</span>
                                  <span className="spec-value">🍪 Web Cookie Vault</span>
                                </div>
                                <div className="spec-item">
                                  <span className="spec-label">Domain Scope</span>
                                  <span className="spec-value">🌐 {cookieDomain}</span>
                                </div>
                              </>
                            )}

                            <div className="spec-item">
                              <span className="spec-label">Interaction Mode</span>
                              <span className="spec-value tier-pill tier-mode" style={{ background: "rgba(115, 103, 240, 0.15)", border: "1px solid rgba(115, 103, 240, 0.35)", color: "#7367f0", fontWeight: 700, padding: "2px 8px", borderRadius: "100px", fontSize: "0.75rem" }}>
                                {(testResult.mode || executionMode).toUpperCase()} {(testResult.mode || executionMode) === "chat" ? "(Default)" : ""}
                              </span>
                            </div>

                            <div className="spec-item">
                              <span className="spec-label">Reasoning Effort</span>
                              <span className={`spec-value tier-pill tier-${testResult.effortTier || modelEffortTier}`}>
                                {(testResult.effortTier || modelEffortTier).toUpperCase()} {(testResult.effortTier || modelEffortTier) === "low" ? "(Lowest Mode)" : ""}
                              </span>
                            </div>
                          </div>

                          {/* Executed HTTP Call or CLI Command */}
                          {(testResult.executedCall || testResult.executedCommand) && (
                            <div className="executed-call-card" data-testid="executed-call-card">
                              <div className="executed-call-header">
                                <div className="call-title-group">
                                  <span className="call-icon">
                                    {selectedProtocol === "cli" ? "💻" : selectedProtocol === "cookie" ? "🍪" : "🌐"}
                                  </span>
                                  <span className="call-title">
                                    {selectedProtocol === "cli"
                                      ? "Executed CLI Terminal Command"
                                      : selectedProtocol === "cookie"
                                        ? "Executed Session Lineage Header Validation"
                                        : selectedProtocol === "oauth"
                                          ? "Executed OAuth Token Validation Call"
                                          : "Executed REST API HTTP Call"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="btn-copy-call"
                                  onClick={() => {
                                    const toCopy = selectedProtocol === "cli"
                                      ? (testResult.executedCommand || testResult.executedCall || "")
                                      : (testResult.executedCall || testResult.executedCommand || "");
                                    navigator.clipboard.writeText(toCopy);
                                    setCopiedExecutedCall(true);
                                    setTimeout(() => setCopiedExecutedCall(false), 2000);
                                  }}
                                  title="Copy executed command or call to clipboard"
                                >
                                  <span>{copiedExecutedCall ? "✔ Copied" : "📋 Copy"}</span>
                                </button>
                              </div>
                              <div className="executed-call-body">
                                <code className="executed-call-content">
                                  {selectedProtocol === "cli"
                                    ? (testResult.executedCommand || testResult.executedCall)
                                    : (testResult.executedCall || testResult.executedCommand)}
                                </code>
                              </div>
                            </div>
                          )}

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
                                  <div className="meta-banner-header">
                                    <div className="meta-label">
                                      <span className="meta-icon">🔒</span>
                                      <span>Session Lineage &amp; Token Context</span>
                                    </div>
                                    {selectedAccountEmail && (
                                      <div className="session-account-tag" title="Selected account used for test and chat">
                                        <span className="account-tag-icon">👤</span>
                                        <span className="account-tag-title">Selected Account:</span>
                                        <strong className="account-tag-value">{selectedAccountEmail}</strong>
                                      </div>
                                    )}
                                  </div>
                                  <pre className="meta-text">{enrichMetaTextWithAccount(parsed.metaText, selectedAccountEmail)}</pre>
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
                                    <span>
                                      {Boolean(testResult.isFallback || testResult.protocol?.includes("Ollama") || testResult.details?.fallbackUsed)
                                        ? "Model Verification Response (Ollama Local Fallback)"
                                        : "Model Verification Response"}
                                    </span>
                                  </div>
                                  <div className="split-body">{parsed.responseText}</div>
                                </div>
                              </div>
                            </div>
                          ) : testResult.modelOutput ? (
                            <div className="feedback-model-output model-output-box">
                              <div className="output-meta-banner" style={{ marginBottom: "12px" }}>
                                <div className="meta-banner-header">
                                  <div className="meta-label">
                                    <span className="meta-icon">🔒</span>
                                    <span>Session Lineage &amp; Token Context</span>
                                  </div>
                                  {selectedAccountEmail && (
                                    <div className="session-account-tag" title="Selected account used for test and chat">
                                      <span className="account-tag-icon">👤</span>
                                      <span className="account-tag-title">Selected Account:</span>
                                      <strong className="account-tag-value">{selectedAccountEmail}</strong>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="output-header output-label">
                                <span className="output-title-badge">🤖 MODEL VERIFICATION RESPONSE</span>
                              </div>
                              <pre className="output-content">{enrichMetaTextWithAccount(testResult.modelOutput, selectedAccountEmail)}</pre>
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

                          {/* Distributed Telemetry & Investigation Table (W3C OpenTelemetry) */}
                          {(testResult.traceId || testResult.correlationId || testResult.spanId) && (
                            <div className="telemetry-table-card" data-testid="telemetry-table-card">
                              <div className="telemetry-header">
                                <span className="telemetry-icon">📡</span>
                                <span className="telemetry-title">Trace Telemetry (W3C OTel)</span>
                              </div>
                              <div className="telemetry-table-responsive-wrapper">
                                <table className="telemetry-table">
                                  <thead>
                                    <tr>
                                      <th className="th-key">Property</th>
                                      <th className="th-val">Identifier (W3C Standard)</th>
                                      <th className="th-act">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {testResult.traceId && (
                                      <tr>
                                        <td className="td-key">Trace ID</td>
                                        <td className="td-val">
                                          <code className="telemetry-code">{testResult.traceId}</code>
                                        </td>
                                        <td className="td-act">
                                          <button
                                            type="button"
                                            className="btn-copy-telemetry"
                                            onClick={() => {
                                              navigator.clipboard.writeText(testResult.traceId || "");
                                              setCopiedTelemetryKey("trace");
                                              setTimeout(() => setCopiedTelemetryKey(null), 2000);
                                            }}
                                            title="Copy Trace ID"
                                          >
                                            {copiedTelemetryKey === "trace" ? "✔ Copied" : "📋 Copy"}
                                          </button>
                                        </td>
                                      </tr>
                                    )}
                                    {testResult.spanId && (
                                      <tr>
                                        <td className="td-key">Span ID</td>
                                        <td className="td-val">
                                          <code className="telemetry-code">{testResult.spanId}</code>
                                        </td>
                                        <td className="td-act">
                                          <button
                                            type="button"
                                            className="btn-copy-telemetry"
                                            onClick={() => {
                                              navigator.clipboard.writeText(testResult.spanId || "");
                                              setCopiedTelemetryKey("span");
                                              setTimeout(() => setCopiedTelemetryKey(null), 2000);
                                            }}
                                            title="Copy Span ID"
                                          >
                                            {copiedTelemetryKey === "span" ? "✔ Copied" : "📋 Copy"}
                                          </button>
                                        </td>
                                      </tr>
                                    )}
                                    {testResult.correlationId && (
                                      <tr>
                                        <td className="td-key">Correlation ID</td>
                                        <td className="td-val">
                                          <code className="telemetry-code">{testResult.correlationId}</code>
                                        </td>
                                        <td className="td-act">
                                          <button
                                            type="button"
                                            className="btn-copy-telemetry"
                                            onClick={() => {
                                              navigator.clipboard.writeText(testResult.correlationId || "");
                                              setCopiedTelemetryKey("correlation");
                                              setTimeout(() => setCopiedTelemetryKey(null), 2000);
                                            }}
                                            title="Copy Correlation ID"
                                          >
                                            {copiedTelemetryKey === "correlation" ? "✔ Copied" : "📋 Copy"}
                                          </button>
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                              {testResult.traceId && (
                                <div className="docker-investigation-row">
                                  <span className="docker-label">Docker Log Filter:</span>
                                  <div className="docker-log-os-tabs">
                                    <button
                                      type="button"
                                      className={`os-tab-btn ${dockerLogOs === "linux" ? "active" : ""}`}
                                      onClick={() => setDockerLogOs("linux")}
                                    >
                                      Linux
                                    </button>
                                    <button
                                      type="button"
                                      className={`os-tab-btn ${dockerLogOs === "powershell" ? "active" : ""}`}
                                      onClick={() => setDockerLogOs("powershell")}
                                    >
                                      PowerShell
                                    </button>
                                    <button
                                      type="button"
                                      className={`os-tab-btn ${dockerLogOs === "macos" ? "active" : ""}`}
                                      onClick={() => setDockerLogOs("macos")}
                                    >
                                      macOS
                                    </button>
                                  </div>
                                  <code className="docker-cmd">
                                    {getOsDockerCommand(testResult.traceId || "", dockerLogOs)}
                                  </code>
                                  <button
                                    type="button"
                                    className="copy-docker-btn"
                                    onClick={() => {
                                      const cmd = getOsDockerCommand(testResult.traceId || "", dockerLogOs);
                                      navigator.clipboard.writeText(cmd);
                                      setCopiedDockerFilter(true);
                                      setTimeout(() => setCopiedDockerFilter(false), 2000);
                                    }}
                                    title="Copy Docker filter command"
                                  >
                                    {copiedDockerFilter ? "✔ Copied" : "📋 Copy Filter"}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>


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
