import type { Request, Response } from "express";
import {
  modelDiscoveryService,
  type ModelDiscoveryService,
} from "@/services/model/modelDiscoveryService.js";
import {
  subscriptionManager,
  type SubscriptionManager,
} from "@/core/subscription/subscriptionManager.js";
import { HttpStatus } from "@/domain/constants/index.js";
import {
  getRouteParam,
  getQueryParam,
  sendJsonResponse,
  sendJsonError,
} from "@/core/web/helper/responseHelper.js";

/**
 * Controller exposing dynamically discovered models and subscription tiers.
 * Conforms to:
 * - STD-COD-006: Complexity <= 3
 * - STD-COD-007: Clean Code, SLAP (functions <= 20 lines)
 */
export class ModelController {
  private readonly discoveryService: ModelDiscoveryService;
  private readonly subManager: SubscriptionManager;

  constructor(
    discovery: ModelDiscoveryService = modelDiscoveryService,
    subMgr: SubscriptionManager = subscriptionManager,
  ) {
    this.discoveryService = discovery;
    this.subManager = subMgr;
  }

  public async listModels(req: Request, res: Response): Promise<void> {
    try {
      const forceRefresh = getQueryParam(req.query.refresh) === "true";
      const models =
        await this.discoveryService.listAvailableModels(forceRefresh);
      sendJsonResponse(res, HttpStatus.OK, {
        success: true,
        count: models.length,
        subscription_policy: this.subManager.getPolicy(),
        models,
      });
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || "Failed to list models.",
      );
    }
  }

  public async getModel(req: Request, res: Response): Promise<void> {
    try {
      const modelName = getRouteParam(req.params.model);
      const model = await this.discoveryService.getModel(modelName);
      if (!model) {
        sendJsonError(
          res,
          HttpStatus.NOT_FOUND,
          `Model '${modelName}' not found via live CLI/API.`,
        );
        return;
      }
      sendJsonResponse(res, HttpStatus.OK, {
        success: true,
        model,
      });
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || "Failed to get model.",
      );
    }
  }
}

export const modelController = new ModelController();
