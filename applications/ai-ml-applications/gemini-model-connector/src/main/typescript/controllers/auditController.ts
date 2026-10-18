import type { Request, Response } from "express";
import { auditRepo } from "@/repositories/auditRepository.js";
import { HttpStatus } from "@/domain/constants/index.js";
import {
  sendJsonResponse,
  sendJsonError,
} from "@/core/web/helper/responseHelper.js";

/**
 * Controller for compliance audit log queries.
 * Conforms to STD-COD-006 & STD-COD-007.
 */
export class AuditController {
  public async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const conversation_id = req.query.conversation_id as string | undefined;
      const action = req.query.action as string | undefined;
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const logs = await auditRepo.queryLogs({
        conversation_id,
        action,
        status,
        limit,
        offset,
      });
      sendJsonResponse(res, HttpStatus.OK, { logs, count: logs.length });
    } catch (error: any) {
      sendJsonError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || "Failed to query audit logs.",
      );
    }
  }
}

export const auditController = new AuditController();
