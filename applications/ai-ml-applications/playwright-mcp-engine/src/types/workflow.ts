export type StepActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'type'
  | 'press'
  | 'hover'
  | 'select_option'
  | 'wait_for_selector'
  | 'wait_for_timeout'
  | 'wait_for_response'
  | 'evaluate'
  | 'extract_text'
  | 'extract_attribute'
  | 'extract_table'
  | 'extract_all'
  | 'screenshot'
  | 'scroll'
  | 'intercept_endpoints'
  | 'call_ollama'
  | 'call_comfyui'
  | 'extract_job_requirement'
  | 'autofill_form'
  | 'match_resume'
  | 'customize_resume';

export interface DynamicSelector {
  primary: string;
  fallbacks?: string[];
  description?: string;
}

export type SelectorDefinition = string | DynamicSelector | string[];

export interface StepDefinition {
  id: string;
  action: StepActionType;
  description?: string;
  selector?: SelectorDefinition;
  value?: string | number | boolean | Record<string, unknown> | unknown[];
  targetUrl?: string;
  timeoutMs?: number;
  optional?: boolean;
  continueOnError?: boolean;
  outputKey?: string;
  evaluateExpression?: string;
  waitCondition?: 'load' | 'domcontentloaded' | 'networkidle' | 'selector';
  screenshotOptions?: {
    fullPage?: boolean;
    path?: string;
  };
  aiPrompt?: {
    model?: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    includeScreenshot?: boolean;
  };
  comfyPrompt?: {
    workflowName?: string;
    positivePrompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    seed?: number;
  };
  jobRequirementOptions?: {
    jobTitleSelector?: string;
    companyNameSelector?: string;
    locationSelector?: string;
    descriptionSelector?: string;
    jobIdSelector?: string;
    workplaceTypeSelector?: string;
    experienceLevelSelector?: string;
    salarySelector?: string;
    linkedinUrl?: string;
    postedAtSelector?: string;
    firstListedAt?: string;
    officialApplyUrl?: string;
  };
  formAutofillOptions?: {
    profileSource?: 'google_docs' | 'local_file' | 'direct_payload';
    googleSheetUrl?: string;
    profileFilePath?: string;
    resumeFilePath?: string;
    submitAfterFill?: boolean;
    customFieldMappings?: Record<string, string>;
  };
  resumeMatchOptions?: {
    resumeText?: string;
    resumeFilePath?: string;
    jobRequirementKey?: string;
    targetModel?: string; // e.g. deepseek-r1:7b, llama3.1:8b, qwen3-coder:latest
    formatForClaude?: boolean;
    generateCoverLetter?: boolean;
  };
}

export interface WorkflowContext {
  variables: Record<string, unknown>;
  env: Record<string, string | undefined>;
  extracted: Record<string, unknown>;
  stepResults: Record<string, StepExecutionResult>;
  trafficSummary: {
    totalRequests: number;
    totalResponses: number;
    authRequiredCount: number;
  };
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version?: string;
  baseUrl?: string;
  variables?: Record<string, unknown>;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
  browserType?: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  maxConcurrencySlots?: number;
  timeoutMs?: number;
  stepTimeoutMs?: number;
  retryConfig?: {
    maxRetries?: number;
    initialDelayMs?: number;
    backoffFactor?: number;
  };
  circuitBreakerDomain?: string;
  steps: StepDefinition[];
}

export type ExecutionStatus =
  | 'SUCCESS'
  | 'RETRIED_SUCCESS'
  | 'RETRIED_FAILED'
  | 'CIRCUIT_BROKEN'
  | 'STUCK_PROCESS_KILLED'
  | 'TIMEOUT'
  | 'AUTH_REQUIRED'
  | 'FAILED';

export interface StepExecutionResult {
  stepId: string;
  action: StepActionType;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'TIMEOUT' | 'STUCK_KILLED';
  durationMs: number;
  output?: unknown;
  error?: string;
  resolvedSelector?: string;
  resolvedValue?: unknown;
  timestamp: string;
}

export interface WorkflowExecutionResponse {
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  concurrencyMetrics: {
    activeWorkersAtStart: number;
    activeWorkersAtEnd: number;
    peakObservedConcurrency: number;
    queuedWaitDurationMs: number;
    slotAssigned: number;
  };
  resilienceMetrics: {
    retriesAttempted: number;
    circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    stuckProcessKilled: boolean;
    stuckDetails?: {
      stepId?: string;
      pidKilled?: number;
      durationBeforeKillMs?: number;
      reason?: string;
    };
  };
  networkAuthSummary: {
    endpointsScanned: number;
    authDetected: boolean;
    authRequiredCount: number;
    authTypesDiscovered: string[];
    topProtectedEndpoints: Array<{
      method: string;
      url: string;
      authType: string;
      reason: string;
    }>;
  };
  extractedOutputs: Record<string, unknown>;
  stepResults: StepExecutionResult[];
  error?: string;
}
