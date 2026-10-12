import type { Page } from 'playwright';
import { logger } from '@/core/logger.js';
import type {
  StepActionType,
  StepDefinition,
  StepExecutionResult,
  WorkflowContext,
} from '@/types/workflow.js';
import { DynamicResolver } from '@/engine/dynamic-resolver.js';
import { ollamaConnector } from '@/connectors/ollama-connector.js';
import { comfyUiConnector } from '@/connectors/comfyui-connector.js';
import fs from 'node:fs';
import path from 'node:path';
import { EXECUTION_STATUS_NAMES, TIMEOUT_DEFAULTS } from '@/constants/index.js';
import {
  jobRequirementPipeline,
  type JobRequirementPayload,
} from '@/recorder/job-requirement-pipeline.js';
import {
  googleDocsProfileService,
  type ApplicantProfile,
} from '@/recorder/google-docs-profile-service.js';
import {
  resumeMatcherService,
} from '@/recorder/resume-matcher-service.js';

// ============================================================================
// Step Execution Strategy Pattern (SOLID: SRP, OCP, LSP, ISP, DIP)
// ============================================================================

export interface StepExecutionContext {
  step: StepDefinition;
  page: Page;
  context: WorkflowContext;
  resolvedValue: unknown;
  baseUrl?: string;
  findActiveSelector(): Promise<string>;
}

export interface IStepActionStrategy {
  readonly action: StepActionType;
  execute(ctx: StepExecutionContext): Promise<unknown>;
}

export class NavigateActionStrategy implements IStepActionStrategy {
  readonly action = 'navigate' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const rawTarget = ctx.step.targetUrl || (ctx.resolvedValue as string) || ctx.baseUrl || '';
    let target = DynamicResolver.resolveString(rawTarget, ctx.context);

    const isRelative =
      !target.startsWith('http://') && !target.startsWith('https://') && Boolean(ctx.baseUrl);
    const targetFixers: Record<string, () => string> = {
      true: () => new URL(target, ctx.baseUrl).toString(),
      false: () => target,
    };
    target = (targetFixers[String(isRelative)] ?? targetFixers.false)();

    const isNetworkIdle = ctx.step.waitCondition === 'networkidle';
    const waitConditions: Record<string, 'networkidle' | 'domcontentloaded'> = {
      true: 'networkidle',
      false: 'domcontentloaded',
    };
    const waitUntil = waitConditions[String(isNetworkIdle)] ?? 'domcontentloaded';

    await ctx.page.goto(target, {
      waitUntil,
      timeout: ctx.step.timeoutMs || TIMEOUT_DEFAULTS.NAVIGATION_TIMEOUT_MS,
    });
    return { navigatedUrl: ctx.page.url() };
  }
}

export class ClickActionStrategy implements IStepActionStrategy {
  readonly action = 'click' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    await ctx.page.click(sel, { timeout: ctx.step.timeoutMs || TIMEOUT_DEFAULTS.DEFAULT_STEP_ACTION_TIMEOUT_MS });
    return { clicked: sel };
  }
}

export class FillActionStrategy implements IStepActionStrategy {
  readonly action = 'fill' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    const hasValue = ctx.resolvedValue !== undefined;
    const valueResolvers: Record<string, () => string> = {
      true: () => String(ctx.resolvedValue),
      false: () => '',
    };
    const text = valueResolvers[String(hasValue)]();
    await ctx.page.fill(sel, text, {
      timeout: ctx.step.timeoutMs || TIMEOUT_DEFAULTS.DEFAULT_STEP_ACTION_TIMEOUT_MS,
    });
    return { filled: sel, valueLength: text.length };
  }
}

export class TypeActionStrategy implements IStepActionStrategy {
  readonly action = 'type' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    const hasValue = ctx.resolvedValue !== undefined;
    const valueResolvers: Record<string, () => string> = {
      true: () => String(ctx.resolvedValue),
      false: () => '',
    };
    const text = valueResolvers[String(hasValue)]();
    await ctx.page.type(sel, text, {
      timeout: ctx.step.timeoutMs || TIMEOUT_DEFAULTS.DEFAULT_STEP_ACTION_TIMEOUT_MS,
    });
    return { typed: sel };
  }
}

export class PressActionStrategy implements IStepActionStrategy {
  readonly action = 'press' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    const key = (ctx.resolvedValue as string) || 'Enter';
    await ctx.page.press(sel, key, {
      timeout: ctx.step.timeoutMs || TIMEOUT_DEFAULTS.DEFAULT_STEP_ACTION_TIMEOUT_MS,
    });
    return { pressed: key, selector: sel };
  }
}

export class HoverActionStrategy implements IStepActionStrategy {
  readonly action = 'hover' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    await ctx.page.hover(sel, {
      timeout: ctx.step.timeoutMs || TIMEOUT_DEFAULTS.DEFAULT_STEP_ACTION_TIMEOUT_MS,
    });
    return { hovered: sel };
  }
}

export class SelectOptionActionStrategy implements IStepActionStrategy {
  readonly action = 'select_option' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    const optionVal = String(ctx.resolvedValue);
    await ctx.page.selectOption(sel, optionVal, {
      timeout: ctx.step.timeoutMs || TIMEOUT_DEFAULTS.DEFAULT_STEP_ACTION_TIMEOUT_MS,
    });
    return { selected: optionVal };
  }
}

export class WaitForSelectorActionStrategy implements IStepActionStrategy {
  readonly action = 'wait_for_selector' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    await ctx.page.waitForSelector(sel, {
      timeout: ctx.step.timeoutMs || TIMEOUT_DEFAULTS.DEFAULT_STEP_ACTION_TIMEOUT_MS,
    });
    return { found: sel };
  }
}

export class WaitForTimeoutActionStrategy implements IStepActionStrategy {
  readonly action = 'wait_for_timeout' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const isNumber = typeof ctx.resolvedValue === 'number';
    const durationResolvers: Record<string, () => number> = {
      true: () => ctx.resolvedValue as number,
      false: () => Number(ctx.step.timeoutMs || TIMEOUT_DEFAULTS.WAIT_TIMEOUT_MS),
    };
    const duration = durationResolvers[String(isNumber)]();
    await ctx.page.waitForTimeout(duration);
    return { waitedMs: duration };
  }
}

export class WaitForResponseActionStrategy implements IStepActionStrategy {
  readonly action = 'wait_for_response' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const targetPattern = DynamicResolver.resolveString(String(ctx.resolvedValue || ''), ctx.context);
    const response = await ctx.page.waitForResponse((res) => res.url().includes(targetPattern), {
      timeout: ctx.step.timeoutMs || TIMEOUT_DEFAULTS.RESPONSE_WAIT_TIMEOUT_MS,
    });
    return { matchedUrl: response.url(), status: response.status() };
  }
}

export class EvaluateActionStrategy implements IStepActionStrategy {
  readonly action = 'evaluate' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const expr = ctx.step.evaluateExpression || (ctx.resolvedValue as string);
    const hasExpr = Boolean(expr);

    const exprActions: Record<string, () => Promise<unknown>> = {
      true: async () => ctx.page.evaluate(expr!),
      false: async () => {
        throw new Error(`Step '${ctx.step.id}' action 'evaluate' requires evaluateExpression.`);
      },
    };

    return exprActions[String(hasExpr)]();
  }
}

export class ExtractTextActionStrategy implements IStepActionStrategy {
  readonly action = 'extract_text' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    const text = await ctx.page.textContent(sel);
    return text?.trim() || '';
  }
}

export class ExtractAttributeActionStrategy implements IStepActionStrategy {
  readonly action = 'extract_attribute' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    const attrName = (ctx.resolvedValue as string) || 'href';
    const attrVal = await ctx.page.getAttribute(sel, attrName);
    return attrVal || '';
  }
}

export class ExtractTableActionStrategy implements IStepActionStrategy {
  readonly action = 'extract_table' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    return ctx.page.$$eval(`${sel} tr`, (rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent?.trim() || '')
      )
    );
  }
}

export class ExtractAllActionStrategy implements IStepActionStrategy {
  readonly action = 'extract_all' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const sel = await ctx.findActiveSelector();
    return ctx.page.$$eval(sel, (elements) => elements.map((el) => el.textContent?.trim() || ''));
  }
}

export class ScreenshotActionStrategy implements IStepActionStrategy {
  readonly action = 'screenshot' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const fullPage = ctx.step.screenshotOptions?.fullPage ?? true;
    const buffer = await ctx.page.screenshot({ fullPage });
    const base64 = buffer.toString('base64');
    return {
      base64Snippet: `${base64.substring(0, 100)}...`,
      sizeBytes: buffer.length,
      path: ctx.step.screenshotOptions?.path,
    };
  }
}

export class ScrollActionStrategy implements IStepActionStrategy {
  readonly action = 'scroll' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const isNumber = typeof ctx.resolvedValue === 'number';
    const scrollResolvers: Record<string, () => number> = {
      true: () => ctx.resolvedValue as number,
      false: () => 1000,
    };
    const scrollY = scrollResolvers[String(isNumber)]();
    await ctx.page.evaluate((y) => window.scrollBy(0, y), scrollY);
    return { scrolledY: scrollY };
  }
}

export class CallOllamaActionStrategy implements IStepActionStrategy {
  readonly action = 'call_ollama' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const hasPromptDef = Boolean(ctx.step.aiPrompt);
    const promptCheckActions: Record<string, () => void> = {
      false: () => {
        throw new Error(`Step '${ctx.step.id}' action 'call_ollama' requires aiPrompt definition.`);
      },
      true: () => {},
    };
    promptCheckActions[String(hasPromptDef)]();

    const prompt = DynamicResolver.resolveString(ctx.step.aiPrompt!.prompt, ctx.context);
    const needsScreenshot = Boolean(ctx.step.aiPrompt!.includeScreenshot);

    const screenshotResolvers: Record<string, () => Promise<string | undefined>> = {
      true: async () => {
        const buf = await ctx.page.screenshot();
        return buf.toString('base64');
      },
      false: async () => undefined,
    };

    const screenshotBase64 = await screenshotResolvers[String(needsScreenshot)]();

    const aiRes = await ollamaConnector.generate({
      model: ctx.step.aiPrompt!.model,
      prompt,
      system: ctx.step.aiPrompt!.systemPrompt,
      images: screenshotBase64 ? [screenshotBase64] : undefined,
    });

    return { response: aiRes.response, model: aiRes.model };
  }
}

export class CallComfyUiActionStrategy implements IStepActionStrategy {
  readonly action = 'call_comfyui' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const hasComfyDef = Boolean(ctx.step.comfyPrompt);
    const comfyCheckActions: Record<string, () => void> = {
      false: () => {
        throw new Error(`Step '${ctx.step.id}' action 'call_comfyui' requires comfyPrompt definition.`);
      },
      true: () => {},
    };
    comfyCheckActions[String(hasComfyDef)]();

    const promptText = DynamicResolver.resolveString(ctx.step.comfyPrompt!.positivePrompt, ctx.context);
    const promptGraph = {
      '3': {
        class_type: 'KSampler',
        inputs: {
          seed: ctx.step.comfyPrompt!.seed || Math.floor(Math.random() * 1000000),
          steps: 20,
          cfg: 8,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: 1,
        },
      },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: { text: promptText },
      },
    };

    const queued = await comfyUiConnector.queuePrompt(promptGraph);
    return { promptId: queued.prompt_id, status: 'QUEUED' };
  }
}

export function parseRelativeListedTime(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const parsedEpoch = Date.parse(trimmed);
  if (!isNaN(parsedEpoch) && /^\d{4}-\d{2}/.test(trimmed)) {
    return new Date(parsedEpoch).toISOString();
  }
  const lower = trimmed.toLowerCase();
  const now = Date.now();
  const mMin = lower.match(/(\d+)\s*(?:minute|min)s?\s*ago/);
  if (mMin) return new Date(now - parseInt(mMin[1], 10) * 60 * 1000).toISOString();
  const mHour = lower.match(/(\d+)\s*hour?s?\s*ago/);
  if (mHour) return new Date(now - parseInt(mHour[1], 10) * 3600 * 1000).toISOString();
  const mDay = lower.match(/(\d+)\s*day?s?\s*ago/);
  if (mDay) return new Date(now - parseInt(mDay[1], 10) * 86400 * 1000).toISOString();
  const mWeek = lower.match(/(\d+)\s*week?s?\s*ago/);
  if (mWeek) return new Date(now - parseInt(mWeek[1], 10) * 7 * 86400 * 1000).toISOString();
  const mMonth = lower.match(/(\d+)\s*month?s?\s*ago/);
  if (mMonth) return new Date(now - parseInt(mMonth[1], 10) * 30 * 86400 * 1000).toISOString();
  return undefined;
}

export class ExtractJobRequirementActionStrategy implements IStepActionStrategy {
  readonly action = 'extract_job_requirement' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const opts = ctx.step.jobRequirementOptions || {};
    const page = ctx.page;

    // 1. Resolve LinkedIn URL
    const pageUrl = page.url();
    let linkedinUrl = opts.linkedinUrl || ctx.step.targetUrl || pageUrl;

    const currentJobIdMatch = pageUrl.match(/currentJobId=(\d+)/);
    if (currentJobIdMatch && currentJobIdMatch[1]) {
      linkedinUrl = `https://www.linkedin.com/jobs/view/${currentJobIdMatch[1]}`;
    }

    // 2. Extract Job Title
    let jobTitle = '';
    const titleSelectors = [
      opts.jobTitleSelector,
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      'h1.t-24',
      '.top-card-layout__title',
      'h1',
    ].filter(Boolean) as string[];

    for (const sel of titleSelectors) {
      try {
        const text = await page.locator(sel).first().textContent({ timeout: 2000 });
        if (text && text.trim().length > 0) {
          jobTitle = text.trim();
          break;
        }
      } catch {}
    }

    // 3. Extract Company Name
    let companyName = '';
    const companySelectors = [
      opts.companyNameSelector,
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name',
      '.topcard__flavor--black-link',
      '.topcard__org-name-link',
      '.job-details-jobs-unified-top-card__primary-description a',
    ].filter(Boolean) as string[];

    for (const sel of companySelectors) {
      try {
        const text = await page.locator(sel).first().textContent({ timeout: 2000 });
        if (text && text.trim().length > 0) {
          companyName = text.trim();
          break;
        }
      } catch {}
    }

    // 4. Extract Location
    let location = '';
    const locationSelectors = [
      opts.locationSelector,
      '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet',
    ].filter(Boolean) as string[];

    for (const sel of locationSelectors) {
      try {
        const text = await page.locator(sel).first().textContent({ timeout: 1500 });
        if (text && text.trim().length > 0) {
          location = text.trim();
          break;
        }
      } catch {}
    }

    // 5. Extract Full Job Description
    let rawDescription = '';
    const descSelectors = [
      opts.descriptionSelector,
      '#job-details',
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.show-more-less-html__markup',
      '.jobs-description',
      'article',
    ].filter(Boolean) as string[];

    for (const sel of descSelectors) {
      try {
        const text = await page.locator(sel).first().innerText({ timeout: 2500 });
        if (text && text.trim().length > 30) {
          rawDescription = text.trim();
          break;
        }
      } catch {}
    }

    // Fallback: If values are explicitly passed in ctx.resolvedValue
    if (typeof ctx.resolvedValue === 'object' && ctx.resolvedValue !== null) {
      const val = ctx.resolvedValue as Partial<JobRequirementPayload>;
      if (val.jobTitle) jobTitle = val.jobTitle;
      if (val.companyName) companyName = val.companyName;
      if (val.location) location = val.location;
      if (val.linkedinUrl) linkedinUrl = val.linkedinUrl;
      if (val.rawDescription) rawDescription = val.rawDescription;
    }

    // Fallbacks if DOM extraction yielded empty values
    if (!jobTitle) jobTitle = 'Software Engineer Role';
    if (!companyName) companyName = 'LinkedIn Listed Company';
    if (!rawDescription) {
      try {
        rawDescription = await page.locator('body').innerText({ timeout: 3000 });
        rawDescription = rawDescription.substring(0, 5000);
      } catch {
        rawDescription = 'Requirement details extracted from page.';
      }
    }

    // 6. Extract First Listed Time (recency sorting)
    let firstListedAt: string | undefined = opts.firstListedAt;
    if (!firstListedAt) {
      try {
        // Inspect JSON-LD script for official JobPosting datePosted
        const jsonLdDate = await page.$$eval('script[type="application/ld+json"]', (scripts) => {
          for (const s of scripts) {
            try {
              const data = JSON.parse(s.textContent || '{}');
              if (data['@type'] === 'JobPosting' && data.datePosted) return data.datePosted;
              if (Array.isArray(data['@graph'])) {
                const jp = data['@graph'].find((g: any) => g && g['@type'] === 'JobPosting');
                if (jp && jp.datePosted) return jp.datePosted;
              }
            } catch {}
          }
          return null;
        });
        if (jsonLdDate) {
          firstListedAt = new Date(jsonLdDate).toISOString();
        }
      } catch {}

      if (!firstListedAt) {
        const postedSelectors = [
          opts.postedAtSelector,
          '.job-details-jobs-unified-top-card__primary-description-container span.tvm__text',
          '.jobs-unified-top-card__posted-date',
          'span.posted-time-ago__text',
          'span:has-text("ago")',
          '.topcard__flavor--metadata',
          'time[datetime]',
        ].filter(Boolean) as string[];

        for (const sel of postedSelectors) {
          try {
            const loc = page.locator(sel);
            const count = await loc.count();
            for (let i = 0; i < Math.min(count, 3); i++) {
              const txt = await loc.nth(i).textContent({ timeout: 1000 });
              if (txt && /ago|posted|reposted/i.test(txt)) {
                const parsed = parseRelativeListedTime(txt);
                if (parsed) {
                  firstListedAt = parsed;
                  break;
                }
              }
            }
            if (firstListedAt) break;
          } catch {}
        }
      }
    }

    if (!firstListedAt) {
      firstListedAt = new Date().toISOString();
    }

    // 7. Probe Apply Button to Understand Official Career Site URL
    let officialApplyUrl: string | undefined = opts.officialApplyUrl;
    if (!officialApplyUrl) {
      const applySelectors = [
        'a.jobs-apply-button',
        'a[href*="externalApply"]',
        'button.jobs-apply-button',
        'a.jobs-apply-button--top-card',
        '.job-details-jobs-unified-top-card__apply-button a',
        '.jobs-unified-top-card__apply-button a',
        'button[aria-label*="Apply to"]',
        '[data-control-name="jobdetails_topcard_inapply"]',
        'button:has-text("Apply")',
      ];

      for (const sel of applySelectors) {
        try {
          const locator = page.locator(sel).first();
          if ((await locator.count()) > 0) {
            const href = await locator.getAttribute('href').catch(() => null);
            const dataUrl = await locator.getAttribute('data-apply-url').catch(() => null);
            const rawUrl = dataUrl || href;
            if (rawUrl) {
              const matchParam = rawUrl.match(/[?&](?:url|dest|target|redirect_url)=([^&]+)/i);
              if (matchParam && matchParam[1]) {
                officialApplyUrl = decodeURIComponent(matchParam[1]);
                break;
              } else if (!rawUrl.includes('linkedin.com/jobs/apply')) {
                officialApplyUrl = rawUrl;
                break;
              }
            }

            // Click probe to capture popup or redirect URL
            const [popup] = await Promise.all([
              page.waitForEvent('popup', { timeout: 3000 }).catch(() => null),
              locator.click({ timeout: 1500, force: true }).catch(() => null),
            ]);

            if (popup) {
              await popup.waitForLoadState('domcontentloaded', { timeout: 3500 }).catch(() => null);
              const popUrl = popup.url();
              if (popUrl && !popUrl.startsWith('about:blank') && !popUrl.includes('linkedin.com/jobs/apply')) {
                officialApplyUrl = popUrl;
              }
              await popup.close().catch(() => null);
              if (officialApplyUrl) break;
            }
          }
        } catch (applyErr) {
          logger.debug(`[ExtractJobRequirement] Apply probe: ${applyErr}`);
        }
      }
    }

    if (!officialApplyUrl && companyName) {
      const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
      officialApplyUrl = `https://www.${slug}.com/careers`;
    }

    logger.info(`[ExtractJobRequirement] Extracted: "${jobTitle}" at "${companyName}" (Listed: ${firstListedAt}, Apply: ${officialApplyUrl})`);

    const payload: JobRequirementPayload = {
      jobTitle,
      companyName,
      location,
      linkedinUrl,
      officialApplyUrl,
      firstListedAt,
      rawDescription,
    };

    const result = await jobRequirementPipeline.processAndPersist(payload);
    return result;
  }
}

export class AutofillFormActionStrategy implements IStepActionStrategy {
  readonly action = 'autofill_form' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const opts = ctx.step.formAutofillOptions || {};
    const page = ctx.page;

    // 1. Resolve Profile from Google Sheet, cached file, or payload
    let profile: ApplicantProfile | null = null;
    if (opts.googleSheetUrl) {
      profile = await googleDocsProfileService.fetchProfileFromGoogleSheet(opts.googleSheetUrl);
    } else if (opts.profileFilePath) {
      if (fs.existsSync(opts.profileFilePath)) {
        profile = JSON.parse(fs.readFileSync(opts.profileFilePath, 'utf-8'));
      }
    } else if (typeof ctx.resolvedValue === 'object' && ctx.resolvedValue !== null) {
      profile = ctx.resolvedValue as ApplicantProfile;
    }

    if (!profile) {
      profile = googleDocsProfileService.loadCachedProfile();
    }

    if (!profile) {
      throw new Error(
        `Step '${ctx.step.id}' action 'autofill_form' failed: No applicant profile available. Provide googleSheetUrl, profileFilePath, or configure cached profile.`
      );
    }

    logger.info(`[AutofillForm] Autofilling application form on ${page.url()} for: ${profile.fullName}`);

    const filledFields: Array<{ selector: string; fieldType: string; matchedSemantic: string; value: string }> = [];

    const semanticValues: Record<string, string> = {
      first_name: profile.firstName,
      last_name: profile.lastName,
      full_name: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      linkedin: profile.linkedinUrl,
      github: profile.githubUrl || '',
      portfolio: profile.portfolioUrl || '',
      location: profile.location,
      city: profile.city,
      state: profile.state,
      postal_code: profile.postalCode,
      country: profile.country,
      current_title: profile.currentTitle,
      current_company: profile.currentCompany || '',
      years_experience: String(profile.yearsOfExperience),
      highest_degree: profile.highestDegree,
      summary: profile.summary || '',
      work_authorization: profile.screeningAnswers.workAuthorization || 'Yes',
      require_sponsorship: profile.screeningAnswers.requireSponsorship || 'No',
      notice_period: String(profile.screeningAnswers.noticePeriodDays || 30),
      current_salary: profile.screeningAnswers.currentSalary || '',
      expected_salary: profile.screeningAnswers.expectedSalary || '',
      willing_to_relocate: profile.screeningAnswers.willingToRelocate || 'Yes',
    };

    if (opts.customFieldMappings) {
      Object.assign(semanticValues, opts.customFieldMappings);
    }

    const elements = await page.$$(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
    );

    for (const el of elements) {
      try {
        const isVisible = await el.isVisible();
        if (!isVisible) continue;

        const tag = await el.evaluate((node) => node.tagName.toLowerCase());
        const type = (await el.getAttribute('type'))?.toLowerCase() || (tag === 'textarea' ? 'textarea' : 'text');
        const name = (await el.getAttribute('name')) || '';
        const id = (await el.getAttribute('id')) || '';
        const placeholder = (await el.getAttribute('placeholder')) || '';
        const ariaLabel = (await el.getAttribute('aria-label')) || '';
        const autocomplete = (await el.getAttribute('autocomplete')) || '';

        let labelText = '';
        if (id) {
          const labelEl = await page.$(`label[for="${id}"]`);
          if (labelEl) labelText = (await labelEl.textContent()) || '';
        }
        if (!labelText) {
          labelText = await el.evaluate((node) => {
            const parentLabel = node.closest('label');
            return parentLabel ? parentLabel.textContent || '' : '';
          });
        }

        const combined = `${name} ${id} ${placeholder} ${ariaLabel} ${autocomplete} ${labelText}`.toLowerCase();

        if (type === 'file') {
          const resumePath = opts.resumeFilePath || path.resolve(process.cwd(), 'downloads/resume.pdf');
          if (fs.existsSync(resumePath)) {
            await el.setInputFiles(resumePath);
            filledFields.push({ selector: name || id || 'input[type=file]', fieldType: 'file', matchedSemantic: 'resume_file', value: resumePath });
          }
          continue;
        }

        let matchedKey: string | null = null;
        if (/first.*name|given.*name/i.test(combined)) matchedKey = 'first_name';
        else if (/last.*name|family.*name|surname/i.test(combined)) matchedKey = 'last_name';
        else if (/full.*name|\bname\b/i.test(combined) && !/company|school|user/i.test(combined)) matchedKey = 'full_name';
        else if (/e[-]?mail/i.test(combined)) matchedKey = 'email';
        else if (/phone|mobile|tel|cell|contact/i.test(combined)) matchedKey = 'phone';
        else if (/linkedin/i.test(combined)) matchedKey = 'linkedin';
        else if (/github/i.test(combined)) matchedKey = 'github';
        else if (/portfolio|website|homepage/i.test(combined)) matchedKey = 'portfolio';
        else if (/city/i.test(combined)) matchedKey = 'city';
        else if (/state|province/i.test(combined)) matchedKey = 'state';
        else if (/zip|postal|pin/i.test(combined)) matchedKey = 'postal_code';
        else if (/address|street/i.test(combined)) matchedKey = 'location';
        else if (/country/i.test(combined)) matchedKey = 'country';
        else if (/title|current.*role|designation/i.test(combined)) matchedKey = 'current_title';
        else if (/company|current.*employer/i.test(combined)) matchedKey = 'current_company';
        else if (/year.*exp|total.*exp|yoe/i.test(combined)) matchedKey = 'years_experience';
        else if (/authoriz|legally.*work|eligible/i.test(combined)) matchedKey = 'work_authorization';
        else if (/sponsor|visa/i.test(combined)) matchedKey = 'require_sponsorship';
        else if (/notice.*period|availability/i.test(combined)) matchedKey = 'notice_period';
        else if (/expected.*salary|desired.*compensation|expected.*ctc/i.test(combined)) matchedKey = 'expected_salary';
        else if (/current.*salary|current.*ctc/i.test(combined)) matchedKey = 'current_salary';
        else if (/relocat/i.test(combined)) matchedKey = 'willing_to_relocate';
        else if (/summary|cover.*letter|additional.*info/i.test(combined)) matchedKey = 'summary';

        if (matchedKey && semanticValues[matchedKey]) {
          const val = semanticValues[matchedKey];
          if (type === 'radio' || type === 'checkbox') {
            const isAffirmative = /yes|true|1/i.test(val);
            const isRadioYes = /yes|true/i.test(combined);
            if (isAffirmative === isRadioYes) {
              await el.check().catch(() => el.click());
              filledFields.push({ selector: name || id, fieldType: type, matchedSemantic: matchedKey, value: val });
            }
          } else if (tag === 'select') {
            await (el as any).selectOption({ label: val }).catch(async () => {
              await (el as any).selectOption({ value: val }).catch(() => {});
            });
            filledFields.push({ selector: name || id, fieldType: 'select', matchedSemantic: matchedKey, value: val });
          } else {
            await el.fill(val);
            filledFields.push({ selector: name || id, fieldType: type, matchedSemantic: matchedKey, value: val });
          }
        }
      } catch {
        // Continue processing other form fields
      }
    }

    let submitted = false;
    if (opts.submitAfterFill) {
      try {
        const submitBtn = await page.$(
          'button[type="submit"], input[type="submit"], button:has-text("Submit Application"), button:has-text("Apply"), button:has-text("Next")'
        );
        if (submitBtn) {
          await submitBtn.click();
          submitted = true;
        }
      } catch {}
    }

    return {
      status: 'SUCCESS',
      totalFilled: filledFields.length,
      filledFields,
      profileUsed: {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        source: profile.rawSource || 'local_cache',
      },
      submitted,
    };
  }
}

export class MatchResumeActionStrategy implements IStepActionStrategy {
  readonly action = 'match_resume' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const opts = ctx.step.resumeMatchOptions || {};

    let resumeText = opts.resumeText || '';
    if (!resumeText && opts.resumeFilePath && fs.existsSync(opts.resumeFilePath)) {
      resumeText = fs.readFileSync(opts.resumeFilePath, 'utf-8');
    }
    if (!resumeText) {
      const cached = googleDocsProfileService.loadCachedProfile();
      if (cached) {
        resumeText = [
          `Candidate: ${cached.fullName}`,
          `Current Title: ${cached.currentTitle}`,
          `Years of Experience: ${cached.yearsOfExperience}`,
          `Core Skills: ${cached.skills.join(', ')}`,
          cached.summary ? `Summary: ${cached.summary}` : '',
        ].filter(Boolean).join('\n');
      }
    }
    if (!resumeText) {
      throw new Error(`Step '${ctx.step.id}' action 'match_resume' requires resume text or a valid applicant profile.`);
    }

    let jobTitle = 'Target Role';
    let companyName = 'Target Company';
    let jobDescription = '';

    const lastExtracted = ctx.context.extracted[opts.jobRequirementKey || 'lastExtractedJob'] as any;
    if (lastExtracted) {
      jobTitle = lastExtracted.jobTitle || jobTitle;
      companyName = lastExtracted.companyName || companyName;
      jobDescription = lastExtracted.structuredRequirementsMd || lastExtracted.rawDescription || '';
    } else {
      jobTitle = (await ctx.page.title()) || jobTitle;
      jobDescription = await ctx.page.locator('body').innerText().catch(() => 'Job posting on page');
      jobDescription = jobDescription.substring(0, 4000);
    }

    const result = await resumeMatcherService.matchAndReviewProfile({
      resumeText,
      jobTitle,
      companyName,
      jobDescription,
      model: opts.targetModel,
    });

    return result;
  }
}

export class CustomizeResumeActionStrategy implements IStepActionStrategy {
  readonly action = 'customize_resume' as const;

  async execute(ctx: StepExecutionContext): Promise<unknown> {
    const opts = ctx.step.resumeMatchOptions || {};

    let resumeText = opts.resumeText || '';
    if (!resumeText && opts.resumeFilePath && fs.existsSync(opts.resumeFilePath)) {
      resumeText = fs.readFileSync(opts.resumeFilePath, 'utf-8');
    }
    if (!resumeText) {
      const cached = googleDocsProfileService.loadCachedProfile();
      if (cached) {
        resumeText = [
          `Candidate: ${cached.fullName}`,
          `Current Title: ${cached.currentTitle}`,
          `Years of Experience: ${cached.yearsOfExperience}`,
          `Core Skills: ${cached.skills.join(', ')}`,
          cached.summary ? `Summary: ${cached.summary}` : '',
        ].filter(Boolean).join('\n');
      }
    }
    if (!resumeText) {
      throw new Error(`Step '${ctx.step.id}' action 'customize_resume' requires resume text or profile.`);
    }

    let jobTitle = 'Target Role';
    let companyName = 'Target Company';
    let jobDescription = '';
    let linkedinUrl = ctx.page.url();

    const lastExtracted = ctx.context.extracted[opts.jobRequirementKey || 'lastExtractedJob'] as any;
    if (lastExtracted) {
      jobTitle = lastExtracted.jobTitle || jobTitle;
      companyName = lastExtracted.companyName || companyName;
      jobDescription = lastExtracted.structuredRequirementsMd || lastExtracted.rawDescription || '';
      linkedinUrl = lastExtracted.linkedinUrl || linkedinUrl;
    } else {
      jobTitle = (await ctx.page.title()) || jobTitle;
      jobDescription = await ctx.page.locator('body').innerText().catch(() => 'Job posting details');
      jobDescription = jobDescription.substring(0, 4000);
    }

    const result = await resumeMatcherService.customizeResumeForRole({
      resumeText,
      jobTitle,
      companyName,
      jobDescription,
      linkedinUrl,
      model: opts.targetModel,
      includeCoverLetter: opts.generateCoverLetter !== false,
    });

    return result;
  }
}

// ============================================================================
// Strategy Registry
// ============================================================================

export class StepActionRegistry {
  private static readonly STRATEGIES: Readonly<Record<string, IStepActionStrategy>> = {
    navigate: new NavigateActionStrategy(),
    click: new ClickActionStrategy(),
    fill: new FillActionStrategy(),
    type: new TypeActionStrategy(),
    press: new PressActionStrategy(),
    hover: new HoverActionStrategy(),
    select_option: new SelectOptionActionStrategy(),
    wait_for_selector: new WaitForSelectorActionStrategy(),
    wait_for_timeout: new WaitForTimeoutActionStrategy(),
    wait_for_response: new WaitForResponseActionStrategy(),
    evaluate: new EvaluateActionStrategy(),
    extract_text: new ExtractTextActionStrategy(),
    extract_attribute: new ExtractAttributeActionStrategy(),
    extract_table: new ExtractTableActionStrategy(),
    extract_all: new ExtractAllActionStrategy(),
    screenshot: new ScreenshotActionStrategy(),
    scroll: new ScrollActionStrategy(),
    call_ollama: new CallOllamaActionStrategy(),
    call_comfyui: new CallComfyUiActionStrategy(),
    extract_job_requirement: new ExtractJobRequirementActionStrategy(),
    autofill_form: new AutofillFormActionStrategy(),
    match_resume: new MatchResumeActionStrategy(),
    customize_resume: new CustomizeResumeActionStrategy(),
  };

  static getStrategy(action: string): IStepActionStrategy | undefined {
    return this.STRATEGIES[action];
  }
}

// ============================================================================
// Step Executor Service
// ============================================================================

export class StepExecutor {
  static async executeStep(
    step: StepDefinition,
    page: Page,
    context: WorkflowContext,
    baseUrl?: string
  ): Promise<StepExecutionResult> {
    const startTime = Date.now();
    let resolvedSelector: string | undefined;
    let resolvedValue: unknown;
    let stepOutput: unknown;

    try {
      logger.info(`Executing step '${step.id}': Action=${step.action}`);

      const candidateSelectors = DynamicResolver.resolveSelectors(step.selector, context);
      const hasValue = step.value !== undefined;

      const valueResolvers: Record<string, () => void> = {
        true: () => {
          resolvedValue = DynamicResolver.resolveValue(step.value, context);
        },
        false: () => {},
      };
      valueResolvers[String(hasValue)]();

      const findActiveSelector = async (): Promise<string> => {
        const hasNoSelectors = candidateSelectors.length === 0;
        const selectorValidationActions: Record<string, () => void> = {
          true: () => {
            throw new Error(`Step '${step.id}' requires a selector, but none was provided or resolved.`);
          },
          false: () => {},
        };
        selectorValidationActions[String(hasNoSelectors)]();

        const probeCandidate = async (index: number): Promise<string> => {
          const isExhausted = index >= candidateSelectors.length;
          const fallbackActions: Record<string, () => Promise<string>> = {
            true: async () => {
              resolvedSelector = candidateSelectors[0];
              return candidateSelectors[0];
            },
            false: async () => {
              const sel = candidateSelectors[index];
              try {
                const el = await page.$(sel);
                const foundActions: Record<string, () => Promise<string>> = {
                  true: async () => {
                    resolvedSelector = sel;
                    return sel;
                  },
                  false: () => probeCandidate(index + 1),
                };
                return (foundActions[String(Boolean(el))] ?? foundActions.false)();
              } catch {
                return probeCandidate(index + 1);
              }
            },
          };
          return (fallbackActions[String(isExhausted)] ?? fallbackActions.false)();
        };

        return probeCandidate(0);
      };

      const strategy = StepActionRegistry.getStrategy(step.action);
      const hasStrategy = Boolean(strategy);

      const dispatchActions: Record<string, () => Promise<unknown>> = {
        true: () =>
          strategy!.execute({
            step,
            page,
            context,
            resolvedValue,
            baseUrl,
            findActiveSelector,
          }),
        false: async () => {
          throw new Error(`Unsupported action type '${step.action}' in step '${step.id}'`);
        },
      };

      stepOutput = await dispatchActions[String(hasStrategy)]();

      const outputKey = step.outputKey || step.id;
      context.extracted[outputKey] = stepOutput;

      const durationMs = Date.now() - startTime;
      const result: StepExecutionResult = {
        stepId: step.id,
        action: step.action,
        status: EXECUTION_STATUS_NAMES.SUCCESS,
        durationMs,
        output: stepOutput,
        resolvedSelector,
        resolvedValue,
        timestamp: new Date().toISOString(),
      };

      context.stepResults[step.id] = result;
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Step '${step.id}' failed: ${errorMsg}`);

      const result: StepExecutionResult = {
        stepId: step.id,
        action: step.action,
        status: EXECUTION_STATUS_NAMES.FAILED,
        durationMs,
        error: errorMsg,
        resolvedSelector,
        resolvedValue,
        timestamp: new Date().toISOString(),
      };

      context.stepResults[step.id] = result;
      return result;
    }
  }
}
