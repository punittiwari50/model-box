import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from 'playwright';
import { logger } from '@/core/logger.js';
import type { BrowserPool } from '@/concurrency/browser-pool.js';
import { WORKFLOW_RECORDING_CONSTANTS } from '@/constants/index.js';
import type { StepDefinition, WorkflowDefinition } from '@/types/workflow.js';
import type {
  RecordedRawEvent,
  RecordedWorkflowMetadata,
  RecordingSession,
  RecordingStopResponse,
} from '@/recorder/types.js';
import { ProfessionalWorkflowNameFormatter } from '@/recorder/name-formatter.js';
import { WorkflowDefaultsManager } from '@/recorder/workflow-defaults.js';
import { cookieStorageService } from '@/recorder/cookie-storage-service.js';

// ============================================================================
// Workflow Recorder Service (SOLID: SRP, OCP, Zero Branching)
// ============================================================================

export interface IWorkflowRecorderService {
  startRecording(targetUrl: string): Promise<{ sessionId: string; targetUrl: string; message: string }>;
  stopRecording(sessionId: string): Promise<RecordingStopResponse>;
  listRecordedWorkflows(): RecordedWorkflowMetadata[];
}

export class WorkflowRecorderService implements IWorkflowRecorderService {
  private pool: BrowserPool;
  private activeSessions = new Map<
    string,
    {
      session: RecordingSession;
      context: BrowserContext;
      page: Page;
      releaseSlot?: () => Promise<void>;
    }
  >();
  private nameFormatter = new ProfessionalWorkflowNameFormatter();
  private defaultsManager = new WorkflowDefaultsManager();
  private workflowsDir: string;

  constructor(pool: BrowserPool, workflowsDir?: string) {
    this.pool = pool;
    this.workflowsDir = path.resolve(
      process.cwd(),
      workflowsDir || WORKFLOW_RECORDING_CONSTANTS.DEFAULT_WORKFLOWS_PATH
    );
    this.ensureWorkflowsDirectory();
  }

  private ensureWorkflowsDirectory(): void {
    const exists = fs.existsSync(this.workflowsDir);
    const dirActions: Record<string, () => void> = {
      true: () => {},
      false: () => fs.mkdirSync(this.workflowsDir, { recursive: true }),
    };
    dirActions[String(exists)]();
  }

  async startRecording(
    targetUrl: string
  ): Promise<{ sessionId: string; targetUrl: string; message: string }> {
    const sessionId = `rec-${randomUUID().substring(0, 8)}`;
    logger.info(`Starting interactive recording session ${sessionId} on: ${targetUrl}`);

    const session: RecordingSession = {
      sessionId,
      targetUrl,
      startedAt: Date.now(),
      isActive: true,
      events: [],
    };

    const browser = await this.pool.getBrowser();
    const storageStateFile = cookieStorageService.loadStorageState();
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ...(storageStateFile ? { storageState: storageStateFile } : {}),
    });

    const page = await context.newPage();

    // Expose action recorder callback into page context
    await page.exposeFunction(
      WORKFLOW_RECORDING_CONSTANTS.DOM_LISTENER_FUNCTION,
      (raw: RecordedRawEvent) => {
        const isSessionActive = session.isActive;
        const pushActions: Record<string, () => void> = {
          true: () => {
            logger.info(`[Recorder:${sessionId}] Captured ${raw.eventType} on ${raw.selector}`);
            session.events.push(raw);
          },
          false: () => {},
        };
        pushActions[String(isSessionActive)]();
      }
    );

    // Inject DOM event listener script
    await page.addInitScript((fnName: string) => {
      const getSmartSelector = (el: Element): { primary: string; fallbacks: string[] } => {
        const fallbacks: string[] = [];

        // 1. Check ID
        const id = el.getAttribute('id');
        const hasId = Boolean(id && !id.match(/\d{4,}/));
        const idSelector = hasId ? `#${id}` : '';

        // 2. Check Data Test ID
        const testId =
          el.getAttribute('data-testid') ||
          el.getAttribute('data-test') ||
          el.getAttribute('data-cy');
        const testIdSelector = testId ? `[data-testid="${testId}"]` : '';

        // 3. Check Name
        const nameAttr = el.getAttribute('name');
        const nameSelector = nameAttr ? `${el.tagName.toLowerCase()}[name="${nameAttr}"]` : '';

        // 4. Check Aria Label
        const ariaLabel = el.getAttribute('aria-label');
        const ariaSelector = ariaLabel ? `[aria-label="${ariaLabel}"]` : '';

        // 5. Check Placeholder
        const placeholder = el.getAttribute('placeholder');
        const placeholderSelector = placeholder ? `[placeholder="${placeholder}"]` : '';

        // 6. Check Text for buttons/anchors
        const text = (el.textContent || '').trim().substring(0, 30);
        const textSelector =
          text && (el.tagName === 'BUTTON' || el.tagName === 'A')
            ? `${el.tagName.toLowerCase()}:has-text("${text}")`
            : '';

        const candidates = [
          idSelector,
          testIdSelector,
          nameSelector,
          ariaSelector,
          placeholderSelector,
          textSelector,
        ].filter(Boolean);

        const primary = candidates[0] || el.tagName.toLowerCase();
        const remainingFallbacks = candidates.slice(1);

        return {
          primary,
          fallbacks: remainingFallbacks,
        };
      };

      window.addEventListener(
        'click',
        (e) => {
          const target = e.target as Element | null;
          Boolean(target) &&
            (() => {
              const { primary, fallbacks } = getSmartSelector(target as Element);
              (window as unknown as Record<string, (arg: unknown) => void>)[fnName]({
                eventType: 'click',
                tagName: (target as Element).tagName,
                selector: primary,
                fallbacks,
                url: window.location.href,
                timestamp: Date.now(),
              });
            })();
        },
        true
      );

      window.addEventListener(
        'change',
        (e) => {
          const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
          Boolean(target) &&
            (() => {
              const { primary, fallbacks } = getSmartSelector(target as Element);
              (window as unknown as Record<string, (arg: unknown) => void>)[fnName]({
                eventType: 'change',
                tagName: (target as Element).tagName,
                selector: primary,
                fallbacks,
                value: (target as HTMLInputElement).value,
                url: window.location.href,
                timestamp: Date.now(),
              });
            })();
        },
        true
      );

      window.addEventListener(
        'keydown',
        (e) => {
          const target = e.target as Element | null;
          const isEnter = Boolean(e.key === 'Enter');
          Boolean(isEnter && target) &&
            (() => {
              const { primary, fallbacks } = getSmartSelector(target as Element);
              (window as unknown as Record<string, (arg: unknown) => void>)[fnName]({
                eventType: 'keydown',
                key: 'Enter',
                selector: primary,
                fallbacks,
                url: window.location.href,
                timestamp: Date.now(),
              });
            })();
        },
        true
      );
    }, WORKFLOW_RECORDING_CONSTANTS.DOM_LISTENER_FUNCTION);

    // Initial navigation
    session.events.push({
      eventType: 'navigation',
      selector: 'body',
      fallbacks: [],
      url: targetUrl,
      timestamp: Date.now(),
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

    this.activeSessions.set(sessionId, {
      session,
      context,
      page,
    });

    return {
      sessionId,
      targetUrl,
      message: `Recording session active. Interact with the browser target. Call stopRecording('${sessionId}') when finished.`,
    };
  }

  async stopRecording(sessionId: string): Promise<RecordingStopResponse> {
    const sessionData = this.activeSessions.get(sessionId);
    const hasSession = Boolean(sessionData);

    const sessionResolvers: Record<string, () => Promise<RecordingStopResponse>> = {
      false: async () => {
        throw new Error(`Recording session not found or already terminated: ${sessionId}`);
      },
      true: async () => {
        const { session, context } = sessionData!;
        session.isActive = false;

        try {
          await cookieStorageService.saveStorageState(context);
        } catch (cookieErr) {
          logger.warn(`[WorkflowRecorder] Failed to persist auth storage state: ${cookieErr}`);
        }

        await context.close().catch(() => {});
        this.activeSessions.delete(sessionId);

        const durationMs = Date.now() - session.startedAt;
        const steps = this.compileEventsToSteps(session.events);

        const primaryAction = steps[0]?.action || 'workflow';
        const { workflow } = this.defaultsManager.applyDefaults(
          {
            baseUrl: session.targetUrl,
            steps,
          },
          session.targetUrl,
          primaryAction
        );

        const fileName = this.nameFormatter.formatFileName(session.targetUrl, primaryAction);
        const savedPath = path.join(this.workflowsDir, fileName);

        fs.writeFileSync(savedPath, JSON.stringify(workflow, null, 2), 'utf-8');
        logger.info(`Recorded workflow persisted to bidirectional volume: ${savedPath}`);

        return {
          sessionId,
          durationMs,
          totalEventsRecorded: session.events.length,
          stepsGeneratedCount: steps.length,
          workflow,
          fileName,
          savedPath,
        };
      },
    };

    return sessionResolvers[String(hasSession)]();
  }

  listRecordedWorkflows(): RecordedWorkflowMetadata[] {
    this.ensureWorkflowsDirectory();
    const files = fs.readdirSync(this.workflowsDir);
    const jsonFiles = files.filter((f) => f.endsWith(WORKFLOW_RECORDING_CONSTANTS.NAME_PATTERNS.EXTENSION));

    return jsonFiles.map((fileName) => {
      const fullPath = path.join(this.workflowsDir, fileName);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(content) as WorkflowDefinition;
        const stat = fs.statSync(fullPath);

        const timeResolvers: Record<string, () => string> = {
          true: () => stat.birthtime.toISOString(),
          false: () => stat.mtime.toISOString(),
        };
        const createdAt = timeResolvers[String(stat.birthtimeMs > 0)]();

        return {
          fileName,
          filePath: fullPath,
          workflowId: parsed.id || fileName,
          name: parsed.name || fileName,
          baseUrl: parsed.baseUrl,
          stepsCount: parsed.steps?.length || 0,
          createdAt,
        };
      } catch {
        return {
          fileName,
          filePath: fullPath,
          workflowId: fileName,
          name: fileName,
          stepsCount: 0,
          createdAt: new Date().toISOString(),
        };
      }
    });
  }

  private compileEventsToSteps(events: RecordedRawEvent[]): StepDefinition[] {
    const steps: StepDefinition[] = [];
    let stepIndex = 1;

    events.forEach((ev) => {
      const actionMap: Record<string, () => StepDefinition> = {
        navigation: () => ({
          id: `step-${stepIndex++}`,
          action: 'navigate',
          targetUrl: ev.url,
          description: `Navigate to ${ev.url}`,
          timeoutMs: WORKFLOW_RECORDING_CONSTANTS.DEFAULT_ACTION_TIMEOUT_MS,
        }),
        click: () => ({
          id: `step-${stepIndex++}`,
          action: 'click',
          selector: { primary: ev.selector, fallbacks: ev.fallbacks },
          description: `Click ${ev.selector}`,
          timeoutMs: WORKFLOW_RECORDING_CONSTANTS.DEFAULT_ACTION_TIMEOUT_MS,
        }),
        change: () => ({
          id: `step-${stepIndex++}`,
          action: 'fill',
          selector: { primary: ev.selector, fallbacks: ev.fallbacks },
          value: ev.value || '',
          description: `Fill ${ev.selector} with '${ev.value || ''}'`,
          timeoutMs: WORKFLOW_RECORDING_CONSTANTS.DEFAULT_ACTION_TIMEOUT_MS,
        }),
        keydown: () => ({
          id: `step-${stepIndex++}`,
          action: 'press',
          selector: { primary: ev.selector, fallbacks: ev.fallbacks },
          value: ev.key || 'Enter',
          description: `Press ${ev.key || 'Enter'} on ${ev.selector}`,
          timeoutMs: WORKFLOW_RECORDING_CONSTANTS.DEFAULT_ACTION_TIMEOUT_MS,
        }),
      };

      const handler = actionMap[ev.eventType];
      const hasHandler = Boolean(handler);
      const pushActions: Record<string, () => void> = {
        true: () => steps.push(handler!()),
        false: () => {},
      };
      pushActions[String(hasHandler)]();
    });

    return steps;
  }
}
