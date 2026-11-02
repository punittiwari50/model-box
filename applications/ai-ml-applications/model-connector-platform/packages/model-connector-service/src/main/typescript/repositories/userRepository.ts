import { platformDatabase } from "@/database/platformDatabase";
import { PaginationQueryGuard } from "@/database/PaginationQueryGuard";

export interface UserRecord {
  readonly userId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly fullName: string;
  readonly userEmail: string;
  readonly passwordHash: string;
  readonly avatarUrl: string;
  readonly isActive: boolean;
  readonly createdTimestamp: string;
}

const DEFAULT_SYSTEM_USER: UserRecord = Object.freeze({
  userId: "usr-admin",
  companyId: "comp-platform",
  companyName: "Model Connector Platform",
  roleId: "role-admin",
  roleName: "Platform Administrator",
  fullName: "Platform Administrator",
  userEmail: "admin@model-connector.local",
  passwordHash: "",
  avatarUrl: "👤",
  isActive: true,
  createdTimestamp: "2026-01-01T00:00:00.000Z",
});

export class UserRepository {
  public findByEmail(email: string): UserRecord | undefined {
    const db = platformDatabase.getDatabase();
    const row = db
      .prepare(
        `SELECT u.USER_ID as userId,
                u.COMPANY_ID as companyId,
                c.COMPANY_NAME as companyName,
                u.ROLE_ID as roleId,
                r.ROLE_NAME as roleName,
                u.FULL_NAME as fullName,
                u.USER_EMAIL as userEmail,
                u.PASSWORD_HASH as passwordHash,
                u.AVATAR_URL as avatarUrl,
                u.IS_ACTIVE as isActive,
                u.CREATED_TIMESTAMP as createdTimestamp
         FROM USERS u
         JOIN COMPANIES c ON u.COMPANY_ID = c.COMPANY_ID
         JOIN ROLES r ON u.ROLE_ID = r.ROLE_ID
         WHERE LOWER(u.USER_EMAIL) = LOWER(?) AND u.IS_ACTIVE = 1`,
      )
      .get(email) as Record<string, unknown> | undefined;

    if (row) {
      return this.mapRow(row);
    }
    return email.toLowerCase() === DEFAULT_SYSTEM_USER.userEmail ? DEFAULT_SYSTEM_USER : undefined;
  }

  public findById(userId: string): UserRecord | undefined {
    const db = platformDatabase.getDatabase();
    const row = db
      .prepare(
        `SELECT u.USER_ID as userId,
                u.COMPANY_ID as companyId,
                c.COMPANY_NAME as companyName,
                u.ROLE_ID as roleId,
                r.ROLE_NAME as roleName,
                u.FULL_NAME as fullName,
                u.USER_EMAIL as userEmail,
                u.PASSWORD_HASH as passwordHash,
                u.AVATAR_URL as avatarUrl,
                u.IS_ACTIVE as isActive,
                u.CREATED_TIMESTAMP as createdTimestamp
         FROM USERS u
         JOIN COMPANIES c ON u.COMPANY_ID = c.COMPANY_ID
         JOIN ROLES r ON u.ROLE_ID = r.ROLE_ID
         WHERE u.USER_ID = ?`,
      )
      .get(userId) as Record<string, unknown> | undefined;

    if (row) {
      return this.mapRow(row);
    }
    return userId === DEFAULT_SYSTEM_USER.userId ? DEFAULT_SYSTEM_USER : undefined;
  }

  public listUsers(limit?: number, offset?: number): UserRecord[] {
    const { limit: safeLimit, offset: safeOffset } = PaginationQueryGuard.resolveCriteria(
      limit,
      offset,
    );
    const db = platformDatabase.getDatabase();
    const rows = db
      .prepare(
        `SELECT u.USER_ID as userId,
                u.COMPANY_ID as companyId,
                c.COMPANY_NAME as companyName,
                u.ROLE_ID as roleId,
                r.ROLE_NAME as roleName,
                u.FULL_NAME as fullName,
                u.USER_EMAIL as userEmail,
                u.PASSWORD_HASH as passwordHash,
                u.AVATAR_URL as avatarUrl,
                u.IS_ACTIVE as isActive,
                u.CREATED_TIMESTAMP as createdTimestamp
         FROM USERS u
         JOIN COMPANIES c ON u.COMPANY_ID = c.COMPANY_ID
         JOIN ROLES r ON u.ROLE_ID = r.ROLE_ID
         ORDER BY c.COMPANY_NAME ASC, u.FULL_NAME ASC
         LIMIT ? OFFSET ?`,
      )
      .all(safeLimit, safeOffset) as Record<string, unknown>[];

    return rows.length > 0 ? rows.map((r) => this.mapRow(r)) : [DEFAULT_SYSTEM_USER];
  }

  private mapRow(r: Record<string, unknown>): UserRecord {
    return {
      userId: String(r.userId),
      companyId: String(r.companyId),
      companyName: String(r.companyName),
      roleId: String(r.roleId),
      roleName: String(r.roleName),
      fullName: String(r.fullName),
      userEmail: String(r.userEmail),
      passwordHash: String(r.passwordHash),
      avatarUrl: String(r.avatarUrl || "👤"),
      isActive: Boolean(r.isActive),
      createdTimestamp: String(r.createdTimestamp),
    };
  }
}

export const userRepository = new UserRepository();
