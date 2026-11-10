import { platformDatabase } from "@/database/platformDatabase";

export interface CompanyRecord {
  readonly companyId: string;
  readonly companyName: string;
  readonly companyDomain: string;
  readonly subscriptionTier: string;
  readonly isActive: boolean;
}

export interface RoleRecord {
  readonly roleId: string;
  readonly roleName: string;
  readonly roleDescription: string;
  readonly isSystemRole: boolean;
}

export interface PermissionRecord {
  readonly permissionId: string;
  readonly permissionCode: string;
  readonly resourceName: string;
  readonly actionName: string;
  readonly descriptionText: string;
}

export class RbacRepository {
  public async listCompaniesAsync(): Promise<CompanyRecord[]> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{
        companyId: string;
        companyName: string;
        companyDomain: string;
        subscriptionTier: string;
        isActive: boolean;
      }>(
        `SELECT COMPANY_ID as "companyId",
                COMPANY_NAME as "companyName",
                COMPANY_DOMAIN as "companyDomain",
                SUBSCRIPTION_TIER as "subscriptionTier",
                IS_ACTIVE as "isActive"
         FROM COMPANIES
         ORDER BY COMPANY_NAME ASC`,
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          companyId: String(r.companyId),
          companyName: String(r.companyName),
          companyDomain: String(r.companyDomain),
          subscriptionTier: String(r.subscriptionTier),
          isActive: Boolean(r.isActive),
        }));
      }
    } catch {
      // Postgres safe isolation
    }
    return this.listCompanies();
  }

  public async listRolesAsync(): Promise<RoleRecord[]> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{
        roleId: string;
        roleName: string;
        roleDescription: string;
        isSystemRole: boolean;
      }>(
        `SELECT ROLE_ID as "roleId",
                ROLE_NAME as "roleName",
                ROLE_DESCRIPTION as "roleDescription",
                IS_SYSTEM_ROLE as "isSystemRole"
         FROM ROLES
         ORDER BY ROLE_ID ASC`,
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          roleId: String(r.roleId),
          roleName: String(r.roleName),
          roleDescription: String(r.roleDescription),
          isSystemRole: Boolean(r.isSystemRole),
        }));
      }
    } catch {
      // Postgres safe isolation
    }
    return this.listRoles();
  }

  public async getPermissionsForRoleAsync(roleId: string): Promise<string[]> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{ permissionCode: string }>(
        `SELECT p.PERMISSION_CODE as "permissionCode"
         FROM PERMISSIONS p
         JOIN ROLE_PERMISSIONS rp ON p.PERMISSION_ID = rp.PERMISSION_ID
         WHERE rp.ROLE_ID = $1
         ORDER BY p.PERMISSION_CODE ASC`,
        [roleId],
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => r.permissionCode);
      }
    } catch {
      // Postgres safe isolation
    }
    return this.getPermissionsForRole(roleId);
  }

  public async listAllPermissionsAsync(): Promise<PermissionRecord[]> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{
        permissionId: string;
        permissionCode: string;
        resourceName: string;
        actionName: string;
        descriptionText: string;
      }>(
        `SELECT PERMISSION_ID as "permissionId",
                PERMISSION_CODE as "permissionCode",
                RESOURCE_NAME as "resourceName",
                ACTION_NAME as "actionName",
                DESCRIPTION_TEXT as "descriptionText"
         FROM PERMISSIONS
         ORDER BY PERMISSION_CODE ASC`,
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          permissionId: String(r.permissionId),
          permissionCode: String(r.permissionCode),
          resourceName: String(r.resourceName),
          actionName: String(r.actionName),
          descriptionText: String(r.descriptionText),
        }));
      }
    } catch {
      // Postgres safe isolation
    }
    return this.listAllPermissions();
  }

  public listCompanies(): CompanyRecord[] {
    const db = platformDatabase.getDatabase();
    const rows = db
      .prepare(
        `SELECT COMPANY_ID as companyId,
                COMPANY_NAME as companyName,
                COMPANY_DOMAIN as companyDomain,
                SUBSCRIPTION_TIER as subscriptionTier,
                IS_ACTIVE as isActive
         FROM COMPANIES
         ORDER BY COMPANY_NAME ASC`,
      )
      .all() as any[];

    return rows.map((r) => ({
      companyId: String(r.companyId),
      companyName: String(r.companyName),
      companyDomain: String(r.companyDomain),
      subscriptionTier: String(r.subscriptionTier),
      isActive: Boolean(r.isActive),
    }));
  }

  public listRoles(): RoleRecord[] {
    const db = platformDatabase.getDatabase();
    const rows = db
      .prepare(
        `SELECT ROLE_ID as roleId,
                ROLE_NAME as roleName,
                ROLE_DESCRIPTION as roleDescription,
                IS_SYSTEM_ROLE as isSystemRole
         FROM ROLES
         ORDER BY ROLE_ID ASC`,
      )
      .all() as any[];

    return rows.map((r) => ({
      roleId: String(r.roleId),
      roleName: String(r.roleName),
      roleDescription: String(r.roleDescription),
      isSystemRole: Boolean(r.isSystemRole),
    }));
  }

  public getPermissionsForRole(roleId: string): string[] {
    const db = platformDatabase.getDatabase();
    const rows = db
      .prepare(
        `SELECT p.PERMISSION_CODE as permissionCode
         FROM PERMISSIONS p
         JOIN ROLE_PERMISSIONS rp ON p.PERMISSION_ID = rp.PERMISSION_ID
         WHERE rp.ROLE_ID = ?
         ORDER BY p.PERMISSION_CODE ASC`,
      )
      .all(roleId) as { permissionCode: string }[];

    return rows.map((r) => r.permissionCode);
  }

  public listAllPermissions(): PermissionRecord[] {
    const db = platformDatabase.getDatabase();
    const rows = db
      .prepare(
        `SELECT PERMISSION_ID as permissionId,
                PERMISSION_CODE as permissionCode,
                RESOURCE_NAME as resourceName,
                ACTION_NAME as actionName,
                DESCRIPTION_TEXT as descriptionText
         FROM PERMISSIONS
         ORDER BY PERMISSION_CODE ASC`,
      )
      .all() as any[];

    return rows.map((r) => ({
      permissionId: String(r.permissionId),
      permissionCode: String(r.permissionCode),
      resourceName: String(r.resourceName),
      actionName: String(r.actionName),
      descriptionText: String(r.descriptionText),
    }));
  }
}

export const rbacRepository = new RbacRepository();
