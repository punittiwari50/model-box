/**
 * Validation Schemas & Contracts for Onboarding Flows.
 * Aligns with UI-LLD Section 3 & STEP-16 specifications.
 */

export interface ValidationResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly errors?: readonly string[];
}

export interface AuthOnboardingInput {
  readonly authMode: "GOOGLE_GIS" | "ENTERPRISE_SSO" | "API_KEY" | "DEVELOPER_MOCK";
  readonly idToken?: string;
  readonly apiKey?: string;
  readonly tenantScope: "JOB_PORTAL" | "APPS_BUILDER" | "STORYTELLER" | "CUSTOM_PLATFORM";
  readonly selectedCapabilities: readonly string[];
}

export interface ResumeUploadInput {
  readonly fileName: string;
  readonly fileSize: number;
  readonly fileType: string;
  readonly targetJobDescription: string;
  readonly autoMutateMissingSkills: boolean;
}

export interface SkillMdUploadInput {
  readonly skillContent: string;
  readonly targetLanguage: "TYPESCRIPT" | "PYTHON" | "GO" | "RUST";
  readonly runSandboxTests: boolean;
}

export interface StorytellerPromptInput {
  readonly narrativeText: string;
  readonly artStyle: "CYBERPUNK_ANIME" | "CINEMATIC_PHOTOREALISTIC" | "PIXAR_3D" | "DARK_FANTASY";
  readonly voiceId: string;
  readonly aspectRatio: "16:9" | "9:16" | "1:1";
  readonly hitlCheckpointEnabled: boolean;
}

export class OnboardingValidators {
  public static validateAuthOnboarding(input: AuthOnboardingInput): ValidationResult<AuthOnboardingInput> {
    const errors: string[] = [];
    if (!["GOOGLE_GIS", "ENTERPRISE_SSO", "API_KEY", "DEVELOPER_MOCK"].includes(input.authMode)) {
      errors.push("Invalid authMode specified.");
    }
    if (input.authMode === "GOOGLE_GIS" && (!input.idToken || input.idToken.length < 20)) {
      errors.push("ID token is required and must be a valid JWT.");
    }
    if (input.authMode === "API_KEY" && (!input.apiKey || !input.apiKey.startsWith("mc_live_"))) {
      errors.push("API key must match 'mc_live_' prefix format.");
    }
    if (!input.selectedCapabilities || input.selectedCapabilities.length === 0) {
      errors.push("Select at least one platform capability.");
    }
    return {
      success: errors.length === 0,
      data: errors.length === 0 ? input : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  public static validateResumeUpload(input: ResumeUploadInput): ValidationResult<ResumeUploadInput> {
    const errors: string[] = [];
    if (input.fileSize > 10 * 1024 * 1024) {
      errors.push("File size must not exceed 10MB.");
    }
    const validMimes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ];
    if (!validMimes.includes(input.fileType) && !input.fileName.endsWith(".pdf") && !input.fileName.endsWith(".docx")) {
      errors.push("Only valid PDF, DOCX, or Markdown documents are accepted.");
    }
    if (!input.targetJobDescription || input.targetJobDescription.length < 30) {
      errors.push("Target job description must be at least 30 characters.");
    }
    return {
      success: errors.length === 0,
      data: errors.length === 0 ? input : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  public static validateSkillMd(input: SkillMdUploadInput): ValidationResult<SkillMdUploadInput> {
    const errors: string[] = [];
    if (!input.skillContent || input.skillContent.length < 20) {
      errors.push("Skill markdown cannot be empty.");
    }
    if (!input.skillContent.trim().startsWith("---")) {
      errors.push("Skill file must contain valid YAML frontmatter (starting with ---).");
    }
    if (!["TYPESCRIPT", "PYTHON", "GO", "RUST"].includes(input.targetLanguage)) {
      errors.push("Invalid target compilation language.");
    }
    return {
      success: errors.length === 0,
      data: errors.length === 0 ? input : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  public static validateStorytellerPrompt(input: StorytellerPromptInput): ValidationResult<StorytellerPromptInput> {
    const errors: string[] = [];
    if (!input.narrativeText || input.narrativeText.length < 20) {
      errors.push("Story prompt must be at least 20 characters.");
    }
    if (!input.voiceId) {
      errors.push("Narration voice is required.");
    }
    if (!["16:9", "9:16", "1:1"].includes(input.aspectRatio)) {
      errors.push("Invalid aspect ratio.");
    }
    return {
      success: errors.length === 0,
      data: errors.length === 0 ? input : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
