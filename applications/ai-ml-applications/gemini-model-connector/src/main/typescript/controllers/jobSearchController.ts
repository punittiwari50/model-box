import type { Request, Response } from "express";
import { container } from "@/core/context/appContext.js";
import type { JobSearchService } from "@/services/jobSearch/jobSearchService.js";
import { safeReadArtifact } from "@/core/config/security/fileSecurity.js";
import { config } from "@/core/config/index.js";
import { HttpStatus } from "@/domain/constants/index.js";
import {
  getClientIp,
  getRouteParam,
  sendJsonResponse,
  sendJsonError,
} from "@/core/web/helper/responseHelper.js";

/**
 * Controller for Job Search analysis and artifact download.
 * Conforms to STD-COD-006 (No compound boolean operators) & STD-COD-007.
 */
export class JobSearchController {
  private readonly jobSearchService: JobSearchService;

  constructor(service?: JobSearchService) {
    this.jobSearchService = service || container.getJobSearchService();
  }

  public async analyze(req: Request, res: Response): Promise<void> {
    try {
      const { resume_content } = req.body;
      if (!resume_content || typeof resume_content !== "string") {
        sendJsonError(
          res,
          HttpStatus.BAD_REQUEST,
          'Field "resume_content" (inline resume) is required.',
        );
        return;
      }

      if (!this.hasJobRequirementSource(req.body)) {
        sendJsonError(
          res,
          HttpStatus.BAD_REQUEST,
          "At least one job requirement source is required: job_html, job_url, job_image_base64, or job_text.",
        );
        return;
      }

      const result = await this.jobSearchService.analyzeAndGenerateMarkdown(
        {
          ...req.body,
          generate_markdown_files: req.body.generate_markdown_files !== false,
        },
        getClientIp(req),
      );
      if (result.tier) res.locals.tier = result.tier;
      if (result.model) res.locals.model = result.model;
      sendJsonResponse(res, HttpStatus.OK, result);
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || "Failed to process job search analysis.",
      );
    }
  }

  public downloadArtifact(req: Request, res: Response): void {
    try {
      const filename = getRouteParam(req.params.filename);
      const content = safeReadArtifact(config.artifactsDir, filename);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(content);
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.NOT_FOUND,
        error.message || "Artifact not found or access denied.",
      );
    }
  }

  /**
   * Helper verifying presence of at least one requirement source without compound boolean expressions (STD-COD-006).
   */
  private hasJobRequirementSource(body: Record<string, any>): boolean {
    const candidates = [
      body.job_html,
      body.job_url,
      body.job_image_base64,
      body.job_text,
    ];
    return candidates.some(
      (val) => typeof val === "string" && val.trim().length > 0,
    );
  }
}

export const jobSearchController = new JobSearchController();
