import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  StagedIntegrationAccount,
  StrategyMode,
  TestConnectionResult,
  UiIntegration,
  UiModelAccount,
  UpsertIntegrationPayload,
} from "@/types/ui.types";
import type { IntegrationCrudAccess } from "@/utils/auth/rbacPermissions";
import { ApiService } from "@/utils/services/apiService";
import { oauthProviderRegistry, sanitizeOAuthRedirectUrl } from "@/utils/services/oauthProviderRegistry";
import { StatusBadge } from "@/components/common";
import {
  renderProtocolSymbol,
  SymbolAlert,
  SymbolArrowLeft,
  SymbolBolt,
  SymbolBuilding,
  SymbolCheck,
  SymbolClose,
  SymbolEdit,
  SymbolGrid,
  SymbolLayers,
  SymbolList,
  SymbolLockVault,
  SymbolPlus,
  SymbolShield,
  SymbolTrash,
  SymbolUsers,
} from "@/components/integrations/OnboardingSymbols";

export type OnboardingTabId = "identity" | "protocols" | "capabilities";

export interface IntegrationOnboardingViewProps {
  readonly mode: "create" | "edit";
  readonly initialIntegration?: UiIntegration;
  readonly initialAccounts?: readonly UiModelAccount[];
  readonly currentUserEmail?: string;
  readonly rbac: IntegrationCrudAccess;
  readonly isSubmitting: boolean;
  readonly errorMessage: string | null;
  readonly onCancel: () => void;
  readonly onSubmit: (
    payload: UpsertIntegrationPayload,
    stagedAccounts: readonly StagedIntegrationAccount[],
    removedAccountIds: readonly string[],
  ) => Promise<void>;
  readonly onDelete?: (integrationId: string) => Promise<void>;
}

const INTEGRATION_CATEGORIES = [
  "AI Model Providers",
  "AI Workflow Platforms",
  "Agent Frameworks",
  "AI Coding Assistants",
  "Custom Connectors",
] as const;

const PROTOCOL_META: readonly {
  readonly id: StrategyMode;
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: "api", label: "REST API", hint: "Static Key" },
  { id: "oauth", label: "OAuth 2.0", hint: "Web Consent" },
  { id: "cli", label: "CLI Binary", hint: "Host Terminal" },
  { id: "cookie", label: "Cookie Vault", hint: "Session Lineage" },
];

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DEFAULT_OAUTH_CALLBACK_URI = "http://localhost:8085/oauth2callback";
const DEFAULT_OAUTH_AUTHORIZE_URL = "http://localhost:8085/oauth2/authorize";

function generateCryptoNonce(): string {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function generatePkceChallenge(): Promise<{ challenge: string; method: "S256" } | null> {
  if (typeof window === "undefined" || !window.crypto?.subtle || !window.crypto?.getRandomValues) {
    return null;
  }
  const verifierBytes = new Uint8Array(32);
  window.crypto.getRandomValues(verifierBytes);
  const verifier = Array.from(verifierBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { challenge: base64, method: "S256" };
}

function isTrustedOAuthMessageOrigin(origin: string): boolean {
  if (typeof window === "undefined") return false;
  const allowedOrigins = new Set([
    window.location.origin,
    "http://localhost:8085",
    "http://127.0.0.1:8085",
    "http://localhost:8095",
    "http://127.0.0.1:8095",
  ]);
  return allowedOrigins.has(origin);
}

interface OAuthRedirectLaunchParams {
  readonly modelSlug: string;
  readonly providerId: string;
  readonly clientId: string;
  readonly authEndpoint: string;
  readonly redirectUri: string;
  readonly scopes: string;
  readonly userEmail: string;
  readonly stateNonce: string;
  readonly pkce?: { readonly challenge: string; readonly method: "S256" } | null;
}

function isUsableOAuthRedirectUrl(url?: string): url is string {
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) return false;
  if (url.includes("<DB_") || url.includes("%3CDB_")) return false;
  if (url.includes("client_id=&")) return false;
  return true;
}

function buildOnboardingOAuthLaunchUrl(params: OAuthRedirectLaunchParams): string {
  const safeRedirectUri = params.redirectUri.trim() || DEFAULT_OAUTH_CALLBACK_URI;
  const safeScopes = params.scopes.trim() || "openid profile email";
  const returnOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const state = new URLSearchParams({
    app: "modelbox-studio",
    model: params.modelSlug,
    provider: params.providerId,
    flow: "oauth",
    nonce: params.stateNonce,
    returnUrl: returnOrigin,
  }).toString();

  const endpoint = params.authEndpoint.trim();
  const hasExplicitHttpEndpoint =
    endpoint.startsWith("http://") || endpoint.startsWith("https://");

  if (hasExplicitHttpEndpoint && params.clientId.trim()) {
    const url = new URL(endpoint);
    url.searchParams.set("client_id", params.clientId.trim());
    url.searchParams.set("redirect_uri", safeRedirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", safeScopes);
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "select_account consent");
    if (params.providerId === "google") {
      url.searchParams.set("include_granted_scopes", "true");
    }
    if (params.pkce) {
      url.searchParams.set("code_challenge", params.pkce.challenge);
      url.searchParams.set("code_challenge_method", params.pkce.method);
    }
    if (params.userEmail.trim()) url.searchParams.set("login_hint", params.userEmail.trim());
    return url.toString();
  }

  const gatewayParams = new URLSearchParams({
    model: params.modelSlug,
    provider: params.providerId,
    redirect_uri: safeRedirectUri,
    scope: safeScopes,
    state,
    returnUrl: returnOrigin,
  });
  if (params.pkce) {
    gatewayParams.set("code_challenge", params.pkce.challenge);
    gatewayParams.set("code_challenge_method", params.pkce.method);
  }
  if (params.clientId.trim()) {
    gatewayParams.set("client_id", params.clientId.trim());
  }
  return `${DEFAULT_OAUTH_AUTHORIZE_URL}?${gatewayParams.toString()}`;
}

function normalizeStrategyMode(rawType: string): StrategyMode {
  if (rawType === "oauth" || rawType === "cli_oauth") return "oauth";
  if (rawType === "cli") return "cli";
  if (rawType === "cookie") return "cookie";
  return "api";
}

function mapExistingAccountToStaged(acc: UiModelAccount): StagedIntegrationAccount {
  const cfg = (acc.config || {}) as Record<string, unknown>;
  return {
    accountId: acc.accountId,
    isPersisted: true,
    accountName: acc.accountName,
    userEmail: acc.userEmail,
    authType: normalizeStrategyMode(acc.authType),
    credentialValue: acc.credentialValue || "",
    isActive: acc.isActive,
    effortTier: (cfg.effortTier as "low" | "medium" | "high") || "medium",
    config: {
      apiBaseUrl: acc.config?.apiBaseUrl,
      apiVersion: acc.config?.apiVersion,
      authUrl: acc.config?.oauthAuthUrl || (cfg.authUrl ? String(cfg.authUrl) : undefined),
      tokenUrl: acc.config?.oauthTokenUrl || (cfg.tokenUrl ? String(cfg.tokenUrl) : undefined),
      oauthClientId: acc.config?.oauthClientId,
      oauthScopes: acc.config?.oauthScopes,
      redirectUri:
        acc.config?.oauthRedirectUri || (cfg.redirectUri ? String(cfg.redirectUri) : undefined),
      cliExecutable: acc.config?.cliExecutable,
      cliArguments: acc.config?.cliArguments,
      cookieDomain: acc.config?.cookieDomain,
    },
  };
}

export const IntegrationOnboardingView: React.FC<IntegrationOnboardingViewProps> = ({
  mode,
  initialIntegration,
  initialAccounts = [],
  currentUserEmail = "admin@model-connector.local",
  rbac,
  isSubmitting,
  errorMessage,
  onCancel,
  onSubmit,
  onDelete,
}) => {
  const isEditMode = mode === "edit" && Boolean(initialIntegration);
  const canMutate = isEditMode ? rbac.canUpdate : rbac.canCreate;

  const [activeTab, setActiveTab] = useState<OnboardingTabId>("identity");
  const [localError, setLocalError] = useState<string | null>(null);

  // Tab 1: Provider Identity
  const [integrationId, setIntegrationId] = useState(initialIntegration?.integrationId || "");
  const [providerName, setProviderName] = useState(initialIntegration?.providerName || "");
  const [providerShortCode, setProviderShortCode] = useState(
    initialIntegration?.providerShortCode || "",
  );
  const [category, setCategory] = useState<string>(initialIntegration?.category || "");
  const [accountCategory, setAccountCategory] = useState<"" | "individual" | "enterprise">(
    initialIntegration?.accountCategory || "",
  );
  const [lifecycleStatus, setLifecycleStatus] = useState<"" | "ACTIVE" | "DRAFT" | "INACTIVE">(
    initialIntegration?.lifecycleStatus || "",
  );
  const [docsUrl, setDocsUrl] = useState(initialIntegration?.docsUrl || "");
  const [description, setDescription] = useState(initialIntegration?.description || "");
  const [slugTouched, setSlugTouched] = useState(isEditMode);
  const [confirmDeleteIntegration, setConfirmDeleteIntegration] = useState(false);

  // Tab 2: Protocol Configuration Engine + Multi-Account Registry
  const [selectedProtocol, setSelectedProtocol] = useState<StrategyMode>(
    normalizeStrategyMode(initialIntegration?.supportedProtocols?.[0] || "api"),
  );
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [ownerEmail, setOwnerEmail] = useState(isEditMode ? currentUserEmail : "");
  const [credentialSecret, setCredentialSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(initialIntegration?.apiBaseUrl || "");
  const [apiVersion, setApiVersion] = useState("");
  const [authUrl, setAuthUrl] = useState(initialIntegration?.authUrl || "");
  const [tokenUrl, setTokenUrl] = useState(initialIntegration?.tokenUrl || "");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthScopes, setOauthScopes] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [cliExecutable, setCliExecutable] = useState(initialIntegration?.cliCommand || "");
  const [cliArguments, setCliArguments] = useState("");
  const [cookieDomain, setCookieDomain] = useState("");
  const [effortTier, setEffortTier] = useState<"low" | "medium" | "high">("medium");
  const [accountIsActive, setAccountIsActive] = useState(true);

  const [stagedAccounts, setStagedAccounts] = useState<StagedIntegrationAccount[]>(() =>
    initialAccounts.map(mapExistingAccountToStaged),
  );
  const [removedAccountIds, setRemovedAccountIds] = useState<string[]>([]);
  const [accountScopeFilter, setAccountScopeFilter] = useState<"all" | "active">("all");
  const [accountsViewMode, setAccountsViewMode] = useState<"list" | "card">("list");
  const [accountValidationMsg, setAccountValidationMsg] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [selectedGoogleCli, setSelectedGoogleCli] = useState<"antigravity" | "gemini">(
    initialIntegration?.cliCommand?.toLowerCase().includes("gemini") ? "gemini" : "antigravity",
  );
  const [isOAuthRedirecting, setIsOAuthRedirecting] = useState(false);
  const [isWaitingOAuthCallback, setIsWaitingOAuthCallback] = useState(false);
  const [oauthRedirectUrl, setOauthRedirectUrl] = useState<string>("");
  const [oauthAuthCodeInput, setOauthAuthCodeInput] = useState("");
  const [copiedOAuthUrl, setCopiedOAuthUrl] = useState(false);
  const [pastedAuthCode, setPastedAuthCode] = useState(false);
  const [isVerifyingAuthCode, setIsVerifyingAuthCode] = useState(false);
  const [isVerifyingVcsDir, setIsVerifyingVcsDir] = useState(false);
  const [vcsAuditState, setVcsAuditState] = useState<{
    readonly directoryPath: string;
    readonly isGitRepo: boolean;
    readonly commitHash?: string;
    readonly changedFiles: readonly string[];
  }>({
    directoryPath: "/app/config/data/credentials",
    isGitRepo: true,
    commitHash: undefined,
    changedFiles: [],
  });
  const [oauthRedirectNotice, setOauthRedirectNotice] = useState<{
    readonly tone: "success" | "info" | "warning" | "error";
    readonly message: string;
  } | null>(null);

  // Tab 3: Capabilities Tags (Empty in Create mode; persisted tags in Edit mode)
  const [capabilities, setCapabilities] = useState<string[]>(
    isEditMode && initialIntegration?.capabilities?.length
      ? [...initialIntegration.capabilities]
      : [],
  );
  const [tagDraftInput, setTagDraftInput] = useState("");
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [editingTagValue, setEditingTagValue] = useState("");

  const displayedAccounts = useMemo(() => {
    return accountScopeFilter === "active"
      ? stagedAccounts.filter((acc) => acc.isActive)
      : stagedAccounts;
  }, [stagedAccounts, accountScopeFilter]);

  const activeAccountsCount = useMemo(
    () => stagedAccounts.filter((acc) => acc.isActive).length,
    [stagedAccounts],
  );

  const derivedProtocols = useMemo(() => {
    const initial = isEditMode
      ? initialIntegration?.supportedProtocols?.map(normalizeStrategyMode) || []
      : [];
    return Array.from(new Set<StrategyMode>([...initial, ...stagedAccounts.map((a) => a.authType)]));
  }, [isEditMode, initialIntegration, stagedAccounts]);

  const handleProviderNameChange = (value: string) => {
    setProviderName(value);
    setLocalError(null);
    if (!isEditMode && !slugTouched) {
      setIntegrationId(slugify(value));
    }
  };

  const handleCreateTagsFromInput = (rawText: string = tagDraftInput) => {
    if (!canMutate) return;
    const candidates = rawText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;

    setCapabilities((prev) => {
      const existingLower = new Set(prev.map((item) => item.toLowerCase()));
      const additions = candidates.filter((item) => !existingLower.has(item.toLowerCase()));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
    setTagDraftInput("");
  };

  const handleRemoveTag = (indexToRemove: number) => {
    if (!canMutate) return;
    setCapabilities((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    if (editingTagIndex === indexToRemove) {
      setEditingTagIndex(null);
      setEditingTagValue("");
    }
  };

  const handleStartEditTag = (index: number) => {
    if (!canMutate) return;
    setEditingTagIndex(index);
    setEditingTagValue(capabilities[index] || "");
  };

  const handleCommitEditTag = () => {
    if (editingTagIndex === null) return;
    const trimmed = editingTagValue.trim();
    if (!trimmed) {
      handleRemoveTag(editingTagIndex);
    } else {
      setCapabilities((prev) =>
        prev.map((item, idx) => (idx === editingTagIndex ? trimmed : item)),
      );
    }
    setEditingTagIndex(null);
    setEditingTagValue("");
  };

  const activeModelSlug = useMemo(
    () => (integrationId || slugify(providerName) || "custom-provider").trim().toLowerCase(),
    [integrationId, providerName],
  );

  const oauthPopupRef = useRef<Window | null>(null);
  const oauthStateNonceRef = useRef<string>("");
  const oauthLaunchTimestampRef = useRef<number>(0);

  const closeActiveOAuthPopup = () => {
    try {
      if (oauthPopupRef.current && !oauthPopupRef.current.closed) {
        oauthPopupRef.current.close();
      }
    } catch {
      // Cross-origin window handle best-effort close
    } finally {
      oauthPopupRef.current = null;
    }
  };

  const applyOAuthCallbackPayload = (incoming: {
    accessToken?: string;
    token?: string;
    authCode?: string;
    code?: string;
    userEmail?: string;
    email?: string;
    state?: string;
  }) => {
    if (incoming.state && oauthStateNonceRef.current) {
      const incomingNonce = new URLSearchParams(incoming.state).get("nonce");
      if (incomingNonce && incomingNonce !== oauthStateNonceRef.current) {
        setOauthRedirectNotice({
          tone: "error",
          message: "Rejected OAuth callback due to CSRF state mismatch.",
        });
        setIsWaitingOAuthCallback(false);
        return;
      }
    }
    const tokenValue = incoming.accessToken || incoming.token || incoming.authCode || incoming.code;
    if (!tokenValue) return;
    const resolvedEmail = (incoming.userEmail || incoming.email || "").trim();
    setCredentialSecret(tokenValue);
    if (resolvedEmail && !ownerEmail.trim()) {
      setOwnerEmail(resolvedEmail);
    }
    if (!accountLabel.trim()) {
      setAccountLabel(providerName.trim() || "OAuth 2.0");
    }
    setIsWaitingOAuthCallback(false);
    setOauthRedirectNotice({
      tone: "success",
      message: resolvedEmail
        ? `OAuth redirect verified for ${resolvedEmail}. Click 'Save Integration' below to save it.`
        : "OAuth redirect verified and credential captured. Click 'Save Integration' below to save it.",
    });
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isTrustedOAuthMessageOrigin(event.origin)) {
        return;
      }
      if (
        event.data?.type === "MODELBOX_OAUTH_SUCCESS" ||
        event.data?.type === "OAUTH_CALLBACK_SUCCESS"
      ) {
        applyOAuthCallbackPayload(event.data);
      } else if (event.data?.type === "MODELBOX_OAUTH_ERROR") {
        setIsWaitingOAuthCallback(false);
        setOauthRedirectNotice({
          tone: "error",
          message: event.data.error || "OAuth authorization failed.",
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [activeModelSlug, ownerEmail, accountLabel, providerName]);

  const matchedOAuthStrategy = useMemo(
    () => oauthProviderRegistry.findStrategyForModel(activeModelSlug || providerName),
    [activeModelSlug, providerName],
  );

  const canonicalOAuthProviderId =
    matchedOAuthStrategy.id !== "custom" ? matchedOAuthStrategy.id : activeModelSlug;

  const canonicalOAuthModelId = useMemo(() => {
    if (
      canonicalOAuthProviderId === "google" &&
      !activeModelSlug.includes("3.") &&
      !activeModelSlug.includes("2.")
    ) {
      return "gemini-3.8-flash";
    }
    return activeModelSlug;
  }, [canonicalOAuthProviderId, activeModelSlug]);

  const isGeminiProvider = useMemo(() => {
    const combined = `${canonicalOAuthProviderId} ${activeModelSlug} ${providerName}`.toLowerCase();
    return canonicalOAuthProviderId === "google" || combined.includes("gemini") || combined.includes("google");
  }, [canonicalOAuthProviderId, activeModelSlug, providerName]);

  const computedPreviewUrl = useMemo(() => {
    if (oauthRedirectUrl) return oauthRedirectUrl;
    return buildOnboardingOAuthLaunchUrl({
      modelSlug: canonicalOAuthModelId,
      providerId: canonicalOAuthProviderId,
      clientId: oauthClientId.trim(),
      authEndpoint: authUrl.trim() || matchedOAuthStrategy.authUrl,
      redirectUri: redirectUri.trim() || DEFAULT_OAUTH_CALLBACK_URI,
      scopes: oauthScopes.trim() || matchedOAuthStrategy.defaultScopes || "openid profile email",
      userEmail: ownerEmail.trim(),
      stateNonce: oauthStateNonceRef.current || "preview",
      pkce: null,
    });
  }, [
    oauthRedirectUrl,
    canonicalOAuthModelId,
    canonicalOAuthProviderId,
    oauthClientId,
    authUrl,
    matchedOAuthStrategy.authUrl,
    matchedOAuthStrategy.defaultScopes,
    redirectUri,
    oauthScopes,
    ownerEmail,
  ]);

  const handleSelectGoogleCliTool = (tool: "antigravity" | "gemini") => {
    setSelectedGoogleCli(tool);
    setCliExecutable(tool);
    setCliArguments(tool === "gemini" ? "auth login --browser" : "auth login");
  };

  const handleCopyOAuthPreviewUrl = () => {
    if (!computedPreviewUrl || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(computedPreviewUrl);
    setCopiedOAuthUrl(true);
    window.setTimeout(() => setCopiedOAuthUrl(false), 2000);
  };

  const handlePasteAuthCodeInput = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setOauthAuthCodeInput(text.trim());
        setPastedAuthCode(true);
        window.setTimeout(() => setPastedAuthCode(false), 2000);
      }
    } catch {
      // Clipboard permission declined by browser
    }
  };

  const handleVerifyCredentialsDir = async () => {
    setIsVerifyingVcsDir(true);
    try {
      const res = await ApiService.verifyCredentialsDirectory(
        canonicalOAuthModelId,
        ownerEmail.trim() || currentUserEmail,
      );
      if (res?.success && res.vcs) {
        setVcsAuditState({
          directoryPath: res.vcs.directoryPath || "/app/config/data/credentials",
          isGitRepo: res.vcs.isGitRepo,
          commitHash: res.vcs.currentCommitHash || res.diffReport?.gitCommitHash,
          changedFiles: res.diffReport?.changedFiles || res.vcs.recentChangedFiles || [],
        });
        setOauthRedirectNotice({
          tone: "info",
          message: `Credentials directory verified (${res.vcs.totalTrackedFiles} tracked file(s)).`,
        });
      }
    } catch (err: unknown) {
      setOauthRedirectNotice({
        tone: "warning",
        message: err instanceof Error ? err.message : "Unable to verify credentials directory.",
      });
    } finally {
      setIsVerifyingVcsDir(false);
    }
  };

  const handleVerifyAndSaveAuthCode = async (overrideCode?: string) => {
    const code = (overrideCode ?? oauthAuthCodeInput).trim();
    if (!code || !canMutate || isSubmitting) return;
    setIsVerifyingAuthCode(true);
    setAccountValidationMsg(null);
    try {
      const cliSessionRes = await ApiService.fetchLatestCliSession(canonicalOAuthModelId).catch(() => null);
      if (cliSessionRes?.session?.sessionId) {
        await ApiService.submitCliAuthCode({
          sessionId: cliSessionRes.session.sessionId,
          authCode: code,
          modelId: canonicalOAuthModelId,
          userEmail: ownerEmail.trim() || currentUserEmail,
        }).catch(() => null);
      }
      const res = await ApiService.verifyOAuthManual(
        canonicalOAuthModelId,
        code,
        ownerEmail.trim() || currentUserEmail,
      );
      if (!res?.session?.accessToken) {
        throw new Error(res?.message || "Authorization code verification returned no access token.");
      }
      applyOAuthCallbackPayload({
        accessToken: res.session.accessToken,
        authCode: res.session.code || code,
        userEmail: res.session.email,
      });
      if (res.vcs) {
        setVcsAuditState((prev) => ({
          ...prev,
          commitHash: res.vcs?.gitCommitHash || prev.commitHash,
          changedFiles: res.vcs?.changedFiles || prev.changedFiles,
        }));
      }
      setOauthAuthCodeInput("");
    } catch (err: unknown) {
      setOauthRedirectNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "OAuth authorization code exchange failed.",
      });
    } finally {
      setIsVerifyingAuthCode(false);
    }
  };

  useEffect(() => {
    if (!isWaitingOAuthCallback) return;
    let checks = 0;
    const launchTs = oauthLaunchTimestampRef.current;
    const isFreshSession = (session: { timestamp?: number } | null | undefined): boolean =>
      Boolean(session && typeof session.timestamp === "number" && session.timestamp >= launchTs);

    const timer = window.setInterval(async () => {
      checks += 1;
      if (checks > 60) {
        window.clearInterval(timer);
        setIsWaitingOAuthCallback(false);
        return;
      }
      if (oauthPopupRef.current && oauthPopupRef.current.closed) {
        const sessionAfterClose = await ApiService.fetchLatestOAuthCallback(canonicalOAuthModelId);
        window.clearInterval(timer);
        setIsWaitingOAuthCallback(false);
        if (isFreshSession(sessionAfterClose) && (sessionAfterClose?.accessToken || sessionAfterClose?.code)) {
          applyOAuthCallbackPayload(sessionAfterClose);
        } else {
          setOauthRedirectNotice({
            tone: "warning",
            message: "OAuth window closed before authorization completed.",
          });
        }
        return;
      }
      const session = await ApiService.fetchLatestOAuthCallback(canonicalOAuthModelId);
      if (isFreshSession(session) && (session?.accessToken || session?.code)) {
        window.clearInterval(timer);
        applyOAuthCallbackPayload(session);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [isWaitingOAuthCallback, canonicalOAuthModelId]);

  useEffect(() => {
    if (selectedProtocol !== "oauth" || matchedOAuthStrategy.id === "custom") return;
    if (!authUrl.trim()) setAuthUrl(matchedOAuthStrategy.authUrl);
    if (!tokenUrl.trim()) setTokenUrl(matchedOAuthStrategy.tokenUrl);
    if (!oauthScopes.trim()) setOauthScopes(matchedOAuthStrategy.defaultScopes);
    if (!redirectUri.trim()) setRedirectUri(matchedOAuthStrategy.defaultRedirectUri);
    if (!oauthClientId.trim() && matchedOAuthStrategy.defaultClientId) {
      setOauthClientId(matchedOAuthStrategy.defaultClientId);
    }
  }, [selectedProtocol, matchedOAuthStrategy]);

  const handleLaunchOAuthRedirect = async () => {
    if (!canMutate || isSubmitting) return;
    setIsOAuthRedirecting(true);
    setAccountValidationMsg(null);
    setOauthRedirectNotice({
      tone: "info",
      message: "Preparing Google/OAuth 2.0 authorization URL...",
    });

    const stateNonce = generateCryptoNonce();
    oauthStateNonceRef.current = stateNonce;
    oauthLaunchTimestampRef.current = Date.now();
    closeActiveOAuthPopup();

    const popup =
      typeof window !== "undefined"
        ? window.open("about:blank", "modelbox_oauth_popup", "width=640,height=760,scrollbars=yes,resizable=yes")
        : null;
    oauthPopupRef.current = popup;

    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      setIsOAuthRedirecting(false);
      setIsWaitingOAuthCallback(false);
      setOauthRedirectNotice({
        tone: "warning",
        message: "Popup blocked by browser. Allow popups for this site so the OAuth window can open cleanly.",
      });
      return;
    }

    try {
      const pkce = await generatePkceChallenge();
      const resolvedRedirect = redirectUri.trim() || DEFAULT_OAUTH_CALLBACK_URI;
      const explicitClientId = oauthClientId.trim();

      let backendConfig = null;
      if (!explicitClientId || !authUrl.trim()) {
        backendConfig = await ApiService.fetchModelOAuthConfig(
          canonicalOAuthModelId,
          resolvedRedirect,
          explicitClientId || undefined,
        ).catch(() => null);
      }

      const effectiveClientId =
        explicitClientId || backendConfig?.defaultClientId?.trim() || matchedOAuthStrategy.defaultClientId?.trim() || "";
      const effectiveAuthEndpoint =
        authUrl.trim() || backendConfig?.authorizationEndpoint || matchedOAuthStrategy.authUrl || "";
      const effectiveScopes =
        oauthScopes.trim() || backendConfig?.defaultScopes?.join(" ") || matchedOAuthStrategy.defaultScopes || "openid profile email";

      let targetUrl = "";
      if (effectiveClientId && effectiveAuthEndpoint) {
        targetUrl = buildOnboardingOAuthLaunchUrl({
          modelSlug: canonicalOAuthModelId,
          providerId: canonicalOAuthProviderId,
          clientId: effectiveClientId,
          authEndpoint: effectiveAuthEndpoint,
          redirectUri: resolvedRedirect,
          scopes: effectiveScopes,
          userEmail: ownerEmail,
          stateNonce,
          pkce,
        });
      } else {
        let discoveredCliUrl: string | undefined;
        if (canonicalOAuthProviderId === "google") {
          const cliLoginRes = await ApiService.executeCliLogin(canonicalOAuthModelId, {
            provider: "google",
            userEmail: ownerEmail.trim() || currentUserEmail,
            accountCategory: accountCategory || "individual",
            cliTool: isGeminiProvider ? selectedGoogleCli : undefined,
          }).catch(() => null);
          discoveredCliUrl = cliLoginRes?.loginResult?.config?.authorizationUrl || cliLoginRes?.session?.oauthUrl;
        }
        if (!isUsableOAuthRedirectUrl(discoveredCliUrl)) {
          const cliSessionRes = await ApiService.fetchLatestCliSession(canonicalOAuthModelId).catch(() => null);
          discoveredCliUrl = cliSessionRes?.session?.oauthUrl;
        }
        if (isUsableOAuthRedirectUrl(discoveredCliUrl) && !discoveredCliUrl.endsWith("/oauth2callback")) {
          targetUrl = discoveredCliUrl;
        } else if (isUsableOAuthRedirectUrl(backendConfig?.executableLaunchUrl)) {
          targetUrl = backendConfig.executableLaunchUrl;
        } else {
          targetUrl = buildOnboardingOAuthLaunchUrl({
            modelSlug: canonicalOAuthModelId,
            providerId: canonicalOAuthProviderId,
            clientId: "",
            authEndpoint: effectiveAuthEndpoint,
            redirectUri: resolvedRedirect,
            scopes: effectiveScopes,
            userEmail: ownerEmail,
            stateNonce,
            pkce,
          });
        }
      }

      targetUrl = sanitizeOAuthRedirectUrl(targetUrl) || targetUrl;
      setOauthRedirectUrl(targetUrl);
      setIsWaitingOAuthCallback(true);
      popup.location.href = targetUrl;
      setOauthRedirectNotice({
        tone: "info",
        message: "Authorize in the popup window and click 'Close Window' once finished.",
      });
    } catch (err: unknown) {
      closeActiveOAuthPopup();
      setIsWaitingOAuthCallback(false);
      setOauthRedirectNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Failed to initiate OAuth 2.0 popup.",
      });
    } finally {
      setIsOAuthRedirecting(false);
    }
  };

  const resetAccountDraft = () => {
    setEditingAccountId(null);
    setAccountLabel("");
    setOwnerEmail(isEditMode ? currentUserEmail : "");
    setCredentialSecret("");
    setEffortTier("medium");
    setAccountIsActive(true);
    setAccountValidationMsg(null);
    setTestResult(null);
    setOauthRedirectNotice(null);
    setOauthRedirectUrl("");
    setIsWaitingOAuthCallback(false);
  };

  const buildDraftAccountObject = (targetId?: string): StagedIntegrationAccount => {
    const fallbackLabel =
      accountLabel.trim() ||
      `${providerName.trim() || integrationId || "Integration"} - ${selectedProtocol.toUpperCase()} #${stagedAccounts.length + 1}`;
    const resolvedCred =
      selectedProtocol === "oauth"
        ? credentialSecret.trim() || oauthClientId.trim() || "oauth-pkce-configured"
        : selectedProtocol === "cli"
          ? credentialSecret.trim() || cliExecutable.trim() || "cli-session"
          : credentialSecret.trim();

    return {
      accountId: targetId || `staged-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      isPersisted: Boolean(
        targetId && stagedAccounts.find((a) => a.accountId === targetId)?.isPersisted,
      ),
      accountName: fallbackLabel,
      userEmail: ownerEmail.trim() || currentUserEmail,
      authType: selectedProtocol,
      credentialValue: resolvedCred,
      isActive: accountIsActive,
      effortTier,
      config: {
        apiBaseUrl: apiBaseUrl.trim() || undefined,
        apiVersion: apiVersion.trim() || undefined,
        authUrl: authUrl.trim() || undefined,
        tokenUrl: tokenUrl.trim() || undefined,
        oauthClientId: oauthClientId.trim() || undefined,
        oauthClientSecret: oauthClientSecret.trim() || undefined,
        oauthScopes: oauthScopes.trim() || undefined,
        redirectUri: redirectUri.trim() || undefined,
        cliExecutable: (isGeminiProvider && selectedProtocol === "cli" && !cliExecutable.trim()
          ? selectedGoogleCli
          : cliExecutable.trim()) || undefined,
        cliArguments: cliArguments.trim() || undefined,
        cookieDomain: cookieDomain.trim() || undefined,
      },
    };
  };

  const validateAccountDraft = (): string | null => {
    if (!ownerEmail.trim()) return "Owner / Associate Email is required.";
    if (selectedProtocol === "api" && !credentialSecret.trim() && !editingAccountId) {
      return "Enter an API Key / Secret Token before adding this REST API account.";
    }
    if (
      selectedProtocol === "oauth" &&
      (accountCategory || "individual") === "enterprise" &&
      !oauthClientId.trim()
    ) {
      return "OAuth Client ID and Client Secret are mandatory for Enterprise OAuth.";
    }
    if (
      selectedProtocol === "oauth" &&
      (accountCategory || "individual") === "individual" &&
      !credentialSecret.trim() &&
      !oauthAuthCodeInput.trim()
    ) {
      return "Complete Browser Sign-In or paste the Authorization Code to add account.";
    }
    if (selectedProtocol === "cli" && !cliExecutable.trim()) {
      return "Enter a CLI Executable / Command before adding a CLI account.";
    }
    if (selectedProtocol === "cookie" && !credentialSecret.trim() && !editingAccountId) {
      return "Enter a Session Cookie value before adding a Cookie Vault account.";
    }
    return null;
  };

  const handleAddOrUpdateAccount = () => {
    if (!canMutate) return;
    const validationError = validateAccountDraft();
    if (validationError) {
      setAccountValidationMsg(validationError);
      return;
    }

    const nextAccount = buildDraftAccountObject(editingAccountId || undefined);
    setStagedAccounts((prev) => {
      if (editingAccountId) {
        return prev.map((item) => (item.accountId === editingAccountId ? nextAccount : item));
      }
      return [...prev, nextAccount];
    });
    resetAccountDraft();
  };

  const handleLoadAccountIntoDraft = (acc: StagedIntegrationAccount) => {
    setEditingAccountId(acc.accountId);
    setSelectedProtocol(acc.authType);
    setAccountLabel(acc.accountName);
    setOwnerEmail(acc.userEmail);
    setCredentialSecret(acc.credentialValue);
    setAccountIsActive(acc.isActive);
    setEffortTier(acc.effortTier);
    if (acc.config.apiBaseUrl) setApiBaseUrl(acc.config.apiBaseUrl);
    if (acc.config.apiVersion) setApiVersion(acc.config.apiVersion);
    if (acc.config.authUrl) setAuthUrl(acc.config.authUrl);
    if (acc.config.tokenUrl) setTokenUrl(acc.config.tokenUrl);
    if (acc.config.oauthClientId) setOauthClientId(acc.config.oauthClientId);
    if (acc.config.oauthScopes) setOauthScopes(acc.config.oauthScopes);
    if (acc.config.redirectUri) setRedirectUri(acc.config.redirectUri);
    if (acc.config.cliExecutable) setCliExecutable(acc.config.cliExecutable);
    if (acc.config.cliArguments) setCliArguments(acc.config.cliArguments);
    if (acc.config.cookieDomain) setCookieDomain(acc.config.cookieDomain);
    setAccountValidationMsg(null);
  };

  const handleToggleAccountStatus = (accountId: string) => {
    if (!rbac.canUpdate) return;
    setStagedAccounts((prev) =>
      prev.map((item) =>
        item.accountId === accountId ? { ...item, isActive: !item.isActive } : item,
      ),
    );
  };

  const handleRemoveStagedAccount = (acc: StagedIntegrationAccount) => {
    if (!rbac.canDelete) return;
    if (acc.isPersisted) {
      setRemovedAccountIds((prev) => [...prev, acc.accountId]);
    }
    setStagedAccounts((prev) => prev.filter((item) => item.accountId !== acc.accountId));
    if (editingAccountId === acc.accountId) {
      resetAccountDraft();
    }
  };

  const handleTestAccountConnection = async (targetDraft?: StagedIntegrationAccount) => {
    const modelSlug = (integrationId || slugify(providerName) || "custom-provider")
      .trim()
      .toLowerCase();
    const acc = targetDraft || buildDraftAccountObject();
    setIsTestingConnection(true);
    setTestResult(null);
    setAccountValidationMsg(null);
    try {
      const result = await ApiService.testModelConnection({
        modelId: modelSlug,
        authType: acc.authType,
        credentialValue: acc.credentialValue || "probe-connection",
        effortTier: acc.effortTier,
        config: {
          apiBaseUrl: acc.config.apiBaseUrl,
          apiVersion: acc.config.apiVersion,
          cliExecutable: acc.config.cliExecutable,
          cliArguments: acc.config.cliArguments,
          cookieDomain: acc.config.cookieDomain,
          oauthClientId: acc.config.oauthClientId,
          oauthTokenUrl: acc.config.tokenUrl,
          oauthScopes: acc.config.oauthScopes,
        },
      });
      setTestResult(result);
    } catch (err: unknown) {
      setAccountValidationMsg(
        err instanceof Error ? err.message : "Failed to verify protocol connection.",
      );
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutate) return;

    if (!providerName.trim()) {
      setLocalError("Provider Display Name is required in Identity & Metadata.");
      setActiveTab("identity");
      return;
    }

    const resolvedId = (integrationId || slugify(providerName)).trim().toLowerCase();
    let finalAccounts = [...stagedAccounts];
    if (
      validateAccountDraft() === null &&
      (accountLabel.trim() ||
        credentialSecret.trim() ||
        oauthClientId.trim() ||
        cliExecutable.trim())
    ) {
      const draftAcc = buildDraftAccountObject(editingAccountId || undefined);
      if (editingAccountId) {
        finalAccounts = finalAccounts.map((item) =>
          item.accountId === editingAccountId ? draftAcc : item,
        );
      } else if (finalAccounts.length === 0) {
        finalAccounts.push(draftAcc);
      }
    }

    const submittedProtocols = Array.from(
      new Set<StrategyMode>(
        finalAccounts.length > 0
          ? [...derivedProtocols, ...finalAccounts.map((a) => a.authType)]
          : derivedProtocols.length > 0
            ? derivedProtocols
            : [selectedProtocol],
      ),
    );

    await onSubmit(
      {
        integrationId: resolvedId,
        providerName: providerName.trim(),
        providerShortCode: (providerShortCode || providerName.slice(0, 2)).trim().toUpperCase(),
        category: category || INTEGRATION_CATEGORIES[0],
        description: description.trim(),
        accountCategory: accountCategory || "enterprise",
        lifecycleStatus: lifecycleStatus || "ACTIVE",
        supportedProtocols: submittedProtocols,
        capabilities,
        apiBaseUrl: apiBaseUrl.trim(),
        authUrl: authUrl.trim(),
        tokenUrl: tokenUrl.trim(),
        cliCommand: cliExecutable.trim(),
        docsUrl: docsUrl.trim(),
      },
      finalAccounts,
      removedAccountIds,
    );
  };

  useEffect(() => {
    if (selectedProtocol === "cli" && isGeminiProvider && !cliExecutable.trim()) {
      setCliExecutable(selectedGoogleCli);
      setCliArguments(selectedGoogleCli === "gemini" ? "auth login --browser" : "auth login");
    }
  }, [selectedProtocol, isGeminiProvider, selectedGoogleCli, cliExecutable]);

  const displayError = localError || errorMessage;

  const renderGeminiCliToolSelector = () => (
    <div className="onb-cli-tool-box" data-testid="onb-cli-tool-selector">
      <div className="cli-tool-copy">
        <strong>Select CLI Execution Tool:</strong>
        <span>Choose binary used to capture OAuth PKCE session</span>
      </div>
      <div className="cli-tool-options" role="group" aria-label="Select CLI Execution Tool">
        <button
          type="button"
          className={`cli-tool-option-btn ${selectedGoogleCli === "antigravity" ? "active" : ""}`}
          disabled={!canMutate || isSubmitting}
          onClick={() => handleSelectGoogleCliTool("antigravity")}
          data-testid="btn-cli-tool-antigravity"
        >
          <span>⚡</span>
          <span>Antigravity CLI (Default)</span>
        </button>
        <button
          type="button"
          className={`cli-tool-option-btn ${selectedGoogleCli === "gemini" ? "active" : ""}`}
          disabled={!canMutate || isSubmitting}
          onClick={() => handleSelectGoogleCliTool("gemini")}
          data-testid="btn-cli-tool-gemini"
        >
          <span>✦</span>
          <span>Gemini CLI</span>
        </button>
      </div>
    </div>
  );

  const renderBrowserConsentAndAuthCodeBox = () => {
    const cliLabel = isGeminiProvider ? selectedGoogleCli : cliExecutable.trim() || matchedOAuthStrategy.cliCommand || canonicalOAuthProviderId;
    return (
      <div className="d-flex flex-column gap-3 pt-2 border-top">
        <div className="onb-computed-url-box">
          <div className="url-header-row">
            <span className="url-title">Computed Redirect Authorization URL</span>
            <span className="url-endpoint-hint">Endpoint: {authUrl.trim() || matchedOAuthStrategy.authUrl}</span>
          </div>
          <div className="url-preview-row">
            <input
              type="text"
              className="form-control url-preview-input"
              readOnly
              value={computedPreviewUrl}
              data-testid="onb-computed-oauth-url"
            />
            <button
              type="button"
              className="btn btn-outline theme-secondary btn-sm flex-shrink-0"
              onClick={handleCopyOAuthPreviewUrl}
              data-testid="btn-copy-oauth-url"
            >
              {copiedOAuthUrl ? "✔ Copied!" : "📋 Copy"}
            </button>
          </div>
        </div>

        <div className="onb-vcs-audit-bar" data-testid="onb-vcs-audit-bar">
          <div className="vcs-bar-top">
            <div className="vcs-meta-group">
              <span className="vcs-lead-icon">📁</span>
              <code className="vcs-dir-code">{vcsAuditState.directoryPath}</code>
              <span className="vcs-sep-bullet">•</span>
              <span className="badge badge-subtle theme-info">
                {vcsAuditState.isGitRepo ? "Git Tracking Active (In-Container)" : "Snapshot VCS"}
              </span>
              {vcsAuditState.commitHash && (
                <>
                  <span className="vcs-sep-bullet">•</span>
                  <span className="badge badge-subtle theme-secondary">commit: {vcsAuditState.commitHash.slice(0, 7)}</span>
                </>
              )}
            </div>
            <button
              type="button"
              className="btn btn-outline theme-secondary btn-xs"
              disabled={isVerifyingVcsDir || isSubmitting}
              onClick={() => void handleVerifyCredentialsDir()}
              data-testid="btn-verify-vcs-dir"
            >
              {isVerifyingVcsDir ? "Verifying..." : "🔄 Verify Directory & Diff"}
            </button>
          </div>
          {vcsAuditState.changedFiles.length > 0 && (
            <div className="vcs-changed-files">
              <span>Changed files:</span>
              {vcsAuditState.changedFiles.map((file) => (
                <code key={file}>{file}</code>
              ))}
            </div>
          )}
        </div>

        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-solid theme-primary btn-sm"
              disabled={!canMutate || isSubmitting || isOAuthRedirecting}
              onClick={() => void handleLaunchOAuthRedirect()}
              title={`Launch browser OAuth consent flow for ${cliLabel}`}
              data-testid="btn-oauth-redirect"
            >
              {renderProtocolSymbol("oauth", 14)}
              <span>
                {isOAuthRedirecting ? "Opening Browser..." : "Browser Sign-In"}
              </span>
            </button>
            {oauthRedirectUrl && isWaitingOAuthCallback && (
              <button
                type="button"
                className="btn btn-outline theme-secondary btn-sm"
                onClick={() => void handleLaunchOAuthRedirect()}
                data-testid="link-oauth-redirect-url"
              >
                Re-open OAuth Popup
              </button>
            )}
          </div>
          <span className="small text-secondary">
            {credentialSecret ? "OAuth credential ready" : "Redirects via OAuth portal & captures callback"}
          </span>
        </div>

        {oauthRedirectNotice && (
          <div className={`alert-banner ${oauthRedirectNotice.tone} py-2 px-3`} data-testid="oauth-redirect-status">
            <span className="alert-icon">
              {oauthRedirectNotice.tone === "success" ? <SymbolCheck size={14} /> : <SymbolAlert size={14} />}
            </span>
            <span className="alert-text">{oauthRedirectNotice.message}</span>
          </div>
        )}

        <div className="onb-authcode-box" data-testid="onb-authcode-box">
          <div className="authcode-header-row">
            <div>
              <div className="authcode-title">🔑 Authenticate Code from Browser</div>
              <p className="authcode-subtitle">
                Paste the authorization code generated from the browser consent portal to verify and capture the session token.
              </p>
            </div>
            <StatusBadge
              label={oauthAuthCodeInput.trim() ? "✔ Code Captured" : "Awaiting Code"}
              tone={oauthAuthCodeInput.trim() ? "success" : "info"}
            />
          </div>

          <div className="authcode-input-row">
            <input
              id="onb-auth-code"
              type="text"
              className="form-control"
              disabled={!canMutate || isSubmitting}
              placeholder="Paste authorization code from browser (e.g. 4/0AUn6...)"
              value={oauthAuthCodeInput}
              onChange={(e) => setOauthAuthCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && oauthAuthCodeInput.trim() && !isVerifyingAuthCode) {
                  e.preventDefault();
                  void handleVerifyAndSaveAuthCode();
                }
              }}
              spellCheck={false}
              autoComplete="off"
              data-testid="input-oauth-code"
            />
            {oauthAuthCodeInput && (
              <button
                type="button"
                className="btn btn-outline theme-secondary btn-sm flex-shrink-0"
                onClick={() => setOauthAuthCodeInput("")}
                title="Clear authorization code"
              >
                ✕
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline theme-secondary btn-sm flex-shrink-0"
              disabled={!canMutate || isSubmitting}
              onClick={() => void handlePasteAuthCodeInput()}
              data-testid="btn-paste-authcode"
            >
              {pastedAuthCode ? "✔ Pasted" : "📋 Paste"}
            </button>
          </div>

          <div className="authcode-footer-row">
            <span className="small text-secondary">
              {oauthAuthCodeInput.trim()
                ? `${oauthAuthCodeInput.trim().length} characters ready`
                : "Tip: Paste the authorization code or press Enter to verify."}
            </span>
            <button
              type="button"
              className="btn btn-solid theme-primary btn-sm"
              disabled={!canMutate || isSubmitting || !oauthAuthCodeInput.trim() || isVerifyingAuthCode}
              onClick={() => void handleVerifyAndSaveAuthCode()}
              data-testid="btn-verify-authcode"
            >
              <SymbolCheck size={14} />
              <span>{isVerifyingAuthCode ? "Verifying & Saving..." : "Verify & Save Auth Code"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="integration-onboarding-page container-fluid px-0"
      data-testid="integration-onboarding-page"
    >
      {/* Top Bar */}
      <div className="onboarding-topbar" data-testid="create-banner">
        <div className="onboarding-title-group">
          <div className="onboarding-heading-row">
            <button
              type="button"
              className="btn-back-arrow breadcrumb-link"
              onClick={onCancel}
              title="Back to Integration Hub"
              aria-label="Back to Integration Hub"
            >
              <SymbolArrowLeft size={16} />
            </button>
            <h1>
              {isEditMode
                ? `Edit Integration: ${initialIntegration?.providerName}`
                : "Onboard New Integration"}
            </h1>
            <StatusBadge
              label={isEditMode ? "Multi-Account Edit" : "Multi-Account Onboarding"}
              tone="info"
            />
          </div>
          <p>
            Configure provider identity, multi-protocol authentication, and service accounts.
          </p>
        </div>

        <div className="onboarding-topbar-actions">
          <button
            type="button"
            className="btn btn-outline theme-secondary btn-sm"
            onClick={onCancel}
            data-testid="btn-discard"
          >
            <SymbolArrowLeft size={14} />
            <span>Back to Hub</span>
          </button>
        </div>
      </div>

      {/* Onboarding Section Tabs */}
      <div className="onboarding-governance-card">
        <div className="onboarding-tabs-shell">
          <ul className="nav nav-underline" role="tablist" aria-label="Integration onboarding sections">
            <li className="nav-item" role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "identity"}
                className={`nav-link ${activeTab === "identity" ? "active" : ""}`}
                onClick={() => setActiveTab("identity")}
                data-testid="tab-onboard-identity"
              >
                <SymbolBuilding size={16} />
                <span>1. Identity & Metadata</span>
              </button>
            </li>

            <li className="nav-item" role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "protocols"}
                className={`nav-link ${activeTab === "protocols" ? "active" : ""}`}
                onClick={() => setActiveTab("protocols")}
                data-testid="tab-onboard-protocols"
              >
                <SymbolUsers size={16} />
                <span>2. Protocols & Accounts</span>
                <span className="tab-count-pill">{stagedAccounts.length}</span>
              </button>
            </li>

            <li className="nav-item" role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "capabilities"}
                className={`nav-link ${activeTab === "capabilities" ? "active" : ""}`}
                onClick={() => setActiveTab("capabilities")}
                data-testid="tab-onboard-capabilities"
              >
                <SymbolLayers size={16} />
                <span>3. Capabilities & Review</span>
                <span className="tab-count-pill">{capabilities.length}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      {!canMutate && (
        <div className="alert-banner warning" data-testid="rbac-denied-banner">
          <span className="alert-icon">
            <SymbolLockVault size={16} />
          </span>
          <span className="alert-text">
            RBAC Policy Restriction: Role <strong>{rbac.roleName}</strong> lacks{" "}
            <code>{isEditMode ? "integrations:update" : "integrations:create"}</code> permission.
            Fields are locked in Read-Only mode.
          </span>
        </div>
      )}

      {displayError && (
        <div className="alert-banner error">
          <span className="alert-icon">
            <SymbolAlert size={16} />
          </span>
          <span className="alert-text">{displayError}</span>
        </div>
      )}

      <form className="d-flex flex-column gap-4" onSubmit={(e) => void handleFormSubmit(e)}>
        {/* TAB 1: Identity & Metadata (Bootstrap 6 Colon Grid + Card) */}
        {activeTab === "identity" && (
          <section className="card" data-testid="panel-onboard-identity">
            <div className="card-header">
              <div className="onboarding-card-header-row">
                <div className="onboarding-card-title-cluster">
                  <span className="symbol-well tone-primary" style={{ width: 32, height: 32 }}>
                    <SymbolBuilding size={16} />
                  </span>
                  <div>
                    <h2 className="h6 mb-0 fw-bold">Provider Identity & Classification</h2>
                    <div className="small text-secondary">
                      Define canonical provider slug, category, tenant scope, and documentation.
                    </div>
                  </div>
                </div>
                {lifecycleStatus && (
                  <StatusBadge
                    label={lifecycleStatus}
                    tone={lifecycleStatus === "ACTIVE" ? "success" : "warning"}
                  />
                )}
              </div>
            </div>

            <div className="card-body p-4">
              <div className="row g-4">
                <div className="col-12 md:col-6">
                  <label className="form-label" htmlFor="onb-provider-name">
                    Provider Display Name *
                  </label>
                  <input
                    id="onb-provider-name"
                    type="text"
                    className="form-control"
                    disabled={!canMutate || isSubmitting}
                    placeholder="e.g. Mistral AI Enterprise"
                    value={providerName}
                    onChange={(e) => handleProviderNameChange(e.target.value)}
                  />
                </div>

                <div className="col-12 md:col-6">
                  <label className="form-label" htmlFor="onb-integration-id">
                    Integration ID (Slug) *
                  </label>
                  <input
                    id="onb-integration-id"
                    type="text"
                    className="form-control"
                    disabled={isEditMode || !canMutate || isSubmitting}
                    placeholder="e.g. mistral-enterprise"
                    value={integrationId}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setIntegrationId(e.target.value);
                    }}
                  />
                </div>

                <div className="col-12 sm:col-6 lg:col-3">
                  <label className="form-label" htmlFor="onb-short-code">
                    Monogram / Short Code
                  </label>
                  <input
                    id="onb-short-code"
                    type="text"
                    maxLength={4}
                    className="form-control"
                    disabled={!canMutate || isSubmitting}
                    placeholder="e.g. MS"
                    value={providerShortCode}
                    onChange={(e) => setProviderShortCode(e.target.value.toUpperCase())}
                  />
                </div>

                <div className="col-12 sm:col-6 lg:col-3">
                  <label className="form-label" htmlFor="onb-category">
                    Integration Category
                  </label>
                  <select
                    id="onb-category"
                    className="form-select"
                    disabled={!canMutate || isSubmitting}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Select category...</option>
                    {INTEGRATION_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12 sm:col-6 lg:col-3">
                  <label className="form-label" htmlFor="onb-scope">
                    Tenant Scope
                  </label>
                  <select
                    id="onb-scope"
                    className="form-select"
                    disabled={!canMutate || isSubmitting}
                    value={accountCategory}
                    onChange={(e) =>
                      setAccountCategory(
                        e.target.value === "individual"
                          ? "individual"
                          : e.target.value === "enterprise"
                            ? "enterprise"
                            : "",
                      )
                    }
                  >
                    <option value="">Select scope...</option>
                    <option value="enterprise">Enterprise / Shared</option>
                    <option value="individual">Individual Workspace</option>
                  </select>
                </div>

                <div className="col-12 sm:col-6 lg:col-3">
                  <label className="form-label" htmlFor="onb-status">
                    Lifecycle Status
                  </label>
                  <select
                    id="onb-status"
                    aria-label="Lifecycle Status"
                    className="form-select"
                    disabled={!canMutate || isSubmitting}
                    value={lifecycleStatus}
                    onChange={(e) =>
                      setLifecycleStatus(
                        (e.target.value as "" | "ACTIVE" | "DRAFT" | "INACTIVE") || "",
                      )
                    }
                  >
                    <option value="">Select status...</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>

                <div className="col-12 md:col-6">
                  <label className="form-label" htmlFor="onb-docs-url">
                    Documentation URL
                  </label>
                  <input
                    id="onb-docs-url"
                    type="url"
                    className="form-control"
                    disabled={!canMutate || isSubmitting}
                    placeholder="https://docs.provider.com"
                    value={docsUrl}
                    onChange={(e) => setDocsUrl(e.target.value)}
                  />
                </div>

                <div className="col-12 md:col-6">
                  <label className="form-label" htmlFor="onb-description">
                    Description
                  </label>
                  <input
                    id="onb-description"
                    type="text"
                    className="form-control"
                    disabled={!canMutate || isSubmitting}
                    placeholder="Describe models, APIs, or tools exposed by this integration..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 2: Protocols & Multi-Account Studio (2-Column Bootstrap 6 xl:col-7 + xl:col-5) */}
        {activeTab === "protocols" && (
          <section className="onboarding-studio-panel" data-testid="panel-onboard-protocols">
            <div className="row g-4">
              {/* Left Column: Protocol Configuration Engine */}
              <div className="col-12 lg:col-7" style={{ minWidth: 0 }}>
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <span className="fw-bold d-flex align-items-center gap-2">
                      <span className="symbol-well tone-primary" style={{ width: 30, height: 30 }}>
                        <SymbolBolt size={15} />
                      </span>
                      <span>Protocol Configuration Engine</span>
                    </span>
                    {editingAccountId && (
                      <span className="badge theme-warning badge-subtle">Editing Account</span>
                    )}
                  </div>

                  <div className="card-body p-5 d-flex flex-column gap-4">
                    <div className="protocol-selector-tabs">
                      {PROTOCOL_META.map((proto) => (
                        <button
                          key={proto.id}
                          type="button"
                          disabled={isSubmitting}
                          className={`protocol-tab-btn ${selectedProtocol === proto.id ? "active" : ""}`}
                          onClick={() => {
                            setSelectedProtocol(proto.id);
                            setAccountValidationMsg(null);
                            setOauthRedirectNotice(null);
                          }}
                        >
                          <span className="tab-icon">{renderProtocolSymbol(proto.id, 18)}</span>
                          <span className="tab-label">{proto.label}</span>
                          <span className="tab-hint">{proto.hint}</span>
                        </button>
                      ))}
                    </div>

                    <div className="row g-3">
                      <div className="col-12 md:col-6">
                        <label className="form-label" htmlFor="acc-label">
                          Configuration / Account Label *
                        </label>
                        <input
                          id="acc-label"
                          type="text"
                          className="form-control"
                          disabled={!canMutate || isSubmitting}
                          placeholder="e.g. Enterprise Production Key"
                          value={accountLabel}
                          onChange={(e) => setAccountLabel(e.target.value)}
                        />
                      </div>
                      <div className="col-12 md:col-6">
                        <label className="form-label" htmlFor="acc-owner-email">
                          Owner / Associate Email *
                        </label>
                        <input
                          id="acc-owner-email"
                          type="email"
                          className="form-control"
                          disabled={!canMutate || isSubmitting}
                          placeholder="admin@model-connector.local"
                          value={ownerEmail}
                          onChange={(e) => setOwnerEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="protocol-callout d-flex flex-column gap-3">
                      {selectedProtocol === "api" && (
                        <>
                          <div className="d-flex align-items-center gap-2 fw-semibold small">
                            {renderProtocolSymbol("api", 15)}
                            <span>Direct REST API Key Authentication</span>
                          </div>
                          <div>
                            <label className="form-label" htmlFor="acc-api-key">
                              API Key / Secret Token
                            </label>
                            <div className="input-group">
                              <input
                                id="acc-api-key"
                                type={showSecret ? "text" : "password"}
                                className="form-control"
                                disabled={!canMutate || isSubmitting}
                                placeholder="Enter runtime API key or bearer token"
                                value={credentialSecret}
                                onChange={(e) => setCredentialSecret(e.target.value)}
                              />
                              <button
                                type="button"
                                className="btn btn-outline theme-secondary"
                                onClick={() => setShowSecret((prev) => !prev)}
                              >
                                {showSecret ? "Hide" : "Show"}
                              </button>
                            </div>
                          </div>
                          <div className="row g-3">
                            <div className="col-12 md:col-8">
                              <label className="form-label" htmlFor="onb-api-url">
                                Base Endpoint URL
                              </label>
                              <input
                                id="onb-api-url"
                                type="url"
                                className="form-control"
                                disabled={!canMutate || isSubmitting}
                                placeholder="https://api.provider.com/v1"
                                value={apiBaseUrl}
                                onChange={(e) => setApiBaseUrl(e.target.value)}
                              />
                            </div>
                            <div className="col-12 md:col-4">
                              <label className="form-label" htmlFor="onb-api-ver">
                                API Version Tag
                              </label>
                              <input
                                id="onb-api-ver"
                                type="text"
                                className="form-control"
                                disabled={!canMutate || isSubmitting}
                                placeholder="v1"
                                value={apiVersion}
                                onChange={(e) => setApiVersion(e.target.value)}
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {selectedProtocol === "oauth" && (
                        <>
                          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                            <div className="d-flex align-items-center gap-2 fw-semibold small">
                              {renderProtocolSymbol("oauth", 15)}
                              <span>OAuth 2.0 Redirect &amp; Account Authentication Mode</span>
                            </div>
                            <span className="badge badge-subtle theme-info">CLI &amp; OAuth 2.0 PKCE</span>
                          </div>

                          <div className="onb-auth-mode-grid" role="group" aria-label="Account Authentication Mode">
                            <button
                              type="button"
                              disabled={!canMutate || isSubmitting}
                              className={`onb-auth-mode-card ${(accountCategory || "individual") === "individual" ? "active" : ""}`}
                              onClick={() => setAccountCategory("individual")}
                              data-testid="btn-mode-individual"
                            >
                              <div className="mode-card-title">
                                <span>👤</span>
                                <span>Individual Account (CLI)</span>
                              </div>
                              <div className="mode-card-desc">
                                Personal account bearer authentication. No cloud project registration required.
                              </div>
                            </button>
                            <button
                              type="button"
                              disabled={!canMutate || isSubmitting}
                              className={`onb-auth-mode-card ${accountCategory === "enterprise" ? "active" : ""}`}
                              onClick={() => setAccountCategory("enterprise")}
                              data-testid="btn-mode-enterprise"
                            >
                              <div className="mode-card-title">
                                <span>🏢</span>
                                <span>Enterprise Project (OAuth Web)</span>
                              </div>
                              <div className="mode-card-desc">
                                Corporate consent flow with registered Client ID and Redirect URI.
                              </div>
                            </button>
                          </div>

                          {(isGeminiProvider || !providerName.trim()) &&
                            (accountCategory || "individual") === "individual" &&
                            renderGeminiCliToolSelector()}

                          {(accountCategory || "individual") === "enterprise" && (
                            <div className="row g-3">
                              <div className="col-12 md:col-6">
                                <label className="form-label" htmlFor="onb-oauth-client-id">
                                  OAuth Client ID <span className="text-danger">*</span>
                                </label>
                                <input
                                  id="onb-oauth-client-id"
                                  type="text"
                                  className="form-control"
                                  disabled={!canMutate || isSubmitting}
                                  placeholder="client_id_..."
                                  value={oauthClientId}
                                  onChange={(e) => setOauthClientId(e.target.value)}
                                  required
                                />
                              </div>
                              <div className="col-12 md:col-6">
                                <label className="form-label" htmlFor="onb-oauth-client-secret">
                                  OAuth Client Secret <span className="text-danger">*</span>
                                </label>
                                <input
                                  id="onb-oauth-client-secret"
                                  type="password"
                                  className="form-control"
                                  disabled={!canMutate || isSubmitting}
                                  placeholder="Optional client secret"
                                  value={oauthClientSecret}
                                  onChange={(e) => setOauthClientSecret(e.target.value)}
                                  required
                                />
                              </div>
                              <div className="col-12 md:col-6">
                                <label className="form-label" htmlFor="onb-auth-url">
                                  Authorization Endpoint URL
                                </label>
                                <input
                                  id="onb-auth-url"
                                  type="url"
                                  className="form-control"
                                  disabled={!canMutate || isSubmitting}
                                  placeholder="https://auth.provider.com/oauth/authorize"
                                  value={authUrl}
                                  onChange={(e) => setAuthUrl(e.target.value)}
                                />
                              </div>
                              <div className="col-12 md:col-6">
                                <label className="form-label" htmlFor="onb-token-url">
                                  Token Endpoint URL
                                </label>
                                <input
                                  id="onb-token-url"
                                  type="url"
                                  className="form-control"
                                  disabled={!canMutate || isSubmitting}
                                  placeholder="https://auth.provider.com/oauth/token"
                                  value={tokenUrl}
                                  onChange={(e) => setTokenUrl(e.target.value)}
                                />
                              </div>
                              <div className="col-12 md:col-6">
                                <label className="form-label" htmlFor="onb-oauth-scopes">
                                  OAuth Scopes
                                </label>
                                <input
                                  id="onb-oauth-scopes"
                                  type="text"
                                  className="form-control"
                                  disabled={!canMutate || isSubmitting}
                                  placeholder="e.g. openid profile email"
                                  value={oauthScopes}
                                  onChange={(e) => setOauthScopes(e.target.value)}
                                />
                              </div>
                              <div className="col-12 md:col-6">
                                <label className="form-label" htmlFor="onb-redirect-uri">
                                  Callback Redirect URI
                                </label>
                                <input
                                  id="onb-redirect-uri"
                                  type="url"
                                  className="form-control"
                                  disabled={!canMutate || isSubmitting}
                                  placeholder="http://localhost:8085/oauth2callback"
                                  value={redirectUri}
                                  onChange={(e) => setRedirectUri(e.target.value)}
                                />
                              </div>
                            </div>
                          )}

                          {renderBrowserConsentAndAuthCodeBox()}
                        </>
                      )}

                      {selectedProtocol === "cli" && (
                        <>
                          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                            <div className="d-flex align-items-center gap-2 fw-semibold small">
                              {renderProtocolSymbol("cli", 15)}
                              <span>Host CLI Binary Authentication</span>
                            </div>
                            <span className="badge badge-subtle theme-info">CLI &amp; OAuth 2.0 PKCE</span>
                          </div>

                          {(isGeminiProvider || !providerName.trim()) && renderGeminiCliToolSelector()}

                          <div className="row g-3">
                            <div className="col-12 md:col-6">
                              <label className="form-label" htmlFor="onb-cli-cmd">
                                CLI Executable / Command
                              </label>
                              <input
                                id="onb-cli-cmd"
                                type="text"
                                className="form-control"
                                disabled={!canMutate || isSubmitting}
                                placeholder={isGeminiProvider ? selectedGoogleCli : "e.g. mistral-cli"}
                                value={cliExecutable}
                                onChange={(e) => setCliExecutable(e.target.value)}
                              />
                            </div>
                            <div className="col-12 md:col-6">
                              <label className="form-label" htmlFor="onb-cli-args">
                                CLI Auth Arguments
                              </label>
                              <input
                                id="onb-cli-args"
                                type="text"
                                className="form-control"
                                disabled={!canMutate || isSubmitting}
                                placeholder="auth login"
                                value={cliArguments}
                                onChange={(e) => setCliArguments(e.target.value)}
                              />
                            </div>
                            <div className="col-12">
                              <label className="form-label" htmlFor="onb-cli-token">
                                CLI Session / Token Override (Optional)
                              </label>
                              <input
                                id="onb-cli-token"
                                type="password"
                                className="form-control"
                                disabled={!canMutate || isSubmitting}
                                placeholder="Leave blank to use CLI host keyring or capture via Browser Sign-In below"
                                value={credentialSecret}
                                onChange={(e) => setCredentialSecret(e.target.value)}
                              />
                            </div>
                          </div>

                          {(isGeminiProvider || !providerName.trim()) && renderBrowserConsentAndAuthCodeBox()}
                        </>
                      )}

                      {selectedProtocol === "cookie" && (
                        <>
                          <div className="d-flex align-items-center gap-2 fw-semibold small">
                            {renderProtocolSymbol("cookie", 15)}
                            <span>Encrypted Cookie Vault Session</span>
                          </div>
                          <div className="row g-3">
                            <div className="col-12 md:col-7">
                              <label className="form-label" htmlFor="onb-cookie-val">
                                Session Cookie String / Header
                              </label>
                              <input
                                id="onb-cookie-val"
                                type="password"
                                className="form-control"
                                disabled={!canMutate || isSubmitting}
                                placeholder="session_id=...; __Secure-token=..."
                                value={credentialSecret}
                                onChange={(e) => setCredentialSecret(e.target.value)}
                              />
                            </div>
                            <div className="col-12 md:col-5">
                              <label className="form-label" htmlFor="onb-cookie-domain">
                                Cookie Domain Origin
                              </label>
                              <input
                                id="onb-cookie-domain"
                                type="text"
                                className="form-control"
                                disabled={!canMutate || isSubmitting}
                                placeholder="e.g. .provider.com"
                                value={cookieDomain}
                                onChange={(e) => setCookieDomain(e.target.value)}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Effort Tier + 2026 Bootstrap 6 Native Pill Switch */}
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 pt-1">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span className="small fw-semibold">Reasoning Effort:</span>
                        <div className="effort-segmented-group" role="group" aria-label="Reasoning effort">
                          {(["low", "medium", "high"] as const).map((tier) => (
                            <button
                              key={tier}
                              type="button"
                              disabled={!canMutate}
                              className={`effort-pill-btn ${effortTier === tier ? "active" : ""}`}
                              onClick={() => setEffortTier(tier)}
                            >
                              {tier.charAt(0).toUpperCase() + tier.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="d-inline-flex align-items-center gap-2">
                        <span className="small fw-semibold">Account Active:</span>
                        <div className="onb-yesno-group" role="group" aria-label="Account Active">
                          <button
                            type="button"
                            className={`onb-yesno-btn ${accountIsActive ? "active-yes" : ""}`}
                            disabled={!canMutate}
                            aria-pressed={accountIsActive}
                            onClick={() => setAccountIsActive(true)}
                            data-testid="btn-account-active-yes"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className={`onb-yesno-btn ${!accountIsActive ? "active-no" : ""}`}
                            disabled={!canMutate}
                            aria-pressed={!accountIsActive}
                            onClick={() => setAccountIsActive(false)}
                            data-testid="btn-account-active-no"
                          >
                            No
                          </button>
                        </div>
                      </div>
                    </div>

                    {accountValidationMsg && (
                      <div className="alert-banner error py-2 px-3">
                        <span className="alert-icon">
                          <SymbolAlert size={15} />
                        </span>
                        <span className="alert-text">{accountValidationMsg}</span>
                      </div>
                    )}

                    {testResult && (
                      <div
                        className={`alert-banner ${testResult.status === "VERIFIED" ? "success" : "warning"} py-2 px-3`}
                      >
                        <span className="alert-icon">
                          {testResult.status === "VERIFIED" ? (
                            <SymbolCheck size={15} />
                          ) : (
                            <SymbolAlert size={15} />
                          )}
                        </span>
                        <span className="alert-text">
                          <strong>{testResult.status}</strong> ({testResult.protocol.toUpperCase()}) ·{" "}
                          {testResult.message} ({testResult.latencyMs}ms)
                        </span>
                      </div>
                    )}

                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 pt-3 border-top">
                      <div className="d-flex gap-2 flex-wrap">
                        <button
                          type="button"
                          className="btn btn-outline theme-secondary btn-sm"
                          disabled={!canMutate || isTestingConnection}
                          onClick={() => void handleTestAccountConnection()}
                        >
                          <SymbolBolt size={14} />
                          <span>{isTestingConnection ? "Testing..." : "Test Connection"}</span>
                        </button>
                        {editingAccountId && (
                          <button
                            type="button"
                            className="btn btn-subtle btn-sm"
                            onClick={resetAccountDraft}
                          >
                            Cancel Edit
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn btn-solid theme-primary btn-sm"
                        disabled={!canMutate || isSubmitting}
                        onClick={handleAddOrUpdateAccount}
                        data-testid="btn-add-staged-account"
                      >
                        {editingAccountId ? <SymbolCheck size={14} /> : <SymbolPlus size={14} />}
                        <span>
                          {editingAccountId ? "Update Account" : "Add Account"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Configured Accounts (2026 Bootstrap 6 Table & Card Views) */}
              <div className="col-12 lg:col-5" style={{ minWidth: 0 }}>
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <span className="fw-bold d-flex align-items-center gap-2">
                      <span className="symbol-well tone-success" style={{ width: 30, height: 30 }}>
                        <SymbolUsers size={15} />
                      </span>
                      <span>Configured Accounts</span>
                    </span>

                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <div className="btn-group btn-group-sm" role="group" aria-label="Account filter">
                        <button
                          type="button"
                          className={`btn btn-sm ${accountScopeFilter === "all" ? "btn-solid theme-primary" : "btn-outline theme-secondary"}`}
                          onClick={() => setAccountScopeFilter("all")}
                        >
                          All ({stagedAccounts.length})
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${accountScopeFilter === "active" ? "btn-solid theme-primary" : "btn-outline theme-secondary"}`}
                          onClick={() => setAccountScopeFilter("active")}
                        >
                          Active ({activeAccountsCount})
                        </button>
                      </div>

                      <div className="btn-group btn-group-sm" role="group" aria-label="Account view">
                        <button
                          type="button"
                          className={`btn btn-sm ${accountsViewMode === "list" ? "btn-solid theme-primary" : "btn-outline theme-secondary"}`}
                          onClick={() => setAccountsViewMode("list")}
                          title="Table View"
                          aria-label="Table View"
                        >
                          <SymbolList size={14} />
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${accountsViewMode === "card" ? "btn-solid theme-primary" : "btn-outline theme-secondary"}`}
                          onClick={() => setAccountsViewMode("card")}
                          title="Card View"
                          aria-label="Card View"
                        >
                          <SymbolGrid size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="card-body p-4">
                    {displayedAccounts.length === 0 ? (
                      <div className="text-center py-6 px-3 text-secondary">
                        <div className="symbol-well tone-info mx-auto mb-3">
                          <SymbolUsers size={20} />
                        </div>
                        <p className="fw-semibold mb-1 text-body">No accounts in pool yet</p>
                        <p className="small mb-0">
                          Configure credentials on the left and click{" "}
                          <strong>Add Account</strong> to register multiple accounts.
                        </p>
                      </div>
                    ) : accountsViewMode === "list" ? (
                      <div className="table-responsive">
                        <table className="table table-hover table-sm align-middle mb-0">
                          <thead>
                            <tr>
                              <th>Account</th>
                              <th>Protocol</th>
                              <th>Active</th>
                              <th className="text-end">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayedAccounts.map((acc) => (
                              <tr key={acc.accountId}>
                                <td>
                                  <div className="fw-semibold small">{acc.accountName}</div>
                                  <div className="small text-secondary">{acc.userEmail}</div>
                                </td>
                                <td>
                                  <span className="badge badge-subtle theme-primary d-inline-flex align-items-center gap-1">
                                    {renderProtocolSymbol(acc.authType, 12)}
                                    <span>{acc.authType.toUpperCase()}</span>
                                  </span>
                                </td>
                                <td>
                                  <span className="switch switch-sm theme-primary">
                                    <input
                                      type="checkbox"
                                      checked={acc.isActive}
                                      disabled={!rbac.canUpdate}
                                      aria-label={`Toggle ${acc.accountName}`}
                                      onChange={() => handleToggleAccountStatus(acc.accountId)}
                                    />
                                  </span>
                                </td>
                                <td className="text-end">
                                  <div className="d-inline-flex gap-1">
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-outline theme-secondary"
                                      disabled={!rbac.canUpdate}
                                      onClick={() => handleLoadAccountIntoDraft(acc)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-outline theme-danger"
                                      disabled={!rbac.canDelete}
                                      onClick={() => handleRemoveStagedAccount(acc)}
                                    >
                                      <SymbolTrash size={12} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="staged-accounts-scroll">
                        {displayedAccounts.map((acc) => {
                          const isEditingRow = editingAccountId === acc.accountId;
                          return (
                            <div
                              key={acc.accountId}
                              className={`staged-account-card ${isEditingRow ? "editing" : ""}`}
                            >
                              <div className="d-flex align-items-start justify-content-between gap-2">
                                <div className="d-flex align-items-start gap-2 min-w-0">
                                  <span
                                    className="symbol-well tone-primary"
                                    style={{ width: 30, height: 30 }}
                                  >
                                    {renderProtocolSymbol(acc.authType, 14)}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="fw-bold small text-truncate">
                                      {acc.accountName}
                                    </div>
                                    <div className="small text-secondary text-truncate">
                                      {acc.userEmail}
                                    </div>
                                  </div>
                                </div>
                                <StatusBadge
                                  label={acc.isActive ? "Active" : "Inactive"}
                                  tone={acc.isActive ? "success" : "neutral"}
                                />
                              </div>

                              <div className="small text-secondary mt-2 pt-2 border-top d-flex flex-column gap-1">
                                <span>
                                  Protocol: {acc.authType.toUpperCase()} · Effort:{" "}
                                  {acc.effortTier.toUpperCase()}
                                </span>
                                {acc.config.apiBaseUrl && (
                                  <span className="text-truncate">
                                    Endpoint: {acc.config.apiBaseUrl}
                                  </span>
                                )}
                                {acc.config.cliExecutable && (
                                  <span className="text-truncate">
                                    CLI: {acc.config.cliExecutable} {acc.config.cliArguments || ""}
                                  </span>
                                )}
                                {acc.config.oauthClientId && (
                                  <span className="text-truncate">
                                    Client ID: {acc.config.oauthClientId}
                                  </span>
                                )}
                              </div>

                              <div className="d-flex align-items-center justify-content-end gap-1 mt-2 flex-wrap">
                                <button
                                  type="button"
                                  className="btn btn-xs btn-outline theme-secondary"
                                  disabled={!rbac.canUpdate || isTestingConnection}
                                  onClick={() => void handleTestAccountConnection(acc)}
                                >
                                  Test
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-outline theme-secondary"
                                  disabled={!rbac.canUpdate}
                                  onClick={() => handleLoadAccountIntoDraft(acc)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-outline theme-danger"
                                  disabled={!rbac.canDelete}
                                  onClick={() => handleRemoveStagedAccount(acc)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 3: Capabilities Tags & Pre-Flight Review */}
        {activeTab === "capabilities" && (
          <section className="row g-4" data-testid="panel-onboard-capabilities">
            <div className="col-12 lg:col-7" style={{ minWidth: 0 }}>
              <div className="card h-100">
                <div className="card-header">
                  <div className="onboarding-card-header-row">
                    <div className="onboarding-card-title-cluster">
                      <span className="symbol-well tone-primary" style={{ width: 32, height: 32 }}>
                        <SymbolLayers size={16} />
                      </span>
                      <div>
                        <h2 className="h6 mb-0 fw-bold">Capability & Integration Tags</h2>
                        <div className="small text-secondary">
                          Create tags below and click any tag or edit icon to rename it inline.
                        </div>
                      </div>
                    </div>
                    <span className="badge badge-subtle theme-primary">
                      {capabilities.length} Tags
                    </span>
                  </div>
                </div>

                <div className="card-body p-4">
                  <div className="tag-chip-editor">
                    <div className="tag-composer-row">
                      <div className="chip-input" data-testid="tag-chip-input">
                        {capabilities.map((tag, idx) => (
                          <span key={`${tag}-${idx}`} className="tag-chip-item">
                            {editingTagIndex === idx ? (
                              <span className="tag-edit-inline">
                                <input
                                  type="text"
                                  aria-label={`Edit tag ${tag}`}
                                  value={editingTagValue}
                                  autoFocus
                                  onChange={(e) => setEditingTagValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleCommitEditTag();
                                    } else if (e.key === "Escape") {
                                      setEditingTagIndex(null);
                                      setEditingTagValue("");
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className="tag-chip-icon-btn"
                                  onClick={handleCommitEditTag}
                                  title="Save tag"
                                >
                                  <SymbolCheck size={12} />
                                </button>
                              </span>
                            ) : (
                              <>
                                <span
                                  className="tag-chip-label"
                                  onClick={() => handleStartEditTag(idx)}
                                  title={canMutate ? "Click to edit tag" : tag}
                                >
                                  {tag}
                                </span>
                                {canMutate && (
                                  <>
                                    <button
                                      type="button"
                                      className="tag-chip-icon-btn"
                                      onClick={() => handleStartEditTag(idx)}
                                      title="Edit tag"
                                      aria-label={`Edit ${tag}`}
                                    >
                                      <SymbolEdit size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      className="tag-chip-icon-btn danger"
                                      onClick={() => handleRemoveTag(idx)}
                                      title="Remove tag"
                                      aria-label={`Remove ${tag}`}
                                    >
                                      <SymbolClose size={11} />
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </span>
                        ))}

                        <input
                          id="onb-custom-cap"
                          type="text"
                          className="form-ghost"
                          disabled={!canMutate || isSubmitting}
                          placeholder={
                            capabilities.length === 0
                              ? "Type tag name (e.g. Text, Tool Use)..."
                              : "Add another tag..."
                          }
                          value={tagDraftInput}
                          onChange={(e) => {
                            const nextVal = e.target.value;
                            if (nextVal.includes(",")) {
                              handleCreateTagsFromInput(nextVal);
                            } else {
                              setTagDraftInput(nextVal);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleCreateTagsFromInput();
                            } else if (
                              e.key === "Backspace" &&
                              !tagDraftInput &&
                              capabilities.length > 0
                            ) {
                              handleRemoveTag(capabilities.length - 1);
                            }
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        className="btn tag-add-btn"
                        disabled={!canMutate || !tagDraftInput.trim()}
                        onClick={() => handleCreateTagsFromInput()}
                      >
                        <SymbolPlus size={14} />
                        <span>Add Tag</span>
                      </button>
                    </div>

                    <div className="small text-secondary">
                      Tip: Press <strong>Enter</strong> or type a comma to create, or click any tag
                      to edit inline.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 lg:col-5" style={{ minWidth: 0 }}>
              <div className="card h-100">
                <div className="card-header">
                  <div className="onboarding-card-header-row">
                    <div className="onboarding-card-title-cluster">
                      <span className="symbol-well tone-success" style={{ width: 32, height: 32 }}>
                        <SymbolShield size={16} />
                      </span>
                      <div>
                        <h2 className="h6 mb-0 fw-bold">Pre-Flight Summary</h2>
                        <div className="small text-secondary">
                          {isEditMode
                            ? "Persisted integration metadata & changes."
                            : "Live values entered for this onboarding."}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card-body p-4">
                  <table className="table table-borderless table-sm summary-clean-table">
                    <tbody>
                      <tr>
                        <th className="text-secondary fw-medium">Provider Slug</th>
                        <td className="text-end">
                          {(integrationId || slugify(providerName)).trim() ? (
                            <code>{(integrationId || slugify(providerName)).trim()}</code>
                          ) : (
                            <span className="small text-secondary">—</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <th className="text-secondary fw-medium">Category & Scope</th>
                        <td className="text-end small fw-semibold">
                          {category || accountCategory
                            ? [category, accountCategory].filter(Boolean).join(" · ")
                            : "—"}
                        </td>
                      </tr>
                      <tr>
                        <th className="text-secondary fw-medium">Auth Protocols</th>
                        <td className="text-end small fw-semibold text-uppercase">
                          {derivedProtocols.length > 0 ? derivedProtocols.join(", ") : "—"}
                        </td>
                      </tr>
                      <tr>
                        <th className="text-secondary fw-medium">Tags Configured</th>
                        <td className="text-end small fw-semibold">
                          {capabilities.length > 0 ? capabilities.join(", ") : "—"}
                        </td>
                      </tr>
                      <tr>
                        <th className="text-secondary fw-medium">Account Pool</th>
                        <td className="text-end">
                          <StatusBadge
                            label={`${stagedAccounts.length} Configured`}
                            tone={stagedAccounts.length > 0 ? "success" : "info"}
                          />
                        </td>
                      </tr>
                      <tr>
                        <th className="text-secondary fw-medium">RBAC Access</th>
                        <td className="text-end">
                          <StatusBadge
                            label={canMutate ? "Authorized" : "Denied"}
                            tone={canMutate ? "success" : "danger"}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Persistent Action Footer */}
        <div className="card">
          <div className="card-body py-3 px-4">
            <div className="onboarding-action-row">
              <div className="onboarding-action-group">
                <button type="button" className="btn btn-outline theme-secondary" onClick={onCancel}>
                  Cancel
                </button>
                {isEditMode && initialIntegration && onDelete && (
                  !confirmDeleteIntegration ? (
                    <button
                      type="button"
                      className="btn btn-outline theme-danger"
                      disabled={!rbac.canDelete || isSubmitting}
                      title={
                        rbac.canDelete
                          ? "Delete integration"
                          : "RBAC: Missing integrations:delete permission"
                      }
                      onClick={() => setConfirmDeleteIntegration(true)}
                      data-testid="btn-delete"
                    >
                      <SymbolTrash size={14} />
                      <span>{rbac.canDelete ? "Delete Integration" : "Delete (Restricted)"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-solid theme-danger"
                      disabled={!rbac.canDelete || isSubmitting}
                      onClick={() => void onDelete(initialIntegration.integrationId)}
                      data-testid="btn-confirm-delete"
                    >
                      <SymbolTrash size={14} />
                      <span>Confirm Delete</span>
                    </button>
                  )
                )}
              </div>

              <div className="onboarding-action-group">
                {activeTab !== "identity" && (
                  <button
                    type="button"
                    className="btn btn-outline theme-secondary btn-sm"
                    onClick={() =>
                      setActiveTab(activeTab === "capabilities" ? "protocols" : "identity")
                    }
                  >
                    ← Previous
                  </button>
                )}
                {activeTab !== "capabilities" && (
                  <button
                    type="button"
                    className="btn btn-outline theme-primary btn-sm"
                    onClick={() =>
                      setActiveTab(activeTab === "identity" ? "protocols" : "capabilities")
                    }
                  >
                    Next →
                  </button>
                )}
                <button
                  type="submit"
                  className="btn btn-solid theme-primary"
                  disabled={!canMutate || isSubmitting}
                  title={
                    canMutate
                      ? "Save integration and all configured accounts"
                      : "RBAC permission required"
                  }
                  data-testid="btn-save"
                >
                  <SymbolCheck size={15} />
                  <span>
                    {isSubmitting
                      ? "Saving..."
                      : isEditMode
                        ? "Save Changes"
                        : "Save Integration"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
