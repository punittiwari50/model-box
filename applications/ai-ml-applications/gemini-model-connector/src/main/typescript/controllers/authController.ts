import type { Request, Response } from "express";
import { container } from "@/core/context/appContext.js";
import type { AuthService } from "@/services/auth/authService.js";
import { config } from "@/core/config/index.js";
import { HttpStatus, ModelCatalog } from "@/domain/constants/index.js";
import { authTypeResolver } from "@/core/adapters/auth/index.js";
import {
  getClientIp,
  getRouteParam,
  sendJsonResponse,
  sendJsonError,
} from "@/core/web/helper/responseHelper.js";

/**
 * Controller managing model authentication and distributed OAuth flows.
 * Conforms to STD-COD-006 (Low Cognitive Complexity, nesting depth <= 2, functions <= 20 lines).
 */
export class AuthController {
  private readonly authService: AuthService;

  constructor(service?: AuthService) {
    this.authService = service || container.getAuthService();
  }

  public async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const status = await this.authService.getStatus();
      sendJsonResponse(res, HttpStatus.OK, status);
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || "Failed to retrieve auth status.",
      );
    }
  }

  public async initiateLogin(req: Request, res: Response): Promise<void> {
    try {
      const model = (req.query.model as string) || ModelCatalog.DEFAULT;
      const shouldRedirect =
        req.query.redirect === "true" ||
        Boolean(req.headers.accept?.includes("text/html"));
      const isUserCode = req.query.user_code === "true";
      const redirectOverride = isUserCode
        ? config.geminiOAuthUserCodeUri
        : undefined;

      const result = await this.authService.initiateAuth(
        model,
        !shouldRedirect,
        redirectOverride,
      );
      if (shouldRedirect) {
        res.redirect(result.auth_url);
        return;
      }
      sendJsonResponse(res, HttpStatus.OK, result);
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || "Failed to initiate login.",
      );
    }
  }

  /**
   * Dynamic model/provider redirect eliminating static /auth/google.
   * Strips all potential PII or untrusted parameters; passes strictly allowlisted non-PII params.
   */
  public redirectToProvider(req: Request, res: Response): void {
    const provider = getRouteParam(req.params.provider);
    const safeParams = new URLSearchParams();
    safeParams.set("model", (req.query.model as string) || provider);
    if (req.query.redirect === "true") {
      safeParams.set("redirect", "true");
    }
    if (req.query.user_code === "true") {
      safeParams.set("user_code", "true");
    }
    res.redirect(
      HttpStatus.TEMPORARY_REDIRECT,
      `/api/v1/auth/login?${safeParams.toString()}`,
    );
  }

  public async directLogin(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.body;
      if (code) {
        await this.handleCodeLogin(req, res);
        return;
      }

      const effectiveToken = req.body.token || req.body.api_key;
      if (effectiveToken) {
        await this.handleTokenLogin(req, res, effectiveToken);
        return;
      }

      const model = req.body.model || ModelCatalog.DEFAULT;
      const result = await this.authService.initiateAuth(
        model,
        req.body.launch_browser !== false,
      );
      sendJsonResponse(res, HttpStatus.OK, result);
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || "Failed to process login.",
      );
    }
  }

  public async handleOAuthCallback(req: Request, res: Response): Promise<void> {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code) {
        res
          .status(HttpStatus.BAD_REQUEST)
          .send("OAuth authorization code missing.");
        return;
      }

      const auth = await this.authService.handleOAuthCallback(
        code,
        state || "",
        getClientIp(req),
      );
      if (req.headers.accept?.includes("text/html")) {
        // Zero-PII redirect: never leak account_email, username, or credentials in the URL
        const queryParams = `auth=success&model=${encodeURIComponent(auth.model)}`;
        res.redirect(`/?${queryParams}`);
        return;
      }
      sendJsonResponse(res, HttpStatus.OK, {
        success: true,
        message: `Successfully authenticated for model '${auth.model}'.`,
        auth,
      });
    } catch (error: any) {
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send(`Authentication failed: ${error.message}`);
    }
  }

  public async logout(req: Request, res: Response): Promise<void> {
    try {
      const { model, id, account_email, all } = req.body || {};
      const result = await this.authService.logout(
        { model, id, account_email, all },
        getClientIp(req),
      );
      sendJsonResponse(res, HttpStatus.OK, result);
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || "Failed to logout model(s).",
      );
    }
  }

  public async switchActiveSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, id, session_id, model } = req.body || {};
      const targetId = sessionId || id || session_id;
      if (!targetId) {
        sendJsonError(
          res,
          HttpStatus.BAD_REQUEST,
          "Missing required sessionId parameter.",
        );
        return;
      }
      const result = await this.authService.switchSession(
        targetId,
        model,
        getClientIp(req),
      );
      if (!result.success) {
        sendJsonError(res, HttpStatus.NOT_FOUND, result.message);
        return;
      }
      sendJsonResponse(res, HttpStatus.OK, result);
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || "Failed to switch active session.",
      );
    }
  }

  public async logoutModelParam(req: Request, res: Response): Promise<void> {
    try {
      const model = getRouteParam(req.params.model);
      const result = await this.authService.logout({ model }, getClientIp(req));
      sendJsonResponse(res, HttpStatus.OK, result);
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || `Failed to logout model '${req.params.model}'.`,
      );
    }
  }

  private async handleCodeLogin(req: Request, res: Response): Promise<void> {
    const {
      code,
      state,
      redirect_uri,
      code_verifier,
      model = ModelCatalog.DEFAULT,
    } = req.body;
    const auth = await this.authService.handleOAuthCallback(
      code,
      state,
      getClientIp(req),
      redirect_uri || config.geminiOAuthUserCodeUri,
      code_verifier,
    );
    sendJsonResponse(res, HttpStatus.OK, {
      success: true,
      message: `Model '${model}' successfully authenticated via OAuth code.`,
      auth,
    });
  }

  private async handleTokenLogin(
    req: Request,
    res: Response,
    effectiveToken: string,
  ): Promise<void> {
    const {
      model = ModelCatalog.DEFAULT,
      email,
      account_email,
      account_id,
      id,
      auth_type,
    } = req.body;
    const resolvedEmail = email || account_email || account_id;
    const resolvedAuthType = authTypeResolver.resolveAuthType({
      model,
      token: effectiveToken,
      explicitAuthType: auth_type,
    });
    const saved = await this.authService.loginWithCredentials(
      model,
      effectiveToken,
      resolvedEmail,
      resolvedAuthType,
      getClientIp(req),
      id || account_id,
    );
    sendJsonResponse(res, HttpStatus.OK, {
      success: true,
      message: `Model '${model}' successfully authenticated with ${resolvedAuthType}.`,
      auth: saved,
    });
  }
}

export const authController = new AuthController();
