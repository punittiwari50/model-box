import type { Request, Response } from 'express';
import {
  interactionStrategyRegistry,
  type InteractionStrategyRegistry,
} from '@/core/interaction/interactionStrategy.js';
import { HttpStatus } from '@/domain/constants/index.js';
import { sendJsonResponse, sendJsonError } from '@/core/web/helper/responseHelper.js';

/**
 * Unified Interaction Controller.
 * Switches polymorphically between conversation turns and autonomous agent runs.
 * Conforms to STD-COD-005, Invariant #3.
 */
export class InteractionController {
  private readonly registry: InteractionStrategyRegistry;

  constructor(registry: InteractionStrategyRegistry = interactionStrategyRegistry) {
    this.registry = registry;
  }

  public interact = async (req: Request, res: Response): Promise<void> => {
    try {
      const { mode, prompt, ...rest } = req.body || {};
      if (!prompt) {
        sendJsonError(res, HttpStatus.BAD_REQUEST, 'Field "prompt" is required');
        return;
      }
      const strategy = this.registry.resolve(mode);
      const result = await strategy.execute({ mode, prompt, ...rest });
      sendJsonResponse(res, HttpStatus.OK, result);
    } catch (err: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, err.message);
    }
  };
}

export const interactionController = new InteractionController();
