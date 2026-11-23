import type { Request, Response } from "express";
import { menuRepository } from "@/repositories/menuRepository";
import { rbacRepository } from "@/repositories/rbacRepository";
import { authService } from "@/services/authService";
import { HttpStatus } from "@/constants/index";

export class MenuController {
  public async getMenus(req: Request, res: Response): Promise<void> {
    let roleId = req.query.roleId as string | undefined;
    let companyId = req.query.companyId as string | undefined;

    // Check bearer token if parameters omitted
    const authHeader = req.headers.authorization;
    if ((!roleId || !companyId) && authHeader && authHeader.startsWith("Bearer ")) {
      const parsed = authService.parseToken(authHeader.slice(7));
      if (parsed) {
        if (!roleId) roleId = parsed.roleId;
        if (!companyId) companyId = parsed.companyId;
      }
    }

    // Default to SUPER_ADMIN if unauthenticated
    const activeRole = roleId || "SUPER_ADMIN";
    const activeCompany = companyId || "acme-corp";

    const menus = await menuRepository.listMenusForRoleAsync(activeRole, activeCompany);

    res.status(HttpStatus.OK).json({
      success: true,
      roleId: activeRole,
      companyId: activeCompany,
      count: menus.length,
      menus,
      correlationId: req.correlationId,
    });
  }

  public async getAllMenus(req: Request, res: Response): Promise<void> {
    const menus = await menuRepository.listAllMenusAsync();
    res.status(HttpStatus.OK).json({
      success: true,
      count: menus.length,
      menus,
      correlationId: req.correlationId,
    });
  }

  public async getRbacMatrix(req: Request, res: Response): Promise<void> {
    const companies = await rbacRepository.listCompaniesAsync();
    const roles = await rbacRepository.listRolesAsync();
    const permissions = await rbacRepository.listAllPermissionsAsync();
    const allMenus = await menuRepository.listAllMenusAsync();

    const roleMatrices = await Promise.all(
      roles.map(async (role) => {
        const roleMenus = await menuRepository.listMenusForRoleAsync(role.roleId);
        const rolePermissions = await rbacRepository.getPermissionsForRoleAsync(role.roleId);
        return {
          ...role,
          menus: roleMenus,
          permissions: rolePermissions,
        };
      }),
    );

    res.status(HttpStatus.OK).json({
      success: true,
      companies,
      roles: roleMatrices,
      permissions,
      allMenus,
      correlationId: req.correlationId,
    });
  }
}

export const menuController = new MenuController();
