import type { ActiveTab } from "@/types/ui.types";

export const ALLOWED_ROUTES: readonly ActiveTab[] = [
  "chat",
  "models",
  "model-config",
  "sessions",
  "upstream",
  "workflows",
  "onboarding",
  "admin-rbac",
] as const;

export interface ParsedRoute {
  readonly tab: ActiveTab;
  readonly params: Record<string, string>;
}

/**
 * RouteSecurity: Centralized security-hardened routing manager for ModelConnector UI.
 * Enforces strict enum whitelist, sanitizes parameters against XSS/traversal, and
 * ensures persistent browser refresh navigation across menus, create/edit modes, and detail views.
 */
export class RouteSecurity {
  public static sanitizeString(input: string, maxLen: number = 64): string {
    if (!input || typeof input !== "string") return "";
    return input.replace(/[^a-zA-Z0-9_\-\.:@]/g, "").slice(0, maxLen);
  }

  public static parseHash(rawHash?: string): ParsedRoute {
    const hash = rawHash || (typeof window !== "undefined" ? window.location.hash : "");
    if (!hash || hash === "#" || hash === "#/") {
      return { tab: "chat", params: {} };
    }

    const clean = hash.replace(/^#\/?/, "");
    const [pathPart, queryPart] = clean.split("?");
    const sanitizedTab = this.sanitizeString(pathPart || "chat") as ActiveTab;
    const tab: ActiveTab = ALLOWED_ROUTES.includes(sanitizedTab) ? sanitizedTab : "chat";

    const params: Record<string, string> = {};
    if (queryPart) {
      try {
        const searchParams = new URLSearchParams(queryPart);
        searchParams.forEach((val, key) => {
          const safeKey = this.sanitizeString(key, 32);
          const safeVal = this.sanitizeString(val, 128);
          if (safeKey && safeVal) {
            params[safeKey] = safeVal;
          }
        });
      } catch {
        // Safe query string fallback
      }
    }

    return { tab, params };
  }

  public static formatHash(tab: ActiveTab, params?: Record<string, string>): string {
    const safeTab = ALLOWED_ROUTES.includes(tab) ? tab : "chat";
    if (!params || Object.keys(params).length === 0) {
      return `#/${safeTab}`;
    }

    const query = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val) {
        const safeKey = this.sanitizeString(key, 32);
        const safeVal = this.sanitizeString(val, 128);
        if (safeKey && safeVal) {
          query.set(safeKey, safeVal);
        }
      }
    }

    const qs = query.toString();
    return qs ? `#/${safeTab}?${qs}` : `#/${safeTab}`;
  }

  public static syncHash(tab: ActiveTab, params?: Record<string, string>): void {
    if (typeof window === "undefined") return;
    const newHash = this.formatHash(tab, params);
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, "", newHash);
    }
  }
}

