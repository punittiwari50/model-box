import type { Request, Response } from "express";
import { authService } from "@/services/authService";
import { userRepository } from "@/repositories/userRepository";
import { HttpStatus } from "@/constants/index";

export class AuthController {
  public login(req: Request, res: Response): void {
    const { email, password } = req.body || {};

    if (!email || !password) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Email and password are required.",
        correlationId: req.correlationId,
      });
      return;
    }

    const authResult = authService.authenticate(email, password);

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

  public getMe(req: Request, res: Response): void {
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    let userId = req.query.userId as string | undefined;

    if (!userId && token) {
      const parsed = authService.parseToken(token);
      if (parsed) userId = parsed.userId;
    }

    // Default to admin user if not authenticated
    const targetUserId = userId || "usr-admin";
    const profile = authService.getUserProfile(targetUserId);

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

  public listDemoUsers(req: Request, res: Response): void {
    const users = userRepository.listUsers();
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
      users: demoAccounts,
      correlationId: req.correlationId,
    });
  }
}

export const authController = new AuthController();
