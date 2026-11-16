import dotenv from 'dotenv';
import type { PoolConfig } from '@/types/concurrency.js';
import type { CircuitBreakerConfig, RetryOptions } from '@/types/resilience.js';
import {
  AI_DEFAULTS,
  BROWSER_DEFAULTS,
  CIRCUIT_BREAKER_DEFAULTS,
  NETWORK_DEFAULTS,
  RETRY_DEFAULTS,
  TIMEOUT_DEFAULTS,
} from '@/constants/index.js';

dotenv.config();

export interface EngineConfig {
  env: string;
  port: number;
  host: string;
  mcpPort: number;
  pool: PoolConfig;
  circuitBreaker: CircuitBreakerConfig;
  retry: RetryOptions;
  ollama: {
    baseUrl: string;
    candidateUrls: string[];
    defaultModel: string;
    timeoutMs: number;
  };
  comfyui: {
    baseUrl: string;
    candidateUrls: string[];
    timeoutMs: number;
  };
}

// ============================================================================
// OOP Value Resolvers (SOLID: SRP, Branchless via Dictionary Dispatch)
// ============================================================================

export class EnvironmentNumberParser {
  static parse(raw: string | undefined, defaultValue: number): number {
    const candidate = Number(raw ?? defaultValue);
    const lookup: Record<string, number> = {
      true: defaultValue,
      false: candidate,
    };
    const isInvalid = Number.isNaN(candidate) || raw === undefined || raw === '';
    return lookup[String(isInvalid)] ?? defaultValue;
  }
}

export class EnvironmentBooleanParser {
  private static readonly TRUTHY_MAP: Readonly<Record<string, boolean>> = {
    true: true,
    '1': true,
  };

  static parse(raw: string | undefined, defaultValue: boolean): boolean {
    const rawNormalized = String(raw ?? defaultValue).toLowerCase();
    const resolved = EnvironmentBooleanParser.TRUTHY_MAP[rawNormalized] ?? false;
    const lookup: Record<string, boolean> = {
      true: defaultValue,
      false: resolved,
    };
    const isUnset = raw === undefined || raw === '';
    return lookup[String(isUnset)] ?? resolved;
  }
}

// ============================================================================
// Strongly-Typed Centralized Configuration
// ============================================================================

export const config: EngineConfig = {
  env: process.env.NODE_ENV || 'development',
  port: EnvironmentNumberParser.parse(process.env.PORT, NETWORK_DEFAULTS.PORT),
  host: process.env.HOST || NETWORK_DEFAULTS.HOST,
  mcpPort: EnvironmentNumberParser.parse(process.env.MCP_PORT, NETWORK_DEFAULTS.MCP_PORT),
  pool: {
    maxConcurrency: EnvironmentNumberParser.parse(
      process.env.PLAYWRIGHT_MAX_CONCURRENCY,
      BROWSER_DEFAULTS.MAX_CONCURRENCY
    ),
    maxPagesPerContext: EnvironmentNumberParser.parse(
      process.env.PLAYWRIGHT_MAX_PAGES_PER_CONTEXT,
      BROWSER_DEFAULTS.MAX_PAGES_PER_CONTEXT
    ),
    browserType: (process.env.PLAYWRIGHT_BROWSER as 'chromium' | 'firefox' | 'webkit') || BROWSER_DEFAULTS.BROWSER_TYPE,
    headless: EnvironmentBooleanParser.parse(process.env.PLAYWRIGHT_HEADLESS, BROWSER_DEFAULTS.HEADLESS),
    launchArgs: [...BROWSER_DEFAULTS.LAUNCH_ARGS],
    stepWatchdogTimeoutMs: EnvironmentNumberParser.parse(
      process.env.STEP_WATCHDOG_TIMEOUT_MS,
      TIMEOUT_DEFAULTS.STEP_WATCHDOG_MS
    ),
    workflowWatchdogTimeoutMs: EnvironmentNumberParser.parse(
      process.env.WORKFLOW_WATCHDOG_TIMEOUT_MS,
      TIMEOUT_DEFAULTS.WORKFLOW_WATCHDOG_MS
    ),
    stuckGracePeriodMs: EnvironmentNumberParser.parse(
      process.env.STUCK_GRACE_PERIOD_MS,
      TIMEOUT_DEFAULTS.STUCK_GRACE_PERIOD_MS
    ),
  },
  circuitBreaker: {
    failureThreshold: EnvironmentNumberParser.parse(
      process.env.CIRCUIT_BREAKER_THRESHOLD,
      CIRCUIT_BREAKER_DEFAULTS.FAILURE_THRESHOLD
    ),
    resetTimeoutMs: EnvironmentNumberParser.parse(
      process.env.CIRCUIT_BREAKER_RESET_MS,
      CIRCUIT_BREAKER_DEFAULTS.RESET_TIMEOUT_MS
    ),
    halfOpenMaxProbes: EnvironmentNumberParser.parse(
      process.env.CIRCUIT_BREAKER_PROBES,
      CIRCUIT_BREAKER_DEFAULTS.HALF_OPEN_MAX_PROBES
    ),
  },
  retry: {
    maxRetries: EnvironmentNumberParser.parse(
      process.env.RETRY_MAX_ATTEMPTS,
      RETRY_DEFAULTS.MAX_RETRIES
    ),
    initialDelayMs: EnvironmentNumberParser.parse(
      process.env.RETRY_INITIAL_DELAY_MS,
      RETRY_DEFAULTS.INITIAL_DELAY_MS
    ),
    maxDelayMs: EnvironmentNumberParser.parse(
      process.env.RETRY_MAX_DELAY_MS,
      RETRY_DEFAULTS.MAX_DELAY_MS
    ),
    backoffFactor: RETRY_DEFAULTS.BACKOFF_FACTOR,
    jitter: RETRY_DEFAULTS.JITTER,
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || AI_DEFAULTS.OLLAMA_BASE_URL,
    candidateUrls: [
      process.env.OLLAMA_BASE_URL || AI_DEFAULTS.OLLAMA_BASE_URL,
      'http://127.0.0.1:11435',
      'http://host.docker.internal:11435',
      'http://localhost:11434',
    ],
    defaultModel: process.env.OLLAMA_DEFAULT_MODEL || AI_DEFAULTS.OLLAMA_MODEL,
    timeoutMs: EnvironmentNumberParser.parse(
      process.env.OLLAMA_TIMEOUT_MS,
      TIMEOUT_DEFAULTS.OLLAMA_TIMEOUT_MS
    ),
  },
  comfyui: {
    baseUrl: process.env.COMFYUI_BASE_URL || AI_DEFAULTS.COMFYUI_BASE_URL,
    candidateUrls: [
      process.env.COMFYUI_BASE_URL || AI_DEFAULTS.COMFYUI_BASE_URL,
      'http://127.0.0.1:8189',
      'http://host.docker.internal:8189',
      'http://localhost:8188',
    ],
    timeoutMs: EnvironmentNumberParser.parse(
      process.env.COMFYUI_TIMEOUT_MS,
      TIMEOUT_DEFAULTS.COMFYUI_TIMEOUT_MS
    ),
  },
};
