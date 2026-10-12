/**
 * Centralized static constants for ModelBox Connectors UI.
 * STD-COD-002: Reusable immutable static values across UI components and services.
 */

export const HttpConstants = {
  HEADER_CONTENT_TYPE: 'Content-Type',
  HEADER_ACCEPT: 'Accept',
  CONTENT_TYPE_JSON: 'application/json',
  ACCEPT_JSON: 'application/json',
  ACCEPT_JSON_OR_SSE: 'application/json, text/event-stream',
} as const;

export const ModelConstants = {
  DEFAULT_QWEN: 'qwen3:8b',
  QWEN_3_8B: 'qwen3:8b',
  QWEN_3_CODER: 'qwen3-coder:latest',
  QWEN_2_5_VL: 'qwen2.5vl:3b',
} as const;

export const EndpointConstants = {
  API_BASE: '/api/v1',
  DEFAULT_UI_PORT: 3000,
  DEFAULT_SERVICE_PORT: 8000,
} as const;

export const FlowPurposes = {
  JOB_HUNT: 'job_hunt',
  INTERVIEW_PREPARATION: 'interview_preparation',
  JOB_APPLICATION_PREPARATION: 'job_application_preparation',
  JOB_APPLY: 'job_apply',
} as const;

import type { ProjectDefinition, StrategyDefinition, ProjectKey, StrategyKey } from '@/types/automation';

export const DEFAULT_PROJECT_KEY: ProjectKey = 'job_hunt';
export const DEFAULT_STRATEGY_KEY: StrategyKey = 'all_strategies';

export const PROJECTS: ProjectDefinition[] = [
  {
    key: 'job_hunt',
    label: 'Job Hunt',
    icon: '🔍',
    description: 'Searches official career portals with Google X-Ray Boolean syntax, strictly sorted by age.',
    defaultPrompt: 'Search job for spring boot sort by age',
    apiPurpose: 'job_hunt',
    badgeColor: '#38bdf8',
  },
  {
    key: 'interview_preparation',
    label: 'Interview Preparation',
    icon: '🎯',
    description: 'Technical mock interview coaching, system design questions, and answer readiness evaluation.',
    defaultPrompt: 'Mock interview coaching for Senior Spring Boot Microservices Architect',
    apiPurpose: 'interview_preparation',
    badgeColor: '#a855f7',
  },
  {
    key: 'job_application',
    label: 'Job Application',
    icon: '📝',
    description: 'ATS form pre-filling (Greenhouse, Lever ATS) & resume tailoring preparation.',
    defaultPrompt: 'Prepare tailored Greenhouse job application for Spring Boot Developer',
    apiPurpose: 'job_application_preparation',
    badgeColor: '#10b981',
  },
  {
    key: 'job_match',
    label: 'Job Match',
    icon: '🧩',
    description: 'Candidate skill fit percentage, 94% competency match matrix, and gap recommendations.',
    defaultPrompt: 'Evaluate candidate skill match for Spring Boot Cloud Engineer',
    apiPurpose: 'job_match',
    badgeColor: '#f59e0b',
  },
];

export const SEARCH_STRATEGIES: StrategyDefinition[] = [
  {
    key: 'all_strategies',
    label: 'All Strategies (Aggregated)',
    icon: '🔮',
    description: 'Concurrently aggregates all APIs: Google X-Ray DML, Ollama Qwen AI, and Playwright MCP with provenance badges.',
    badgeColor: '#ec4899',
  },
  {
    key: 'hybrid_enterprise',
    label: 'Hybrid Enterprise Search',
    icon: '🚀',
    description: 'Combines live Google X-Ray Boolean queries with Ollama AI reasoning & Playwright automation.',
    badgeColor: '#818cf8',
  },
  {
    key: 'google_xray',
    label: 'Google X-Ray Search',
    icon: '⚡',
    description: 'Direct Boolean queries targeting Tier-1 official company portals and ATS domains, sorted by age.',
    badgeColor: '#38bdf8',
  },
  {
    key: 'ollama_ai',
    label: 'Ollama AI Search',
    icon: '🧠',
    description: 'Ollama model best in respective field for deep architectural synthesis and test generation.',
    badgeColor: '#34d399',
  },
];

