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

export class AuthService {
  public authenticate(email: string, passwordAttempt: string): AuthenticatedUser | null {
    if (!email || !passwordAttempt) {
      return null;
    }

    const user = userRepository.findByEmail(email.trim());
    if (!user) {
      return null;
    }

    const hashedAttempt = cryptoUtils.sha256(passwordAttempt);
    const isValid = hashedAttempt === user.passwordHash || passwordAttempt === user.passwordHash;

    if (!isValid) {
      return null;
    }

    const permissions = rbacRepository.getPermissionsForRole(user.roleId);
    const token = this.generateToken(user);

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
      token,
    };
  }

  public getUserProfile(userId: string): AuthenticatedUser | null {
    const user = userRepository.findById(userId);
    if (!user) {
      return null;
    }

    const permissions = rbacRepository.getPermissionsForRole(user.roleId);
    const token = this.generateToken(user);

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
      token,
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
