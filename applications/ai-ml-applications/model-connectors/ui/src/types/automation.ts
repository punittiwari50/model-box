/**
 * Reusable domain interfaces and types for ModelBox UI Automation Console.
 * Adheres to STD-COD-002 and SOLID principles.
 */

export type ProjectKey = 'job_hunt' | 'interview_preparation' | 'job_application' | 'job_match';
export type StrategyKey = 'all_strategies' | 'hybrid_enterprise' | 'google_xray' | 'ollama_ai';

export interface ProjectDefinition {
  key: ProjectKey;
  label: string;
  icon: string;
  description: string;
  defaultPrompt: string;
  apiPurpose: string;
  badgeColor: string;
}

export interface StrategyDefinition {
  key: StrategyKey;
  label: string;
  icon: string;
  description: string;
  badgeColor: string;
}

export interface JobOpening {
  job_id?: string;
  title: string;
  company: string;
  official_domain: string;
  portal_url: string;
  direct_apply_url?: string;
  location: string;
  age: string;
  age_hours: number;
  salary: string;
  skills: string[];
  strategy_badge?: string;
  badge_color?: string;
  logo_url?: string;
  posted_at?: string;
  role_summary?: string;
  responsibilities?: string[];
  qualifications?: string[];
  match_analysis?: string;
  benefits?: string;
  aggregated_sources?: string[];
  schema_org_job_posting?: any;
  is_verified_active?: boolean;
  verification_status?: string;
}

export interface XRayBestPractice {
  practice_id: string;
  category: string;
  name: string;
  description: string;
  boolean_pattern: string;
  target_domains: string[];
  weight: number;
  is_active: boolean;
}

export interface JobMatchScore {
  candidate: string;
  target_role: string;
  overall_match_percentage: number;
  key_competencies_matched?: string[];
  recommended_actions?: string[];
  skills_alignment?: Array<{
    skill: string;
    match: string;
    candidate_level: string;
    required_level: string;
  }>;
  [key: string]: any;
}

export interface JobPaginationMetadata {
  current_page: number;
  page_size: number;
  total_openings: number;
  total_pages: number;
  has_next_page: boolean;
  has_previous_page: boolean;
  showing_from: number;
  showing_to: number;
  verified_count: number;
}

export interface UiChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  project?: string;
  strategyUsed?: string;
  isVoice?: boolean;
  attachedImage?: string | null;
  sequentialWorkflow?: any | null;
  sortedOpenings?: JobOpening[];
  pagedOpenings?: JobOpening[];
  pagination?: JobPaginationMetadata | null;
  jobMatchScore?: JobMatchScore | null;
  xraySearchQuery?: any | null;
  appliedBestPractices?: XRayBestPractice[];
  imageArtifacts?: any[];
  dryRunResult?: any | null;
  isExecuting?: boolean;
  aggregatedStrategies?: string[];
}

export interface SearchExecutionPayload {
  query: string;
  role: string;
  strategy_type: StrategyKey;
  time_filter: string;
  model_name?: string;
  candidate_skills?: string;
  location?: string;
  page?: number;
  page_size?: number;
}

