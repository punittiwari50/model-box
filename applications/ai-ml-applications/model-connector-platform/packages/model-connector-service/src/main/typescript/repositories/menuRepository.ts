import { platformDatabase } from "@/database/platformDatabase";

export interface MenuItemRecord {
  readonly menuId: string;
  readonly menuLabel: string;
  readonly menuIcon: string;
  readonly routePath: string;
  readonly badgeCountKey?: string;
  readonly sortOrder: number;
  readonly isDefault: boolean;
  readonly requiredPermission?: string;
  readonly descriptionText?: string;
}

const DEFAULT_SYSTEM_MENUS: readonly MenuItemRecord[] = Object.freeze([
  {
    menuId: "menu-chat",
    menuLabel: "AI Chat",
    menuIcon: "💬",
    routePath: "chat",
    sortOrder: 1,
    isDefault: true,
    descriptionText: "Omni-channel AI chat and multimodal execution",
  },
  {
    menuId: "menu-models",
    menuLabel: "Models",
    menuIcon: "🤖",
    routePath: "models",
    badgeCountKey: "models",
    sortOrder: 3,
    isDefault: true,
    descriptionText: "Discover and manage AI models across providers",
  },
  {
    menuId: "menu-model-config",
    menuLabel: "Integration Hub",
    menuIcon: "🪪",
    routePath: "model-config",
    badgeCountKey: "accounts",
    sortOrder: 2,
    isDefault: true,
    descriptionText: "Discover, connect, and manage external services and model credentials",
  },
  {
    menuId: "menu-sessions",
    menuLabel: "Sessions",
    menuIcon: "🗂️",
    routePath: "sessions",
    badgeCountKey: "sessions",
    sortOrder: 4,
    isDefault: true,
    descriptionText: "Persistent session lineage and conversation history",
  },
  {
    menuId: "menu-upstream",
    menuLabel: "Telemetry",
    menuIcon: "📡",
    routePath: "upstream",
    badgeCountKey: "auditLogs",
    sortOrder: 5,
    isDefault: true,
    descriptionText: "Upstream health and distributed audit telemetry",
  },
  {
    menuId: "menu-workflows",
    menuLabel: "Workflows",
    menuIcon: "📊",
    routePath: "workflows",
    sortOrder: 6,
    isDefault: true,
    descriptionText: "Executive telemetry, task transitions, and workflow ledger",
  },
  {
    menuId: "menu-onboarding",
    menuLabel: "Onboarding",
    menuIcon: "🚀",
    routePath: "onboarding",
    sortOrder: 7,
    isDefault: true,
    descriptionText: "Onboard new model providers and OAuth clients",
  },
  {
    menuId: "menu-admin-rbac",
    menuLabel: "Access / RBAC",
    menuIcon: "🛡️",
    routePath: "admin-rbac",
    sortOrder: 8,
    isDefault: true,
    descriptionText: "Role-based access control and governance matrix",
  },
]);

export class MenuRepository {
  public async listAllMenusAsync(): Promise<MenuItemRecord[]> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{
        menuId: string;
        menuLabel: string;
        menuIcon: string;
        routePath: string;
        badgeCountKey?: string;
        sortOrder: number;
        isDefault: boolean;
        requiredPermission?: string;
        descriptionText?: string;
      }>(
        `SELECT MENU_ID as "menuId",
                MENU_LABEL as "menuLabel",
                MENU_ICON as "menuIcon",
                ROUTE_PATH as "routePath",
                BADGE_COUNT_KEY as "badgeCountKey",
                SORT_ORDER as "sortOrder",
                IS_DEFAULT as "isDefault",
                REQUIRED_PERMISSION as "requiredPermission",
                DESCRIPTION_TEXT as "descriptionText"
         FROM MENUS
         ORDER BY SORT_ORDER ASC`,
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => this.mapRow(r as any));
      }
    } catch {
      // Postgres safe isolation
    }

    return this.listAllMenus();
  }

  public async listMenusForRoleAsync(roleId: string, companyId?: string): Promise<MenuItemRecord[]> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{
        menuId: string;
        menuLabel: string;
        menuIcon: string;
        routePath: string;
        badgeCountKey?: string;
        sortOrder: number;
        isDefault: boolean;
        requiredPermission?: string;
        descriptionText?: string;
      }>(
        `SELECT DISTINCT
           m.MENU_ID as "menuId", m.MENU_LABEL as "menuLabel", m.MENU_ICON as "menuIcon",
           m.ROUTE_PATH as "routePath", m.BADGE_COUNT_KEY as "badgeCountKey",
           m.SORT_ORDER as "sortOrder", m.IS_DEFAULT as "isDefault",
           m.REQUIRED_PERMISSION as "requiredPermission", m.DESCRIPTION_TEXT as "descriptionText"
         FROM MENUS m
         LEFT JOIN ROLE_MENUS rm ON m.MENU_ID = rm.MENU_ID AND rm.ROLE_ID = $1
         LEFT JOIN COMPANY_MENUS cm ON m.MENU_ID = cm.MENU_ID AND cm.COMPANY_ID = $2
         WHERE (rm.MENU_ID IS NOT NULL OR m.IS_DEFAULT = TRUE)
           AND (cm.IS_ENABLED IS NULL OR cm.IS_ENABLED = TRUE)
         ORDER BY m.SORT_ORDER ASC`,
        [roleId, companyId || "acme-corp"],
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => this.mapRow(r as any));
      }
    } catch {
      // Postgres safe isolation
    }

    return this.listMenusForRole(roleId, companyId);
  }

  public listAllMenus(): MenuItemRecord[] {
    const db = platformDatabase.getDatabase();
    const rows = db
      .prepare(
        `SELECT MENU_ID as menuId,
                MENU_LABEL as menuLabel,
                MENU_ICON as menuIcon,
                ROUTE_PATH as routePath,
                BADGE_COUNT_KEY as badgeCountKey,
                SORT_ORDER as sortOrder,
                IS_DEFAULT as isDefault,
                REQUIRED_PERMISSION as requiredPermission,
                DESCRIPTION_TEXT as descriptionText
         FROM MENUS
         ORDER BY SORT_ORDER ASC`,
      )
      .all() as Record<string, unknown>[];

    return rows.length > 0 ? rows.map((r) => this.mapRow(r)) : [...DEFAULT_SYSTEM_MENUS];
  }

  public listMenusForRole(roleId: string, companyId?: string): MenuItemRecord[] {
    const db = platformDatabase.getDatabase();
    const rows = companyId
      ? (db
          .prepare(
            `SELECT DISTINCT
              m.MENU_ID as menuId, m.MENU_LABEL as menuLabel, m.MENU_ICON as menuIcon,
              m.ROUTE_PATH as routePath, m.BADGE_COUNT_KEY as badgeCountKey,
              m.SORT_ORDER as sortOrder, m.IS_DEFAULT as isDefault,
              m.REQUIRED_PERMISSION as requiredPermission, m.DESCRIPTION_TEXT as descriptionText
            FROM MENUS m
            LEFT JOIN ROLE_MENUS rm ON m.MENU_ID = rm.MENU_ID AND rm.ROLE_ID = ?
            LEFT JOIN COMPANY_MENUS cm ON m.MENU_ID = cm.MENU_ID AND cm.COMPANY_ID = ?
            WHERE (rm.MENU_ID IS NOT NULL OR m.IS_DEFAULT = 1)
              AND (cm.IS_ENABLED IS NULL OR cm.IS_ENABLED = 1)
            ORDER BY m.SORT_ORDER ASC`,
          )
          .all(roleId, companyId) as Record<string, unknown>[])
      : (db
          .prepare(
            `SELECT DISTINCT
              m.MENU_ID as menuId, m.MENU_LABEL as menuLabel, m.MENU_ICON as menuIcon,
              m.ROUTE_PATH as routePath, m.BADGE_COUNT_KEY as badgeCountKey,
              m.SORT_ORDER as sortOrder, m.IS_DEFAULT as isDefault,
              m.REQUIRED_PERMISSION as requiredPermission, m.DESCRIPTION_TEXT as descriptionText
            FROM MENUS m
            LEFT JOIN ROLE_MENUS rm ON m.MENU_ID = rm.MENU_ID AND rm.ROLE_ID = ?
            WHERE (rm.MENU_ID IS NOT NULL OR m.IS_DEFAULT = 1)
            ORDER BY m.SORT_ORDER ASC`,
          )
          .all(roleId) as Record<string, unknown>[]);

    return rows.length > 0 ? rows.map((r) => this.mapRow(r)) : [...DEFAULT_SYSTEM_MENUS];
  }

  public listDefaultMenus(): MenuItemRecord[] {
    const db = platformDatabase.getDatabase();
    const rows = db
      .prepare(
        `SELECT MENU_ID as menuId, MENU_LABEL as menuLabel, MENU_ICON as menuIcon,
                ROUTE_PATH as routePath, BADGE_COUNT_KEY as badgeCountKey,
                SORT_ORDER as sortOrder, IS_DEFAULT as isDefault,
                REQUIRED_PERMISSION as requiredPermission, DESCRIPTION_TEXT as descriptionText
         FROM MENUS WHERE IS_DEFAULT = 1 ORDER BY SORT_ORDER ASC`,
      )
      .all() as Record<string, unknown>[];

    return rows.length > 0 ? rows.map((r) => this.mapRow(r)) : [...DEFAULT_SYSTEM_MENUS];
  }

  private mapRow(r: Record<string, unknown>): MenuItemRecord {
    const routePath = String(r.routePath);
    const rawLabel = String(r.menuLabel);
    const menuLabel =
      routePath === "model-config" &&
      (rawLabel === "Configuration" || rawLabel === "Model Configuration" || rawLabel === "Integrations")
        ? "Integration Hub"
        : rawLabel;

    return {
      menuId: String(r.menuId),
      menuLabel,
      menuIcon: routePath === "model-config" ? "🪪" : String(r.menuIcon),
      routePath,
      badgeCountKey: r.badgeCountKey ? String(r.badgeCountKey) : undefined,
      sortOrder: Number(r.sortOrder),
      isDefault: Boolean(r.isDefault),
      requiredPermission: r.requiredPermission ? String(r.requiredPermission) : undefined,
      descriptionText: r.descriptionText ? String(r.descriptionText) : undefined,
    };
  }
}

export const menuRepository = new MenuRepository();
