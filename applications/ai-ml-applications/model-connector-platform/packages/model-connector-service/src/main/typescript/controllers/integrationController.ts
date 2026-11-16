import type { Response } from "express";
import { HttpStatus } from "@/constants/index";
import { integrationRepository, type UpsertIntegrationInput } from "@/repositories/integrationRepository";
import type { AuthenticatedRequest } from "@/middleware/rbacMiddleware";

export class IntegrationController {
  public async listIntegrations(req: AuthenticatedRequest, res: Response): Promise<void> {
    const integrations = await integrationRepository.listAllAsync();
    res.status(HttpStatus.OK).json({
      success: true,
      count: integrations.length,
      integrations,
      correlationId: req.correlationId,
    });
  }

  public async createIntegration(req: AuthenticatedRequest, res: Response): Promise<void> {
    const payload = this.parsePayload(req);
    if (!payload.integrationId || !payload.providerName) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Both 'integrationId' and 'providerName' are required to onboard an integration.",
        correlationId: req.correlationId,
      });
      return;
    }

    const existing = await integrationRepository.findByIdAsync(payload.integrationId);
    if (existing) {
      res.status(HttpStatus.CONFLICT ?? 409).json({
        success: false,
        message: `Integration '${payload.integrationId}' already exists. Use update instead.`,
        correlationId: req.correlationId,
      });
      return;
    }

    const created = await integrationRepository.createAsync(payload);
    res.status(HttpStatus.CREATED).json({
      success: true,
      integration: created,
      correlationId: req.correlationId,
    });
  }

  public async updateIntegration(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { integrationId } = req.params;
    const payload = this.parsePayload(req, integrationId);
    const updated = await integrationRepository.updateAsync(integrationId, payload);

    if (!updated) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: `Integration '${integrationId}' not found.`,
        correlationId: req.correlationId,
      });
      return;
    }

    res.status(HttpStatus.OK).json({
      success: true,
      integration: updated,
      correlationId: req.correlationId,
    });
  }

  public async deleteIntegration(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { integrationId } = req.params;
    const deleted = await integrationRepository.deleteAsync(integrationId);

    if (!deleted) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: `Integration '${integrationId}' not found.`,
        correlationId: req.correlationId,
      });
      return;
    }

    res.status(HttpStatus.OK).json({
      success: true,
      integrationId,
      deleted: true,
      correlationId: req.correlationId,
    });
  }

  private parsePayload(req: AuthenticatedRequest, paramId?: string): UpsertIntegrationInput {
    const body = (req.body || {}) as Record<string, unknown>;
    const rawProtocols = Array.isArray(body.supportedProtocols)
      ? body.supportedProtocols.map(String)
      : ["api"];
    const rawCapabilities = Array.isArray(body.capabilities)
      ? body.capabilities.map(String)
      : [];

    return {
      integrationId: paramId || String(body.integrationId || "").trim().toLowerCase(),
      providerName: String(body.providerName || "").trim(),
      providerShortCode: body.providerShortCode ? String(body.providerShortCode) : undefined,
      category: String(body.category || "AI Model Providers"),
      description: String(body.description || ""),
      icon: String(body.icon || "🧩"),
      brandColor: String(body.brandColor || "#2563EB"),
      accountCategory: body.accountCategory === "individual" ? "individual" : "enterprise",
      supportedProtocols: rawProtocols,
      capabilities: rawCapabilities,
      authUrl: String(body.authUrl || ""),
      tokenUrl: String(body.tokenUrl || ""),
      apiBaseUrl: String(body.apiBaseUrl || ""),
      cliCommand: String(body.cliCommand || ""),
      docsUrl: String(body.docsUrl || ""),
      lifecycleStatus: (body.lifecycleStatus as UpsertIntegrationInput["lifecycleStatus"]) || "ACTIVE",
      actorUserId: req.actingUser?.userId || "usr-admin",
    };
  }
}

export const integrationController = new IntegrationController();

