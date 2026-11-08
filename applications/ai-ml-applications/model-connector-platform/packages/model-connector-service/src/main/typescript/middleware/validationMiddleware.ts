import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpStatus } from "@/constants/index";

export const chatRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt must not be empty"),
  model: z.string().optional(),
  strategy: z.enum(["cli", "api", "cookie", "oauth"]).optional(),
  systemInstruction: z.string().optional(),
  sessionId: z.string().optional(),
  apiKey: z.string().optional(),
  cookieHeader: z.string().optional(),
  hyperparameters: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      maxOutputTokens: z.number().int().positive().optional(),
    })
    .optional(),
});

export function validateChatRequest(req: Request, res: Response, next: NextFunction): void {
  const result = chatRequestSchema.safeParse(req.body);
  if (!result.success) {
    res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      errors: result.error.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
      correlationId: req.correlationId,
    });
    return;
  }
  req.body = result.data;
  next();
}
