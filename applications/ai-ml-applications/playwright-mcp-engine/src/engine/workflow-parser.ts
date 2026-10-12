import { z } from 'zod';
import type { WorkflowContext, WorkflowDefinition } from '@/types/workflow.js';

const StepDefinitionSchema = z.object({
  id: z.string().min(1),
  action: z.enum([
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
  ]),
  description: z.string().optional(),
  selector: z.union([
    z.string(),
    z.array(z.string()),
    z.object({
      primary: z.string(),
      fallbacks: z.array(z.string()).optional(),
      description: z.string().optional(),
    }),
  ]).optional(),
  value: z.any().optional(),
  targetUrl: z.string().optional(),
  timeoutMs: z.number().positive().optional(),
  optional: z.boolean().optional(),
  continueOnError: z.boolean().optional(),
  outputKey: z.string().optional(),
  evaluateExpression: z.string().optional(),
  waitCondition: z.enum(['load', 'domcontentloaded', 'networkidle', 'selector']).optional(),
  screenshotOptions: z.object({
    fullPage: z.boolean().optional(),
    path: z.string().optional(),
  }).optional(),
  aiPrompt: z.object({
    model: z.string().optional(),
    prompt: z.string(),
    systemPrompt: z.string().optional(),
    temperature: z.number().optional(),
    includeScreenshot: z.boolean().optional(),
  }).optional(),
  comfyPrompt: z.object({
    workflowName: z.string().optional(),
    positivePrompt: z.string(),
    negativePrompt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    seed: z.number().optional(),
  }).optional(),
});

const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().optional().default('1.0.0'),
  baseUrl: z.string().optional(),
  variables: z.record(z.any()).optional().default({}),
  viewport: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
  userAgent: z.string().optional(),
  browserType: z.enum(['chromium', 'firefox', 'webkit']).optional().default('chromium'),
  headless: z.boolean().optional().default(true),
  maxConcurrencySlots: z.number().positive().optional(),
  timeoutMs: z.number().positive().optional(),
  stepTimeoutMs: z.number().positive().optional(),
  retryConfig: z.object({
    maxRetries: z.number().nonnegative().optional(),
    initialDelayMs: z.number().positive().optional(),
    backoffFactor: z.number().positive().optional(),
  }).optional(),
  circuitBreakerDomain: z.string().optional(),
  steps: z.array(StepDefinitionSchema).min(1),
});

export class WorkflowParser {
  static parse(raw: unknown): WorkflowDefinition {
    const isString = typeof raw === 'string';
    const payloadResolvers: Record<string, () => unknown> = {
      true: () => {
        try {
          return JSON.parse(raw as string);
        } catch (err) {
          throw new Error(`Invalid JSON syntax in workflow definition: ${(err as Error).message}`);
        }
      },
      false: () => raw,
    };

    const payload = payloadResolvers[String(isString)]();
    const parseResult = WorkflowDefinitionSchema.safeParse(payload);

    const validationActions: Record<string, () => WorkflowDefinition> = {
      false: () => {
        const issueSummary = (!parseResult.success ? parseResult.error.issues : [])
          .map((issue) => `[${issue.path.join('.')}] ${issue.message}`)
          .join('; ');
        throw new Error(`Workflow schema validation error: ${issueSummary}`);
      },
      true: () => parseResult.data as WorkflowDefinition,
    };

    const workflow = validationActions[String(parseResult.success)]();

    const needsDomainInference = !workflow.circuitBreakerDomain && Boolean(workflow.baseUrl);
    const domainInferenceActions: Record<string, () => void> = {
      true: () => {
        try {
          const url = new URL(workflow.baseUrl!);
          workflow.circuitBreakerDomain = url.hostname;
        } catch {
          // Ignored
        }
      },
      false: () => {},
    };
    domainInferenceActions[String(needsDomainInference)]();

    return workflow;
  }

  static createContext(
    workflow: WorkflowDefinition,
    runtimeOverrides?: Record<string, unknown>
  ): WorkflowContext {
    return {
      variables: {
        ...(workflow.variables || {}),
        ...(runtimeOverrides || {}),
      },
      env: { ...process.env },
      extracted: {},
      stepResults: {},
      trafficSummary: {
        totalRequests: 0,
        totalResponses: 0,
        authRequiredCount: 0,
      },
    };
  }
}
