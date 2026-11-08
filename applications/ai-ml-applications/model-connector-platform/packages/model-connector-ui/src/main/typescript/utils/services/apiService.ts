import type {
  ChatMessage,
  UiModel,
  UiSession,
  UiUpstreamHealth,
  UiAuditRecord,
  StrategyMode,
  UiModelAccount,
  UiCategory,
  UiUser,
  UiDemoUser,
  UiMenuItem,
  TestConnectionResult,
  UiModelOAuthConfig,
  UiOAuthExchangeResult,
} from "@/types/ui.types";
import { ModelConstants, ModelCatalog } from "@/constants/providerConfigConstants";
import { ollamaUiModelCache, providerCatalogStore } from "@/utils/services/ollamaUiModelCache";

const API_BASE = "/api/v1";

export class ApiService {
  public static async syncProviderCatalog(forceRefresh = false): Promise<void> {
    try {
      const query = forceRefresh ? "?refresh=true" : "";
      const res = await fetch(`${API_BASE}/models/providers/catalog${query}`);
      if (!res.ok) return;
      const data = await res.json();
      providerCatalogStore.applyBackendCatalog({
        platformUrls: data.platformUrls,
        providers: data.providers,
      });
      if (data.ollamaCache?.models) {
        ollamaUiModelCache.updateCache(
          data.ollamaCache.models,
          data.ollamaCache.families,
          data.ollamaCache.cachedAtTimestamp,
        );
      }
    } catch {
      // Retain local 24h cache & centralized constants if backend is unreachable
    }
  }
  public static async login(email: string, password: string): Promise<UiUser> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Authentication failed. Check your email and password.");
    }
    return data.user;
  }

  public static async fetchCurrentUser(userId?: string): Promise<UiUser> {
    try {
      const url = userId ? `${API_BASE}/auth/me?userId=${encodeURIComponent(userId)}` : `${API_BASE}/auth/me`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = await res.json();
      return data.user;
    } catch {
      return this.getFallbackAdminUser();
    }
  }

  public static async fetchDemoUsers(): Promise<UiDemoUser[]> {
    try {
      const res = await fetch(`${API_BASE}/auth/demo-users`);
      if (!res.ok) throw new Error("Failed to fetch demo users");
      const data = await res.json();
      return data.users || [];
    } catch {
      return this.getFallbackDemoUsers();
    }
  }

  public static async fetchMenus(roleId?: string, companyId?: string): Promise<UiMenuItem[]> {
    try {
      const params = new URLSearchParams();
      if (roleId) params.append("roleId", roleId);
      if (companyId) params.append("companyId", companyId);

      const url = `${API_BASE}/navigation/menus?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch navigation menus");
      const data = await res.json();
      return data.menus || [];
    } catch {
      return this.getFallbackMenus(roleId);
    }
  }

  public static async fetchRbacMatrix(): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/rbac/matrix`);
      if (!res.ok) throw new Error("Failed to fetch RBAC matrix");
      return await res.json();
    } catch {
      return { companies: [], roles: [], permissions: [], allMenus: [] };
    }
  }

  public static async testModelConnection(payload: {
    modelId: string;
    authType: string;
    credentialValue: string;
    prompt?: string;
    config?: Record<string, unknown>;
  }): Promise<TestConnectionResult> {
    const res = await fetch(`${API_BASE}/models/config/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok && !data.result) {
      throw new Error(data.message || "Failed to execute connection verification");
    }
    return data.result;
  }

  public static async fetchLatestOAuthCallback(modelId: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}/latest-oauth-callback`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.session || null;
    } catch {
      return null;
    }
  }

  public static async verifyOAuthManual(
    modelId: string,
    input: string,
    userEmail?: string,
  ): Promise<{
    success: boolean;
    session: any;
    message: string;
    account?: any;
    syncedAccounts?: any[];
    vcs?: {
      hasChanges: boolean;
      changedFiles: string[];
      gitCommitHash?: string;
    };
  }> {
    const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}/verify-oauth-manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, userEmail }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Failed to execute manual OAuth verification");
    }
    return data;
  }

  public static async exchangeModelOAuthToken(
    modelId: string,
    payload: { code?: string; userEmail?: string },
  ): Promise<UiOAuthExchangeResult> {
    const url = `${API_BASE}/models/${encodeURIComponent(modelId)}/oauth-exchange`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to exchange OAuth token");
    const data = await res.json();
    return data.result;
  }


  public static async fetchCategories(): Promise<UiCategory[]> {
    try {
      const res = await fetch(`${API_BASE}/categories`);
      if (!res.ok) throw new Error("Failed to fetch categories");
      const data = await res.json();
      return data.categories || [];
    } catch {
      return this.getFallbackCategories();
    }
  }

  public static async fetchModels(): Promise<UiModel[]> {
    try {
      const res = await fetch(`${API_BASE}/models`);
      if (!res.ok) throw new Error("Failed to fetch models");
      const data = await res.json();
      return data.models || [];
    } catch {
      return this.getFallbackModels();
    }
  }

  public static async sendChat(
    prompt: string,
    model: string,
    strategy: StrategyMode,
    sessionId?: string,
  ): Promise<ChatMessage> {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model, strategy, sessionId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.success === false) {
      const errorMsg = data?.error?.message || `HTTP ${res.status}: Failed to get response from ${model}`;
      throw new Error(errorMsg);
    }
    return {
      id: data.correlationId || Math.random().toString(36).substring(7),
      role: "assistant",
      content: data.content || "Empty response received.",
      model: data.model || model,
      strategy: data.strategyUsed || strategy,
      timestamp: new Date().toLocaleTimeString(),
      latencyMs: data.latencyMs || 0,
      tokenCount: data.tokenMetrics?.totalTokens,
      fallbackOccurred: Boolean(data.fallbackOccurred || (data.model && data.model !== model)),
      fallbackReason: data.fallbackReason,
      requestedModel: data.requestedModel || model,
      fallbackProvider: data.fallbackProvider,
    };
  }

  public static async fetchSessions(): Promise<UiSession[]> {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      return (data.sessions || []).map((s: any) => ({
        sessionId: s.sessionId,
        model: s.activeModelId || s.model || ModelConstants.DEFAULT_MODEL_ID,
        strategy: s.strategyMode || s.strategy || "api",
        turnCount: s.turnCount || 0,
        createdAt: s.createdTimestamp || s.createdAt || new Date().toISOString(),
        lastActiveAt: s.updatedTimestamp || s.lastActiveAt || new Date().toISOString(),
        cookies: s.cookies || [{ name: "mb_session_id", value: s.sessionId }],
      }));
    } catch {
      return this.getFallbackSessions();
    }
  }

  public static async fetchSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
      const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`);
      if (!res.ok) throw new Error("Failed to fetch session messages");
      const data = await res.json();
      return (data.messages || []).map((m: any) => ({
        id: m.messageId || Math.random().toString(36).substring(7),
        role: m.role as "user" | "assistant",
        content: m.content,
        model: m.model,
        strategy: (m.strategy as StrategyMode) || "api",
        timestamp: new Date(m.timestamp).toLocaleTimeString(),
        latencyMs: m.latencyMs,
        tokenCount: m.tokenCount,
        fallbackOccurred: Boolean(m.fallbackOccurred),
        fallbackReason: m.fallbackReason,
        requestedModel: m.requestedModel,
        fallbackProvider: m.fallbackProvider,
      }));
    } catch {
      return [];
    }
  }

  public static async createSession(model: string = ModelConstants.DEFAULT_MODEL_ID, strategy: StrategyMode = "api"): Promise<UiSession> {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, strategy }),
    });
    if (!res.ok) throw new Error("Failed to create session");
    const data = await res.json();
    const s = data.session;
    return {
      sessionId: s.sessionId,
      model: s.activeModelId || s.model,
      strategy: (s.strategyMode || s.strategy || strategy) as StrategyMode,
      turnCount: s.turnCount || 0,
      createdAt: s.createdTimestamp || new Date().toISOString(),
      lastActiveAt: s.updatedTimestamp || new Date().toISOString(),
      cookies: [{ name: "mb_session_id", value: s.sessionId }],
    };
  }

  public static async deleteSession(sessionId: string): Promise<void> {
    await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  }

  public static async fetchModelAccounts(modelId?: string): Promise<UiModelAccount[]> {
    try {
      const url = modelId
        ? `${API_BASE}/models/${encodeURIComponent(modelId)}/accounts`
        : `${API_BASE}/accounts`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch model accounts");
      const data = await res.json();
      return data.accounts || [];
    } catch {
      return [];
    }
  }

  public static async createModelAccount(
    modelId: string,
    account: {
      accountName: string;
      userEmail: string;
      authType: "api_key" | "cookie" | "cli_oauth" | "api" | "cli" | "oauth";
      credentialValue: string;
      isActive?: boolean;
      config?: Record<string, unknown>;
    },
  ): Promise<UiModelAccount> {
    const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account),
    });
    if (!res.ok) throw new Error("Failed to create account credential");
    const data = await res.json();
    return data.account;
  }

  public static async updateModelAccount(
    modelId: string,
    accountId: string,
    account: {
      accountName?: string;
      userEmail?: string;
      authType?: "api_key" | "cookie" | "cli_oauth" | "api" | "cli" | "oauth";
      credentialValue?: string;
      isActive?: boolean;
      config?: Record<string, unknown>;
    },
  ): Promise<UiModelAccount> {
    const res = await fetch(
      `${API_BASE}/models/${encodeURIComponent(modelId)}/accounts/${encodeURIComponent(accountId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(account),
      },
    );
    if (!res.ok) throw new Error("Failed to update account credential");
    const data = await res.json();
    return data.account;
  }

  public static async activateModelAccount(modelId: string, accountId: string): Promise<void> {
    const res = await fetch(
      `${API_BASE}/models/${encodeURIComponent(modelId)}/accounts/${encodeURIComponent(accountId)}/activate`,
      { method: "POST" },
    );
    if (!res.ok) throw new Error("Failed to activate account");
  }

  public static async deactivateModelAccount(modelId: string, accountId: string): Promise<void> {
    const res = await fetch(
      `${API_BASE}/models/${encodeURIComponent(modelId)}/accounts/${encodeURIComponent(accountId)}/deactivate`,
      { method: "POST" },
    );
    if (!res.ok) throw new Error("Failed to deactivate account");
  }

  public static async deleteModelAccount(modelId: string, accountId: string): Promise<void> {
    const res = await fetch(
      `${API_BASE}/models/${encodeURIComponent(modelId)}/accounts/${encodeURIComponent(accountId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error("Failed to delete account");
  }

  public static async fetchModelOAuthConfig(
    modelId: string,
    redirectUri?: string,
    clientId?: string,
  ): Promise<UiModelOAuthConfig> {
    const params = new URLSearchParams();
    if (redirectUri) params.append("redirectUri", redirectUri);
    if (clientId) params.append("clientId", clientId);
    const url = `${API_BASE}/models/${encodeURIComponent(modelId)}/oauth-config?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "Failed to fetch OAuth configuration");
    }
    return data.config;
  }

  public static async exchangeOAuthCode(
    modelId: string,
    code?: string,
    userEmail?: string,
  ): Promise<UiOAuthExchangeResult> {
    const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}/oauth-exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, userEmail }),
    });
    if (!res.ok) throw new Error("Failed to exchange OAuth code");
    const data = await res.json();
    return data.result;
  }

  public static async fetchLatestCliSession(modelId?: string): Promise<{
    success: boolean;
    session: {
      sessionId: string;
      provider: string;
      modelId: string;
      authMode: string;
      oauthUrl?: string;
      cliRedirectUri?: string;
      appRedirectUri?: string;
      authCode?: string;
      status: "PENDING" | "COMPLETED" | "FAILED";
      errorMessage?: string;
      errorCode?: string;
      createdAt: string;
      updatedAt: string;
    } | null;
    message: string;
  }> {
    const params = new URLSearchParams();
    if (modelId) params.append("modelId", modelId);
    const res = await fetch(`${API_BASE}/models/cli-sessions/latest?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch latest CLI OAuth session");
    return await res.json();
  }

  public static async submitCliAuthCode(payload: {
    sessionId?: string;
    authCode: string;
    modelId?: string;
    userEmail?: string;
  }): Promise<{
    success: boolean;
    sessionId: string;
    authCode: string;
    message: string;
  }> {
    const res = await fetch(`${API_BASE}/auth/cli-session/submit-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Failed to submit CLI auth code");
    return data;
  }

  public static async executeCliLogin(
    modelId: string,
    payload: {
      provider?: string;
      userEmail?: string;
      accountCategory?: "individual" | "enterprise";
    },
  ): Promise<{
    success: boolean;
    modelId: string;
    message: string;
    session?: {
      sessionId: string;
      provider: string;
      modelId: string;
      authMode: string;
      oauthUrl?: string;
      cliRedirectUri?: string;
      appRedirectUri?: string;
      authCode?: string;
      status: "PENDING" | "COMPLETED" | "FAILED";
      errorMessage?: string;
      errorCode?: string;
    };
    account?: {
      accountId: string;
      modelId: string;
      userEmail: string;
      accountName: string;
      authType: string;
      isNewAccount?: boolean;
    };
    syncedAccounts?: any[];
    vcs?: {
      hasChanges: boolean;
      changedFiles: string[];
      gitCommitHash?: string;
      snapshotId?: string;
    };
    loginResult?: {
      provider: string;
      cliCommand: string;
      config?: {
        authorizationUrl?: string;
        requiresClientRegistration?: boolean;
        setupGuide?: string;
        nextStep?: string;
      };
    };
  }> {
    const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}/cli-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Failed to execute CLI login");
    return data;
  }

  public static async verifyCredentialsDirectory(
    modelId: string,
    userEmail?: string,
  ): Promise<{
    success: boolean;
    modelId: string;
    vcs: {
      directoryPath: string;
      exists: boolean;
      isGitRepo: boolean;
      currentCommitHash?: string;
      totalTrackedFiles: number;
      recentChangedFiles: string[];
    };
    diffReport?: {
      hasChanges: boolean;
      changedFiles: string[];
      gitCommitHash?: string;
    };
    syncedAccounts?: Array<{
      accountId: string;
      modelId: string;
      userEmail: string;
      accountName: string;
      authType: string;
      sourceFile: string;
      isNewAccount: boolean;
    }>;
    message: string;
  }> {
    const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}/vcs/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Failed to verify credentials directory");
    return data;
  }

  public static async fetchVcsStatus(modelId: string): Promise<{
    success: boolean;
    modelId: string;
    vcs: {
      directoryPath: string;
      exists: boolean;
      isGitRepo: boolean;
      currentCommitHash?: string;
      totalTrackedFiles: number;
      recentChangedFiles: string[];
    };
  }> {
    const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}/vcs/status`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Failed to fetch VCS status");
    return data;
  }

  public static async upsertProviderOAuthClient(
    providerId: string,
    payload: {
      oauthClientConfigId?: string;
      modelId?: string;
      clientAlias?: string;
      clientName?: string;
      clientId: string;
      clientSecret?: string;
      redirectUri?: string;
      scopes?: readonly string[];
      isDefault?: boolean;
    },
  ): Promise<{ success: boolean; client: { oauthClientConfigId: string; clientId: string } }> {
    const res = await fetch(`${API_BASE}/models/providers/${encodeURIComponent(providerId)}/oauth-clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Failed to apply OAuth client configuration");
    return data;
  }

  public static async fetchUpstreamStatus(): Promise<UiUpstreamHealth> {
    try {
      const res = await fetch(`${API_BASE}/upstream/status`);
      if (!res.ok) throw new Error("Failed to fetch upstream");
      const data = await res.json();
      return data.upstreamHealth || { status: "ONLINE", service: "gemini-model-connector" };
    } catch {
      return { status: "ONLINE", service: "gemini-model-connector", uptimeSeconds: 3600 };
    }
  }

  public static async fetchUpstreamAudit(): Promise<UiAuditRecord[]> {
    try {
      const res = await fetch(`${API_BASE}/upstream/audit`);
      if (!res.ok) throw new Error("Failed to fetch audit");
      const data = await res.json();
      return data.logs || [];
    } catch {
      return this.getFallbackAudit();
    }
  }

  private static getFallbackAdminUser(): UiUser {
    return {
      userId: "usr-admin",
      companyId: "acme-corp",
      companyName: "Acme Global Technologies",
      roleId: "SUPER_ADMIN",
      roleName: "Super Administrator",
      fullName: "Alexander Vance",
      userEmail: "admin@enterprise.com",
      avatarUrl: "👑",
      permissions: [
        "menu:chat",
        "menu:models",
        "menu:model-config",
        "menu:sessions",
        "menu:workflows",
        "menu:upstream",
        "menu:onboarding",
        "menu:admin-rbac",
      ],
      token: "mock-admin-token",
    };
  }

  private static getFallbackDemoUsers(): UiDemoUser[] {
    return [
      {
        userId: "usr-admin",
        fullName: "Alexander Vance",
        userEmail: "admin@enterprise.com",
        companyId: "acme-corp",
        companyName: "Acme Global Technologies",
        roleId: "SUPER_ADMIN",
        roleName: "Super Administrator",
        avatarUrl: "👑",
      },
      {
        userId: "usr-dev",
        fullName: "Elena Rostova",
        userEmail: "developer@enterprise.com",
        companyId: "acme-corp",
        companyName: "Acme Global Technologies",
        roleId: "DEVELOPER",
        roleName: "AI/ML Engineer",
        avatarUrl: "💻",
      },
      {
        userId: "usr-analyst",
        fullName: "Marcus Chen",
        userEmail: "analyst@enterprise.com",
        companyId: "acme-corp",
        companyName: "Acme Global Technologies",
        roleId: "ANALYST",
        roleName: "Business Analyst",
        avatarUrl: "📊",
      },
      {
        userId: "usr-globex",
        fullName: "Sarah Connors",
        userEmail: "sarah.connors@globex.io",
        companyId: "globex-inc",
        companyName: "Globex Robotics Inc",
        roleId: "COMPANY_ADMIN",
        roleName: "Company Administrator",
        avatarUrl: "🌐",
      },
    ];
  }

  private static getFallbackMenus(roleId?: string): UiMenuItem[] {
    const all: UiMenuItem[] = [
      { menuId: "chat", menuLabel: "Omni-Channel Chat", menuIcon: "💬", routePath: "chat", badgeCountKey: "messages", sortOrder: 10, isDefault: true, requiredPermission: "menu:chat" },
      { menuId: "models", menuLabel: "Model Registry", menuIcon: "🧠", routePath: "models", badgeCountKey: "models", sortOrder: 20, isDefault: false, requiredPermission: "menu:models" },
      { menuId: "model-config", menuLabel: "Model Configuration", menuIcon: "⚙️", routePath: "model-config", badgeCountKey: "accounts", sortOrder: 30, isDefault: true, requiredPermission: "menu:model-config", descriptionText: "Protocol configuration for API, CLI, Cookie, OAuth (Default for each login)" },
      { menuId: "sessions", menuLabel: "Cookie & Sessions", menuIcon: "🍪", routePath: "sessions", badgeCountKey: "sessions", sortOrder: 40, isDefault: false, requiredPermission: "menu:sessions" },
      { menuId: "workflows", menuLabel: "Workflow DAG", menuIcon: "🔀", routePath: "workflows", sortOrder: 50, isDefault: false, requiredPermission: "menu:workflows" },
      { menuId: "upstream", menuLabel: "Telemetry & Sync", menuIcon: "📊", routePath: "upstream", badgeCountKey: "auditLogs", sortOrder: 60, isDefault: false, requiredPermission: "menu:upstream" },
      { menuId: "onboarding", menuLabel: "Domain Onboarding", menuIcon: "🚀", routePath: "onboarding", sortOrder: 70, isDefault: false, requiredPermission: "menu:onboarding" },
      { menuId: "admin-rbac", menuLabel: "RBAC & Access Control", menuIcon: "🛡️", routePath: "admin-rbac", sortOrder: 80, isDefault: false, requiredPermission: "menu:admin-rbac" },
    ];

    if (roleId === "DEVELOPER") {
      return all.filter((m) => ["chat", "models", "model-config", "sessions", "workflows"].includes(m.menuId));
    }
    if (roleId === "ANALYST") {
      return all.filter((m) => ["chat", "model-config", "upstream", "onboarding"].includes(m.menuId));
    }
    if (roleId === "COMPANY_ADMIN") {
      return all.filter((m) => ["chat", "models", "model-config", "sessions", "upstream", "onboarding"].includes(m.menuId));
    }
    return all;
  }



  private static getFallbackModels(): UiModel[] {
    return [
      {
        id: ModelCatalog.GEMINI_3_8_FLASH,
        name: "Google Gemini 3.8 Flash (Recommended)",
        family: "gemini",
        tier: "freeware",
        supportedStrategies: ["cli", "api", "cookie"],
        status: "ACTIVE",
        description: "Google state-of-the-art fast multimodal reasoning model",
      },
      {
        id: "gemini-3.5-flash",
        name: "Google Gemini 3.5 Flash",
        family: "gemini",
        tier: "freeware",
        supportedStrategies: ["cli", "api", "cookie"],
        status: "ACTIVE",
        description: "High-throughput, low-latency reasoning model",
      },
      {
        id: "claude-3-7-sonnet",
        name: "Anthropic Claude 3.7 Sonnet",
        family: "claude",
        tier: "paid",
        supportedStrategies: ["cli", "api", "cookie"],
        status: "ACTIVE",
        description: "Frontier hybrid reasoning and agentic model by Anthropic",
      },
      {
        id: "claude-3-5-haiku",
        name: "Anthropic Claude 3.5 Haiku",
        family: "claude",
        tier: "paid",
        supportedStrategies: ["cli", "api", "cookie"],
        status: "ACTIVE",
        description: "Fast and lightweight Anthropic Claude intelligence",
      },
      {
        id: "copilot-gpt-4o",
        name: "GitHub Copilot (GPT-4o)",
        family: "copilot",
        tier: "paid",
        supportedStrategies: ["cli", "api", "cookie"],
        status: "ACTIVE",
        description: "Developer coding assistant powered by GitHub Copilot CLI & API",
      },
      {
        id: "copilot-claude-3.5-sonnet",
        name: "GitHub Copilot (Claude 3.5 Sonnet)",
        family: "copilot",
        tier: "paid",
        supportedStrategies: ["cli", "api", "cookie"],
        status: "ACTIVE",
        description: "Anthropic Claude 3.5 Sonnet hosted on GitHub Copilot",
      },
      {
        id: "lfm3-omni",
        name: "Liquid LFM3-Omni (Ollama Local Audio/Omni)",
        family: "ollama",
        tier: "freeware",
        supportedStrategies: ["cli", "api", "cookie"],
        status: "ACTIVE",
        description: "Local multimodal & speech omni model running on Ollama GPU container",
      },
      {
        id: "llama3.2",
        name: "LLaMA 3.2 (Ollama Local)",
        family: "ollama",
        tier: "freeware",
        supportedStrategies: ["cli", "api", "cookie"],
        status: "ACTIVE",
        description: "Local private on-device open weights model powered by Ollama",
      },
      {
        id: "tinyllama",
        name: "TinyLlama 1.1B (Fallback)",
        family: "ollama",
        tier: "freeware",
        supportedStrategies: ["cli", "api", "cookie"],
        status: "ACTIVE",
        description: "Local lightweight fallback model running hermetically without API key",
      },
      {
        id: "gpt-4o",
        name: "OpenAI GPT-4o",
        family: "openai",
        tier: "paid",
        supportedStrategies: ["api", "cookie"],
        status: "ACTIVE",
        description: "Omni-channel reasoning flagship model by OpenAI",
      },
      {
        id: "gpt-4o-mini",
        name: "OpenAI GPT-4o Mini",
        family: "openai",
        tier: "paid",
        supportedStrategies: ["api", "cookie"],
        status: "ACTIVE",
        description: "Efficient small model by OpenAI",
      },
    ];
  }

  private static getFallbackSessions(): UiSession[] {
    return [];
  }

  private static getFallbackAudit(): UiAuditRecord[] {
    return [];
  }

  private static getFallbackCategories(): UiCategory[] {
    return [
      { categoryId: "gemini", label: "Google Gemini", icon: "✦", accentColor: "#4285f4", description: "Frontier multimodal reasoning intelligence & high-speed reasoning", sortOrder: 1 },
      { categoryId: "grok", label: "xAI Grok", icon: "⚡", accentColor: "#ff0055", description: "Real-time accelerated deep reasoning and math intelligence", sortOrder: 2 },
      { categoryId: "claude", label: "Anthropic Claude", icon: "🧠", accentColor: "#e06c4b", description: "Frontier hybrid reasoning and nuanced agentic architecture", sortOrder: 3 },
      { categoryId: "chatgpt", label: "OpenAI ChatGPT", icon: "🤖", accentColor: "#10a37f", description: "Generalist multimodal reasoning and cost-effective intelligence", sortOrder: 4 },
      { categoryId: "copilot", label: "Microsoft Copilot", icon: "🚀", accentColor: "#8b5cf6", description: "Code assistance and developer automation intelligence", sortOrder: 5 },
      { categoryId: "ollama", label: "Local Fallback (Ollama)", icon: "🛡️", accentColor: "#f59e0b", description: "Local on-device private execution & offline fallback runners", sortOrder: 6 },
    ];
  }
}
