import type { UiUser } from "@/types/ui.types";

export const IntegrationRbacPermission = Object.freeze({
  READ: "integrations:read",
  CREATE: "integrations:create",
  UPDATE: "integrations:update",
  DELETE: "integrations:delete",
  LEGACY_MODELS_READ: "models:read",
  LEGACY_MODELS_MANAGE: "models:manage",
  LEGACY_ONBOARDING_MANAGE: "onboarding:manage",
  RBAC_MANAGE: "rbac:manage",
});

export interface IntegrationCrudAccess {
  readonly canRead: boolean;
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly canDelete: boolean;
  readonly roleId: string;
  readonly roleName: string;
  readonly accessTierLabel: string;
  readonly grantedPermissions: readonly string[];
}

const ROLE_PERMISSION_DEFAULTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  SUPER_ADMIN: [
    IntegrationRbacPermission.READ,
    IntegrationRbacPermission.CREATE,
    IntegrationRbacPermission.UPDATE,
    IntegrationRbacPermission.DELETE,
    IntegrationRbacPermission.RBAC_MANAGE,
  ],
  "role-admin": [
    IntegrationRbacPermission.READ,
    IntegrationRbacPermission.CREATE,
    IntegrationRbacPermission.UPDATE,
    IntegrationRbacPermission.DELETE,
    IntegrationRbacPermission.RBAC_MANAGE,
  ],
  "role-mlops": [
    IntegrationRbacPermission.READ,
    IntegrationRbacPermission.CREATE,
    IntegrationRbacPermission.UPDATE,
    IntegrationRbacPermission.DELETE,
  ],
  "role-developer": [
    IntegrationRbacPermission.READ,
    IntegrationRbacPermission.CREATE,
    IntegrationRbacPermission.UPDATE,
  ],
  "role-viewer": [IntegrationRbacPermission.READ],
});

function resolveEffectivePermissionSet(
  user: Pick<UiUser, "roleId" | "permissions"> | null | undefined,
): Set<string> {
  if (!user) return new Set<string>();
  const explicit = user.permissions || [];
  if (explicit.length > 0) {
    return new Set(explicit);
  }
  const roleDefaults = ROLE_PERMISSION_DEFAULTS[user.roleId] ?? [];
  return new Set(roleDefaults);
}

function resolveAccessTierLabel(canCreate: boolean, canUpdate: boolean, canDelete: boolean, canRead: boolean): string {
  if (canCreate && canUpdate && canDelete) return "Full CRUD";
  if (canCreate && canUpdate) return "Create · Read · Update";
  if (canRead) return "Read-Only";
  return "Restricted";
}

export function resolveIntegrationCrudPermissions(
  user: Pick<UiUser, "roleId" | "roleName" | "permissions"> | null | undefined,
): IntegrationCrudAccess {
  const permSet = resolveEffectivePermissionSet(user);
  const canRead =
    permSet.has(IntegrationRbacPermission.READ) ||
    permSet.has(IntegrationRbacPermission.LEGACY_MODELS_READ);
  const canCreate =
    permSet.has(IntegrationRbacPermission.CREATE) ||
    permSet.has(IntegrationRbacPermission.LEGACY_ONBOARDING_MANAGE) ||
    permSet.has(IntegrationRbacPermission.LEGACY_MODELS_MANAGE);
  const canUpdate =
    permSet.has(IntegrationRbacPermission.UPDATE) ||
    permSet.has(IntegrationRbacPermission.LEGACY_MODELS_MANAGE);
  const canDelete =
    permSet.has(IntegrationRbacPermission.DELETE) ||
    permSet.has(IntegrationRbacPermission.LEGACY_MODELS_MANAGE);

  return {
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    roleId: user?.roleId || "anonymous",
    roleName: user?.roleName || "Guest",
    accessTierLabel: resolveAccessTierLabel(canCreate, canUpdate, canDelete, canRead),
    grantedPermissions: Array.from(permSet),
  };
}

