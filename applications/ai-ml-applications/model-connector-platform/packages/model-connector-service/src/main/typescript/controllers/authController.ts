import type { Request, Response } from "express";
import { authService } from "@/services/authService";
import { userRepository } from "@/repositories/userRepository";
import { HttpStatus } from "@/constants/index";

export class AuthController {
  public async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body || {};

    if (!email || !password) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Email and password are required.",
        correlationId: req.correlationId,
      });
      return;
    }

    const authResult = await authService.authenticateAsync(email, password);

    if (!authResult) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        success: false,
        message: "Invalid credentials. Please verify your email and password.",
        correlationId: req.correlationId,
      });
      return;
    }

    res.status(HttpStatus.OK).json({
      success: true,
      message: `Welcome back, ${authResult.fullName}!`,
      user: authResult,
      correlationId: req.correlationId,
    });
  }

  public async getMe(req: Request, res: Response): Promise<void> {
    const targetUserId = this.resolveTargetUserId(req);
    const profile = await authService.getUserProfileAsync(targetUserId);

    if (!profile) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: "User profile not found.",
        correlationId: req.correlationId,
      });
      return;
    }

    res.status(HttpStatus.OK).json({
      success: true,
      user: profile,
      correlationId: req.correlationId,
    });
  }

  private resolveTargetUserId(req: Request): string {
    const queryUserId = req.query.userId as string | undefined;
    if (queryUserId) return queryUserId;

    const headerUserId = req.headers["x-user-id"] as string | undefined;
    if (headerUserId) return headerUserId;

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (token) {
      const parsed = authService.parseToken(token);
      if (parsed) return parsed.userId;
    }

    return "usr-admin";
  }

  public async listDemoUsers(req: Request, res: Response): Promise<void> {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const users = await userRepository.listUsersAsync(limit, offset);
    const demoAccounts = users.map((u) => {
      return {
        userId: u.userId,
        fullName: u.fullName,
        userEmail: u.userEmail,
        companyId: u.companyId,
        companyName: u.companyName,
        roleId: u.roleId,
        roleName: u.roleName,
        avatarUrl: u.avatarUrl,
      };
    });

    res.status(HttpStatus.OK).json({
      success: true,
      count: demoAccounts.length,
      users: demoAccounts,
      correlationId: req.correlationId,
    });
  }
}

export const authController = new AuthController();
