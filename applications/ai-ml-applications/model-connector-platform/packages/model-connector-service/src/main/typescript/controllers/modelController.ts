import type { Request, Response } from "express";
import { modelService } from "@/services/modelService";
import { HttpStatus } from "@/constants/index";

export class ModelController {
  public async listModels(req: Request, res: Response): Promise<void> {
    const models = await modelService.getModels(req.correlationId);
    res.status(HttpStatus.OK).json({
      success: true,
      count: models.length,
      models,
      correlationId: req.correlationId,
    });
  }

  public async getModel(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const model = await modelService.getModelById(id, req.correlationId);

    if (!model) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: `Model '${id}' not found.`,
        correlationId: req.correlationId,
      });
      return;
    }

    res.status(HttpStatus.OK).json({
      success: true,
      model,
      correlationId: req.correlationId,
    });
  }
}

export const modelController = new ModelController();
