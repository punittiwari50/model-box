import type { Page } from "playwright";

export type UsecaseStatus = "PASSED" | "FAILED";

export interface IUsecaseStepResult {
  readonly stepNumber: number;
  readonly name: string;
  readonly status: UsecaseStatus;
  readonly durationMs: number;
  readonly details: string;
}

export interface IUsecaseResult {
  readonly usecaseId: string;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly status: UsecaseStatus;
  readonly durationMs: number;
  readonly steps: readonly IUsecaseStepResult[];
  readonly error?: string;
}

export interface IUsecaseSuiteSummary {
  readonly totalUsecases: number;
  readonly passedUsecases: number;
  readonly failedUsecases: number;
  readonly totalDurationMs: number;
  readonly executedAt: string;
  readonly targetUrl: string;
  readonly results: readonly IUsecaseResult[];
}

export interface IUsecaseTest {
  readonly usecaseId: string;
  readonly title: string;
  readonly category: string;
  readonly description: string;

  execute(page: Page): Promise<IUsecaseResult>;
}

