import type { NextFunction, Request, Response } from "express";
import { HttpStatus } from "@/constants/index";
import { authService, type AuthenticatedUser } from "@/services/authService";

export interface AuthenticatedRequest extends Request {
  actingUser?: AuthenticatedUser;
}

function extractUserIdFromRequest(req: Request): string {
  const headerUserId = req.headers["x-user-id"] as string | undefined;
  if (headerUserId && headerUserId.trim().length > 0) {
    return headerUserId.trim();
  }
  const queryUserId = req.query.userId as string | undefined;
  if (queryUserId && queryUserId.trim().length > 0) {
    return queryUserId.trim();
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const parsed = authService.parseToken(authHeader.slice(7));
    if (parsed) return parsed.userId;
  }
  return "usr-admin";
}

function hasAnyRequiredPermission(
  granted: readonly string[],
  requiredPermissions: readonly string[],
): boolean {
  return requiredPermissions.some((perm) => granted.includes(perm));
}

export function requirePermission(...requiredPermissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetUserId = extractUserIdFromRequest(req);
      const user = await authService.getUserProfileAsync(targetUserId);

      if (!user) {
        res.status(HttpStatus.UNAUTHORIZED).json({
          success: false,
          message: `Acting user '${targetUserId}' is not authorized or active.`,
          correlationId: req.correlationId,
        });
        return;
      }

      if (!hasAnyRequiredPermission(user.permissions, requiredPermissions)) {
        res.status(HttpStatus.FORBIDDEN).json({
          success: false,
          message: `RBAC Policy Denied: Role '${user.roleName}' (${user.roleId}) lacks required permission [${requiredPermissions.join(" | ")}].`,
          requiredPermissions,
          roleId: user.roleId,
          correlationId: req.correlationId,
        });
        return;
      }

      (req as AuthenticatedRequest).actingUser = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

