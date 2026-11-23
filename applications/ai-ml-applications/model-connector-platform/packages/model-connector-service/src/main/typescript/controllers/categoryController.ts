import type { Request, Response } from "express";
import { categoryRepository } from "@/repositories/categoryRepository";
import { HttpStatus } from "@/constants/index";

export class CategoryController {
  public getCategories(req: Request, res: Response): void {
    const correlationId = res.locals.correlationId || "unknown";
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const categories = categoryRepository.listCategories(limit, offset);
    res.status(HttpStatus.OK).json({
      success: true,
      count: categories.length,
      categories,
      correlationId,
    });
  }
}

export const categoryController = new CategoryController();
