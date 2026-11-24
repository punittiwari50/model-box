export interface AuthVerificationRequest {
  readonly modelId: string;
  readonly authCode: string;
  readonly userEmail?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly accountId?: string;
}

export interface AuthVerificationOutcome {
  readonly success: boolean;
  readonly session?: Record<string, unknown>;
  readonly account?: Record<string, unknown>;
  readonly vcs?: Record<string, unknown>;
  readonly message?: string;
  readonly errorCode?: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly accountStatus?: "ACTIVE" | "INACTIVE";
  readonly latencyMs: number;
}

export interface IAuthVerificationStep {
  readonly name: string;
  process(req: AuthVerificationRequest, outcome?: AuthVerificationOutcome): Promise<AuthVerificationOutcome | null>;
}

export class AuthCodeFormatValidationStep implements IAuthVerificationStep {
  public readonly name = "AuthCodeFormatValidationStep";

  public async process(req: AuthVerificationRequest): Promise<AuthVerificationOutcome | null> {
    const raw = req.authCode?.trim() || "";
    if (raw.length < 5) {
      return {
        success: false,
        message: "Please enter a valid authorization code (minimum 5 characters).",
        errorCode: "VALIDATION_ERROR",
        correlationId: `corr-${Date.now()}`,
        traceId: `trace-${Date.now()}`,
        latencyMs: 1,
      };
    }
    return null;
  }
}

export class AuthVerificationChain {
  private readonly steps: IAuthVerificationStep[] = [];

  public addStep(step: IAuthVerificationStep): this {
    this.steps.push(step);
    return this;
  }

  public async execute(req: AuthVerificationRequest): Promise<AuthVerificationOutcome> {
    const startTime = Date.now();
    let currentOutcome: AuthVerificationOutcome | null = null;

    for (const step of this.steps) {
      const stepOutcome = await step.process(req, currentOutcome || undefined);
      if (stepOutcome) {
        currentOutcome = stepOutcome;
        if (!stepOutcome.success) {
          return currentOutcome;
        }
      }
    }

    return (
      currentOutcome || {
        success: false,
        message: "No verification steps processed.",
        errorCode: "NO_STEPS",
        correlationId: `corr-${Date.now()}`,
        traceId: `trace-${Date.now()}`,
        latencyMs: Math.max(1, Date.now() - startTime),
      }
    );
  }
}
