export interface JobRequirementAnalysis {
  readonly job_title: string;
  readonly company_name?: string;
  readonly location?: string;
  readonly required_skills: readonly string[];
  readonly preferred_skills: readonly string[];
  readonly key_responsibilities: readonly string[];
  readonly experience_level?: string;
}

export interface RecommendedModification {
  readonly section: string;
  readonly recommendation: string;
}

export interface InlineResumeMatch {
  readonly match_score_percentage: number;
  readonly matched_skills: readonly string[];
  readonly missing_skills: readonly string[];
  readonly summary_evaluation: string;
  readonly tailored_highlights: readonly string[];
  readonly recommended_modifications: readonly RecommendedModification[];
}

export interface JobSearchRequest {
  readonly conversation_id?: string;
  readonly target_role?: string;
  readonly job_html?: string;
  readonly job_url?: string;
  readonly job_image_base64?: string;
  readonly job_text?: string;
  readonly resume_content: string;
  readonly generate_markdown_files?: boolean;
  readonly api_key?: string;
  readonly mode?: 'auto' | 'api' | 'cli' | 'mock';
  readonly idempotency_key?: string;
  readonly prompt_template?: string;
  readonly system_instruction?: string;
  readonly user_prompt?: string;
  readonly cli_system_instruction?: string;
}

export interface JobSearchArtifactResponse {
  readonly conversation_id: string;
  readonly model?: string;
  readonly tier?: string;
  readonly analysis: JobRequirementAnalysis;
  readonly resume_match: InlineResumeMatch;
  readonly markdown_filepath?: string;
  readonly markdown_content: string;
  readonly cover_letter_content?: string;
  readonly audit_id: string;
  readonly created_timestamp?: string;
  readonly created_at: string;
}
