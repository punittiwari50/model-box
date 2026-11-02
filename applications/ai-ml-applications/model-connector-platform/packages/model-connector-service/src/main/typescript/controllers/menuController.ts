import type { Request, Response } from "express";
import { menuRepository } from "@/repositories/menuRepository";
import { rbacRepository } from "@/repositories/rbacRepository";
import { authService } from "@/services/authService";
import { HttpStatus } from "@/constants/index";

export class MenuController {
  public getMenus(req: Request, res: Response): void {
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

    const menus = menuRepository.listMenusForRole(activeRole, activeCompany);

    res.status(HttpStatus.OK).json({
      success: true,
      roleId: activeRole,
      companyId: activeCompany,
      count: menus.length,
      menus,
      correlationId: req.correlationId,
    });
  }

  public getAllMenus(req: Request, res: Response): void {
    const menus = menuRepository.listAllMenus();
    res.status(HttpStatus.OK).json({
      success: true,
      count: menus.length,
      menus,
      correlationId: req.correlationId,
    });
  }

  public getRbacMatrix(req: Request, res: Response): void {
    const companies = rbacRepository.listCompanies();
    const roles = rbacRepository.listRoles();
    const permissions = rbacRepository.listAllPermissions();
    const allMenus = menuRepository.listAllMenus();

    const roleMatrices = roles.map((role) => {
      const roleMenus = menuRepository.listMenusForRole(role.roleId);
      const rolePermissions = rbacRepository.getPermissionsForRole(role.roleId);
      return {
        ...role,
        menus: roleMenus,
        permissions: rolePermissions,
      };
    });

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
