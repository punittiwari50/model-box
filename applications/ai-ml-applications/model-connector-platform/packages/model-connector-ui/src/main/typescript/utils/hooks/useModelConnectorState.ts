import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  ActiveTab,
  StrategyMode,
  ChatMessage,
  UiModel,
  UiSession,
  UiUpstreamHealth,
  UiAuditRecord,
  UiCategory,
  UiUser,
  UiDemoUser,
  UiMenuItem,
  UiModelAccount,
} from "@/types/ui.types";
import { ApiService } from "@/utils/services/apiService";
import { ModelConstants } from "@/constants/providerConfigConstants";

export interface ModelConnectorState {
  readonly activeTab: ActiveTab;
  readonly activeStrategy: StrategyMode;
  readonly effectiveStrategy: StrategyMode;
  readonly selectedModel: string;
  readonly models: UiModel[];
  readonly categories: UiCategory[];
  readonly messages: ChatMessage[];
  readonly sessions: UiSession[];
  readonly activeSessionId: string | undefined;
  readonly upstreamHealth: UiUpstreamHealth;
  readonly auditLogs: UiAuditRecord[];
  readonly isLoading: boolean;

  // RBAC & Authentication State
  readonly currentUser: UiUser | null;
  readonly demoUsers: UiDemoUser[];
  readonly menus: UiMenuItem[];
  readonly isLoginModalOpen: boolean;
  readonly setIsLoginModalOpen: (open: boolean) => void;
  readonly login: (email: string, password: string) => Promise<boolean>;
  readonly logout: () => void;
  readonly switchUser: (userId: string) => Promise<void>;

  // Model Configurations State
  readonly modelAccounts: UiModelAccount[];
  readonly refreshModelAccounts: () => Promise<void>;

  // Navigation & Session Handlers
  readonly setActiveTab: (tab: ActiveTab) => void;
  readonly setActiveStrategy: (strat: StrategyMode) => void;
  readonly setSelectedModel: (model: string) => void;
  readonly setActiveSessionId: (id: string | undefined) => void;
  readonly handleSendMessage: (prompt: string) => Promise<void>;
  readonly handleNewSession: () => Promise<void>;
  readonly handleDeleteSession: (sessionId: string) => Promise<void>;
  readonly refreshData: () => Promise<void>;
}

export function useModelConnectorState(): ModelConnectorState {
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [activeStrategy, setActiveStrategy] = useState<StrategyMode>("api");
  const [selectedModel, setSelectedModel] = useState<string>(ModelConstants.DEFAULT_MODEL_ID);
  const [models, setModels] = useState<UiModel[]>([]);
  const [categories, setCategories] = useState<UiCategory[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<UiSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mb_active_session_id") || undefined;
    }
    return undefined;
  });
  const [upstreamHealth, setUpstreamHealth] = useState<UiUpstreamHealth>({
    status: "ONLINE",
    service: "gemini-model-connector",
  });
  const [auditLogs, setAuditLogs] = useState<UiAuditRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Authentication & Dynamic Menus State
  const [currentUser, setCurrentUser] = useState<UiUser | null>(null);
  const [demoUsers, setDemoUsers] = useState<UiDemoUser[]>([]);
  const [menus, setMenus] = useState<UiMenuItem[]>([]);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);

  // Model Accounts
  const [modelAccounts, setModelAccounts] = useState<UiModelAccount[]>([]);

  const effectiveStrategy: StrategyMode = useMemo(() => {
    const activeAccount = modelAccounts.find(
      (a) => a.modelId === selectedModel && a.isActive,
    );
    if (activeAccount?.authType === "cli_oauth" || activeAccount?.authType === "oauth") {
      return "oauth";
    }
    if (activeAccount?.authType === "cli") {
      return "cli";
    }
    if (activeAccount?.authType === "cookie") {
      return "cookie";
    }
    return activeStrategy;
  }, [modelAccounts, selectedModel, activeStrategy]);

  const loadSessionMessages = useCallback(async (sessionId: string) => {
    try {
      const msgs = await ApiService.fetchSessionMessages(sessionId);
      setMessages(msgs);
    } catch {
      // Fallback handled in ApiService
    }
  }, []);

  const handleSelectSession = useCallback(
    async (id: string | undefined) => {
      setActiveSessionId(id);
      if (id) {
        if (typeof window !== "undefined") {
          localStorage.setItem("mb_active_session_id", id);
        }
        await loadSessionMessages(id);
      } else {
        if (typeof window !== "undefined") {
          localStorage.removeItem("mb_active_session_id");
        }
        setMessages([]);
      }
    },
    [loadSessionMessages],
  );

  const refreshModelAccounts = useCallback(async () => {
    try {
      const accounts = await ApiService.fetchModelAccounts();
      setModelAccounts(accounts);
    } catch {
      // Handled in ApiService fallback
    }
  }, []);

  const loadUserDataAndMenus = useCallback(async (targetUserId?: string) => {
    try {
      const [user, demoList] = await Promise.all([
        ApiService.fetchCurrentUser(targetUserId),
        ApiService.fetchDemoUsers(),
      ]);
      setCurrentUser(user);
      setDemoUsers(demoList);

      const userMenus = await ApiService.fetchMenus(user.roleId, user.companyId);
      setMenus(userMenus);

      // Verify activeTab is accessible for this user, else redirect to default menu
      setActiveTab((prevTab) => {
        const isPermitted = userMenus.some((m) => m.routePath === prevTab);
        return isPermitted ? prevTab : "chat";
      });
    } catch {
      // Handled in fallbacks
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      const [fetchedCategories, fetchedModels, fetchedSessions, fetchedHealth, fetchedAudit] =
        await Promise.all([
          ApiService.fetchCategories(),
          ApiService.fetchModels(),
          ApiService.fetchSessions(),
          ApiService.fetchUpstreamStatus(),
          ApiService.fetchUpstreamAudit(),
        ]);
      setCategories(fetchedCategories);
      setModels(fetchedModels);
      setSessions(fetchedSessions);
      setUpstreamHealth(fetchedHealth);
      setAuditLogs(fetchedAudit);

      await Promise.all([loadUserDataAndMenus(), refreshModelAccounts()]);

      const savedSessionId =
        typeof window !== "undefined" ? localStorage.getItem("mb_active_session_id") : null;
      let targetSessionId: string | undefined = undefined;

      if (savedSessionId && fetchedSessions.some((s) => s.sessionId === savedSessionId)) {
        targetSessionId = savedSessionId;
      } else if (fetchedSessions.length > 0) {
        targetSessionId = fetchedSessions[0].sessionId;
      }

      if (targetSessionId) {
        setActiveSessionId(targetSessionId);
        if (typeof window !== "undefined") {
          localStorage.setItem("mb_active_session_id", targetSessionId);
        }
        const msgs = await ApiService.fetchSessionMessages(targetSessionId);
        setMessages(msgs);
      }
    } catch {
      // Fallback data handled gracefully inside ApiService
    }
  }, [loadUserDataAndMenus, refreshModelAccounts]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Handle automatic return from OAuth callback redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("oauth_success") === "true") {
      const tabParam = searchParams.get("tab") as ActiveTab | null;
      if (tabParam) {
        setActiveTab(tabParam);
      }
      void refreshModelAccounts();
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [refreshModelAccounts]);

  const login = async (email: string, pass: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const user = await ApiService.login(email, pass);
      setCurrentUser(user);
      const userMenus = await ApiService.fetchMenus(user.roleId, user.companyId);
      setMenus(userMenus);

      // Check current tab
      setActiveTab((prev) => {
        const exists = userMenus.some((m) => m.routePath === prev);
        return exists ? prev : "chat";
      });

      setIsLoginModalOpen(false);
      return true;
    } catch (err) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // Reset to demo guest or first demo user
    if (demoUsers.length > 0) {
      switchUser(demoUsers[0].userId);
    }
  };

  const switchUser = async (userId: string) => {
    setIsLoading(true);
    try {
      await loadUserDataAndMenus(userId);
      setIsLoginModalOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (prompt: string) => {
    if (!prompt.trim()) return;

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      try {
        const created = await ApiService.createSession(selectedModel, effectiveStrategy);
        currentSessionId = created.sessionId;
        setActiveSessionId(currentSessionId);
        if (typeof window !== "undefined") {
          localStorage.setItem("mb_active_session_id", currentSessionId);
        }
        setSessions((prev) => [created, ...prev]);
      } catch {
        currentSessionId = `sess_${Math.random().toString(36).substring(2, 10)}`;
        setActiveSessionId(currentSessionId);
      }
    }

    const tempUserMsg: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      content: prompt,
      model: selectedModel,
      strategy: effectiveStrategy,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const assistantMsg = await ApiService.sendChat(
        prompt,
        selectedModel,
        effectiveStrategy,
        currentSessionId,
      );
      setMessages((prev) => [...prev, assistantMsg]);

      // Sync updated turn count and timestamp from backend sessions
      const updatedSessions = await ApiService.fetchSessions();
      setSessions(updatedSessions);
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : String(err);
      const errorMsg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: "assistant",
        content: `⚠️ Error: ${errorText}`,
        model: selectedModel,
        strategy: effectiveStrategy,
        timestamp: new Date().toLocaleTimeString(),
        latencyMs: 0,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewSession = async () => {
    try {
      const newSession = await ApiService.createSession(selectedModel, effectiveStrategy);
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.sessionId);
      if (typeof window !== "undefined") {
        localStorage.setItem("mb_active_session_id", newSession.sessionId);
      }
      setMessages([]);
    } catch {
      const fallbackId = `sess_${Math.random().toString(36).substring(2, 10)}`;
      setActiveSessionId(fallbackId);
      setMessages([]);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await ApiService.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.sessionId !== sessionId);
        const nextId = remaining.length > 0 ? remaining[0].sessionId : undefined;
        await handleSelectSession(nextId);
      }
    } catch {
      // Ignored
    }
  };

  return {
    activeTab,
    activeStrategy,
    effectiveStrategy,
    selectedModel,
    models,
    categories,
    messages,
    sessions,
    activeSessionId,
    upstreamHealth,
    auditLogs,
    isLoading,
    currentUser,
    demoUsers,
    menus,
    isLoginModalOpen,
    setIsLoginModalOpen,
    login,
    logout,
    switchUser,
    modelAccounts,
    refreshModelAccounts,
    setActiveTab,
    setActiveStrategy,
    setSelectedModel,
    setActiveSessionId: handleSelectSession,
    handleSendMessage,
    handleNewSession,
    handleDeleteSession,
    refreshData: loadInitialData,
  };
}
