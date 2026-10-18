import type { Request, Response, NextFunction } from 'express';

/**
 * Enterprise Request Validation Filter.
 * Conforms to Requirement #14 (Sanity check of request layer).
 */
export class RequestValidationFilter {
  public static validateCreateConversation(req: Request, res: Response, next: NextFunction): void {
    const { title } = req.body || {};
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({
        error: "Validation failed: 'title' is required and must be a non-empty string.",
      });
      return;
    }
    if (title.length > 255) {
      res.status(400).json({
        error: "Validation failed: 'title' must not exceed 255 characters.",
      });
      return;
    }
    next();
  }

  public static validateSendMessage(req: Request, res: Response, next: NextFunction): void {
    const { content } = req.body || {};
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({
        error: "Validation failed: 'content' is required and must be a non-empty string.",
      });
      return;
    }
    next();
  }

  public static validateJobSearch(req: Request, res: Response, next: NextFunction): void {
    const { resume_content } = req.body || {};
    if (!resume_content || typeof resume_content !== 'string' || resume_content.trim().length === 0) {
      res.status(400).json({
        error: "Validation failed: 'resume_content' is required and must be a non-empty string.",
      });
      return;
    }
    next();
  }
}
