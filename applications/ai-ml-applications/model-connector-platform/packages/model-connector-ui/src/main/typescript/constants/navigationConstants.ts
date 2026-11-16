import type { ActiveTab, UiMenuItem } from "@/types/ui.types";

export interface RouteBreadcrumbMeta {
  readonly parent: string;
  readonly label: string;
  readonly shortLabel: string;
}

export const ROUTE_BREADCRUMB_MAP: Record<ActiveTab, RouteBreadcrumbMeta> = {
  chat: {
    parent: "Workspace",
    label: "Dashboard",
    shortLabel: "Chat",
  },
  "model-config": {
    parent: "Connections",
    label: "Integration Hub",
    shortLabel: "Hub",
  },
  models: {
    parent: "Connections",
    label: "Models",
    shortLabel: "Models",
  },
  sessions: {
    parent: "Connections",
    label: "Sessions",
    shortLabel: "Sessions",
  },
  workflows: {
    parent: "Workspace",
    label: "Workflow Studio",
    shortLabel: "Workflows",
  },
  upstream: {
    parent: "Workspace",
    label: "Observability",
    shortLabel: "Telemetry",
  },
  onboarding: {
    parent: "Workspace",
    label: "Extensions",
    shortLabel: "Extensions",
  },
  "admin-rbac": {
    parent: "Governance",
    label: "Administration",
    shortLabel: "Admin",
  },
};

export const CONNECTIONS_GROUP_ROUTES: ReadonlySet<ActiveTab> = new Set<ActiveTab>([
  "model-config",
  "models",
  "sessions",
]);

const CONNECTION_ROUTE_ORDER: Record<string, number> = {
  "model-config": 1,
  models: 2,
  sessions: 3,
};

export interface GroupedNavigationSections {
  readonly primaryMenus: readonly UiMenuItem[];
  readonly connectionMenus: readonly UiMenuItem[];
  readonly workspaceMenus: readonly UiMenuItem[];
}

export function resolveMenuDisplayLabel(menu: UiMenuItem): string {
  if (
    menu.routePath === "model-config" &&
    (menu.menuLabel === "Configuration" ||
      menu.menuLabel === "Model Configuration" ||
      menu.menuLabel === "Integrations")
  ) {
    return "Integration Hub";
  }
  return menu.menuLabel;
}

export function groupSidebarMenus(menus: readonly UiMenuItem[]): GroupedNavigationSections {
  const primaryMenus: UiMenuItem[] = [];
  const connectionMenus: UiMenuItem[] = [];
  const workspaceMenus: UiMenuItem[] = [];

  for (const menu of menus) {
    if (menu.routePath === "chat") {
      primaryMenus.push(menu);
    } else if (CONNECTIONS_GROUP_ROUTES.has(menu.routePath)) {
      connectionMenus.push(menu);
    } else {
      workspaceMenus.push(menu);
    }
  }

  connectionMenus.sort(
    (a, b) =>
      (CONNECTION_ROUTE_ORDER[a.routePath] ?? a.sortOrder) -
      (CONNECTION_ROUTE_ORDER[b.routePath] ?? b.sortOrder),
  );

  return { primaryMenus, connectionMenus, workspaceMenus };
}

export function getUserInitials(fullName?: string): string {
  if (!fullName) return "PA";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}
