import { BROWSER_DEFAULTS, TIMEOUT_DEFAULTS, WORKFLOW_RECORDING_CONSTANTS } from '@/constants/index.js';
import type { StepActionType, StepDefinition, WorkflowDefinition } from '@/types/workflow.js';
import { ProfessionalWorkflowNameFormatter } from '@/recorder/name-formatter.js';

// ============================================================================
// Generic JSON Schema Default Injector (SOLID: SRP, OCP, Zero Branching)
// ============================================================================

export interface IWorkflowDefaultsManager {
  applyDefaults(
    partial: Partial<WorkflowDefinition>,
    targetUrl?: string,
    primaryAction?: string
  ): { workflow: WorkflowDefinition; appliedDefaults: string[] };
}

export class WorkflowDefaultsManager implements IWorkflowDefaultsManager {
  private nameFormatter = new ProfessionalWorkflowNameFormatter();

  applyDefaults(
    partial: Partial<WorkflowDefinition>,
    targetUrl?: string,
    primaryAction?: string
  ): { workflow: WorkflowDefinition; appliedDefaults: string[] } {
    const appliedDefaults: string[] = [];

    const effectiveBaseUrl = partial.baseUrl || targetUrl;

    const hasId = Boolean(partial.id);
    const idActions: Record<string, () => string> = {
      true: () => partial.id!,
      false: () => {
        appliedDefaults.push('id');
        return this.nameFormatter.formatWorkflowId(effectiveBaseUrl, primaryAction);
      },
    };
    const id = idActions[String(hasId)]();

    const hasName = Boolean(partial.name);
    const nameActions: Record<string, () => string> = {
      true: () => partial.name!,
      false: () => {
        appliedDefaults.push('name');
        return ['Automated Workflow for', effectiveBaseUrl || 'Web Target'].join(' ');
      },
    };
    const name = nameActions[String(hasName)]();

    const hasVersion = Boolean(partial.version);
    const versionActions: Record<string, () => string> = {
      true: () => partial.version!,
      false: () => {
        appliedDefaults.push('version');
        return WORKFLOW_RECORDING_CONSTANTS.DEFAULT_VERSION;
      },
    };
    const version = versionActions[String(hasVersion)]();

    const hasViewport = Boolean(partial.viewport && partial.viewport.width && partial.viewport.height);
    const viewportActions: Record<string, () => { width: number; height: number }> = {
      true: () => partial.viewport!,
      false: () => {
        appliedDefaults.push('viewport');
        return { ...BROWSER_DEFAULTS.VIEWPORT };
      },
    };
    const viewport = viewportActions[String(hasViewport)]();

    const hasTimeout = Boolean(partial.timeoutMs);
    const timeoutActions: Record<string, () => number> = {
      true: () => partial.timeoutMs!,
      false: () => {
        appliedDefaults.push('timeoutMs');
        return TIMEOUT_DEFAULTS.WORKFLOW_WATCHDOG_MS;
      },
    };
    const timeoutMs = timeoutActions[String(hasTimeout)]();

    const hasStepTimeout = Boolean(partial.stepTimeoutMs);
    const stepTimeoutActions: Record<string, () => number> = {
      true: () => partial.stepTimeoutMs!,
      false: () => {
        appliedDefaults.push('stepTimeoutMs');
        return TIMEOUT_DEFAULTS.STEP_WATCHDOG_MS;
      },
    };
    const stepTimeoutMs = stepTimeoutActions[String(hasStepTimeout)]();

    const hasBrowserType = Boolean(partial.browserType);
    const browserTypeActions: Record<string, () => 'chromium' | 'firefox' | 'webkit'> = {
      true: () => partial.browserType!,
      false: () => {
        appliedDefaults.push('browserType');
        return BROWSER_DEFAULTS.BROWSER_TYPE;
      },
    };
    const browserType = browserTypeActions[String(hasBrowserType)]();

    const hasHeadless = partial.headless !== undefined;
    const headlessActions: Record<string, () => boolean> = {
      true: () => partial.headless!,
      false: () => {
        appliedDefaults.push('headless');
        return BROWSER_DEFAULTS.HEADLESS;
      },
    };
    const headless = headlessActions[String(hasHeadless)]();

    const hasCircuitBreaker = Boolean(partial.circuitBreakerDomain);
    const cbActions: Record<string, () => string | undefined> = {
      true: () => partial.circuitBreakerDomain,
      false: () => {
        const hasBase = Boolean(effectiveBaseUrl);
        const baseActions: Record<string, () => string | undefined> = {
          true: () => {
            try {
              appliedDefaults.push('circuitBreakerDomain');
              return new URL(effectiveBaseUrl!).hostname;
            } catch {
              return undefined;
            }
          },
          false: () => undefined,
        };
        return baseActions[String(hasBase)]();
      },
    };
    const circuitBreakerDomain = cbActions[String(hasCircuitBreaker)]();

    const VALID_STEP_ACTIONS = new Set<string>([
      'navigate',
      'click',
      'fill',
      'type',
      'press',
      'hover',
      'select_option',
      'wait_for_selector',
      'wait_for_timeout',
      'wait_for_response',
      'evaluate',
      'extract_text',
      'extract_attribute',
      'extract_table',
      'extract_all',
      'screenshot',
      'scroll',
      'intercept_endpoints',
      'call_ollama',
      'call_comfyui',
    ]);

    const rawSteps = partial.steps || [];
    const normalizedSteps = rawSteps.map((step, index): StepDefinition => {
      const stepHasId = Boolean(step.id);
      const stepIdActions: Record<string, () => string> = {
        true: () => step.id,
        false: () => {
          appliedDefaults.push(['step[', String(index), '].id'].join(''));
          return ['step', String(index + 1)].join('-');
        },
      };

      const stepHasTimeout = Boolean(step.timeoutMs);
      const stepTimeoutValActions: Record<string, () => number> = {
        true: () => step.timeoutMs!,
        false: () => {
          appliedDefaults.push(['step[', String(index), '].timeoutMs'].join(''));
          return WORKFLOW_RECORDING_CONSTANTS.DEFAULT_ACTION_TIMEOUT_MS;
        },
      };

      const rawActionStr = String(step.action || '').trim();
      let action: StepActionType;
      if (VALID_STEP_ACTIONS.has(rawActionStr)) {
        action = rawActionStr as StepActionType;
      } else {
        appliedDefaults.push(['step[', String(index), '].action'].join(''));
        if (step.targetUrl || (index === 0 && !step.selector)) {
          action = 'navigate';
        } else if (step.value !== undefined && (step.selector || rawActionStr.includes('fill') || rawActionStr.includes('type'))) {
          action = 'fill';
        } else if (rawActionStr.includes('extract') || rawActionStr.includes('text') || rawActionStr.includes('table')) {
          action = 'extract_text';
        } else if (rawActionStr.includes('wait')) {
          action = step.selector ? 'wait_for_selector' : 'wait_for_timeout';
        } else if (rawActionStr.includes('screenshot')) {
          action = 'screenshot';
        } else if (rawActionStr.includes('scroll')) {
          action = 'scroll';
        } else if (step.selector) {
          action = 'click';
        } else {
          action = index === 0 ? 'navigate' : 'click';
        }
      }

      let targetUrl = step.targetUrl;
      if (action === 'navigate' && !targetUrl) {
        targetUrl = effectiveBaseUrl || 'https://google.com';
        appliedDefaults.push(['step[', String(index), '].targetUrl'].join(''));
      }

      return {
        ...step,
        id: stepIdActions[String(stepHasId)](),
        action,
        targetUrl,
        timeoutMs: stepTimeoutValActions[String(stepHasTimeout)](),
        continueOnError: Boolean(step.continueOnError),
        optional: Boolean(step.optional),
      };
    });

    const workflow: WorkflowDefinition = {
      id,
      name,
      description: partial.description || ['Generated workflow with default schema attributes for', name].join(' '),
      version,
      baseUrl: effectiveBaseUrl,
      variables: partial.variables || {},
      viewport,
      userAgent: partial.userAgent,
      browserType,
      headless,
      timeoutMs,
      stepTimeoutMs,
      retryConfig: partial.retryConfig || {
        maxRetries: WORKFLOW_RECORDING_CONSTANTS.DEFAULT_RETRY_CONFIG.MAX_RETRIES,
        initialDelayMs: WORKFLOW_RECORDING_CONSTANTS.DEFAULT_RETRY_CONFIG.INITIAL_DELAY_MS,
        backoffFactor: WORKFLOW_RECORDING_CONSTANTS.DEFAULT_RETRY_CONFIG.BACKOFF_FACTOR,
      },
      circuitBreakerDomain,
      steps: normalizedSteps,
    };

    return {
      workflow,
      appliedDefaults,
    };
  }
}
