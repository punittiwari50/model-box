import { cryptoUtils } from "@model-box/model-connector-core";
import { userRepository, type UserRecord } from "@/repositories/userRepository";
import { rbacRepository } from "@/repositories/rbacRepository";

export interface AuthenticatedUser {
  readonly userId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly fullName: string;
  readonly userEmail: string;
  readonly avatarUrl: string;
  readonly permissions: readonly string[];
  readonly token: string;
}

const CANONICAL_ROLE_PERMISSION_FALLBACKS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  SUPER_ADMIN: [
    "chat:read", "chat:write", "models:read", "models:manage",
    "sessions:read", "sessions:manage", "telemetry:read", "rbac:manage", "onboarding:manage",
    "integrations:read", "integrations:create", "integrations:update", "integrations:delete",
  ],
  "role-admin": [
    "chat:read", "chat:write", "models:read", "models:manage",
    "sessions:read", "sessions:manage", "telemetry:read", "rbac:manage", "onboarding:manage",
    "integrations:read", "integrations:create", "integrations:update", "integrations:delete",
  ],
  "role-mlops": [
    "chat:read", "chat:write", "models:read", "models:manage",
    "sessions:read", "sessions:manage", "telemetry:read", "onboarding:manage",
    "integrations:read", "integrations:create", "integrations:update", "integrations:delete",
  ],
  "role-developer": [
    "chat:read", "chat:write", "models:read",
    "sessions:read", "sessions:manage", "telemetry:read",
    "integrations:read", "integrations:create", "integrations:update",
  ],
  "role-viewer": [
    "chat:read", "models:read", "sessions:read", "telemetry:read", "integrations:read",
  ],
});

export class AuthService {
  public async authenticateAsync(email: string, passwordAttempt: string): Promise<AuthenticatedUser | null> {
    if (!email || !passwordAttempt) return null;
    const user = await userRepository.findByEmailAsync(email.trim());
    if (!user || !this.isPasswordValid(passwordAttempt, user.passwordHash)) {
      return null;
    }
    const permissions = await this.resolvePermissionsAsync(user.roleId);
    return this.buildAuthenticatedUser(user, permissions);
  }

  public authenticate(email: string, passwordAttempt: string): AuthenticatedUser | null {
    if (!email || !passwordAttempt) return null;
    const user = userRepository.findByEmail(email.trim());
    if (!user || !this.isPasswordValid(passwordAttempt, user.passwordHash)) {
      return null;
    }
    const permissions = this.resolvePermissionsSync(user.roleId);
    return this.buildAuthenticatedUser(user, permissions);
  }

  public async getUserProfileAsync(userId: string): Promise<AuthenticatedUser | null> {
    const user = await userRepository.findByIdAsync(userId);
    if (!user) return null;
    const permissions = await this.resolvePermissionsAsync(user.roleId);
    return this.buildAuthenticatedUser(user, permissions);
  }

  public getUserProfile(userId: string): AuthenticatedUser | null {
    const user = userRepository.findById(userId);
    if (!user) return null;
    const permissions = this.resolvePermissionsSync(user.roleId);
    return this.buildAuthenticatedUser(user, permissions);
  }

  private isPasswordValid(passwordAttempt: string, storedHash: string): boolean {
    const hashedAttempt = cryptoUtils.sha256(passwordAttempt);
    return hashedAttempt === storedHash || passwordAttempt === storedHash;
  }

  private async resolvePermissionsAsync(roleId: string): Promise<readonly string[]> {
    const dbPermissions = await rbacRepository.getPermissionsForRoleAsync(roleId);
    if (dbPermissions.length > 0) return dbPermissions;
    return CANONICAL_ROLE_PERMISSION_FALLBACKS[roleId] ?? [];
  }

  private resolvePermissionsSync(roleId: string): readonly string[] {
    const dbPermissions = rbacRepository.getPermissionsForRole(roleId);
    if (dbPermissions.length > 0) return dbPermissions;
    return CANONICAL_ROLE_PERMISSION_FALLBACKS[roleId] ?? [];
  }

  private buildAuthenticatedUser(user: UserRecord, permissions: readonly string[]): AuthenticatedUser {
    return {
      userId: user.userId,
      companyId: user.companyId,
      companyName: user.companyName,
      roleId: user.roleId,
      roleName: user.roleName,
      fullName: user.fullName,
      userEmail: user.userEmail,
      avatarUrl: user.avatarUrl,
      permissions,
      token: this.generateToken(user),
    };
  }

  private generateToken(user: UserRecord): string {
    const payload = `${user.userId}:${user.companyId}:${user.roleId}:${Date.now()}`;
    return Buffer.from(payload).toString("base64");
  }

  public parseToken(token: string): { userId: string; companyId: string; roleId: string } | null {
    try {
      const decoded = Buffer.from(token, "base64").toString("utf-8");
      const [userId, companyId, roleId] = decoded.split(":");
      if (!userId || !companyId || !roleId) return null;
      return { userId, companyId, roleId };
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();
