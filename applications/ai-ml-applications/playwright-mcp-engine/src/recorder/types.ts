import type { StepDefinition, WorkflowDefinition } from '@/types/workflow.js';

// ============================================================================
// Workflow Recording & AI Revalidation Types (SOLID: SRP, ISP)
// ============================================================================

export interface RecordedRawEvent {
  eventType: 'click' | 'input' | 'change' | 'submit' | 'keydown' | 'navigation';
  tagName?: string;
  selector: string;
  fallbacks: string[];
  value?: string;
  key?: string;
  url: string;
  title?: string;
  timestamp: number;
}

export interface RecordingSession {
  sessionId: string;
  targetUrl: string;
  startedAt: number;
  isActive: boolean;
  events: RecordedRawEvent[];
}

export interface WorkflowGenerationRequest {
  userDescription: string;
  baseUrl?: string;
  existingWorkflow?: Partial<WorkflowDefinition>;
  customName?: string;
  autoSave?: boolean;
}

export interface WorkflowGenerationResponse {
  workflow: WorkflowDefinition;
  fileName: string;
  savedPath?: string;
  revalidationSummary: {
    isValid: boolean;
    ollamaModelUsed: string;
    defaultsApplied: string[];
    revalidatedParameters: string[];
  };
}

export interface RecordingStopResponse {
  sessionId: string;
  durationMs: number;
  totalEventsRecorded: number;
  stepsGeneratedCount: number;
  workflow: WorkflowDefinition;
  fileName: string;
  savedPath: string;
}

export interface RecordedWorkflowMetadata {
  fileName: string;
  filePath: string;
  workflowId: string;
  name: string;
  baseUrl?: string;
  stepsCount: number;
  createdAt: string;
}
