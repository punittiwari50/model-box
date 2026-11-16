import fs from 'node:fs';
import path from 'node:path';
import type { StepDefinition, WorkflowDefinition } from '../../src/types/workflow.js';
import { WorkflowDefaultsManager } from '../../src/recorder/workflow-defaults.js';
import { WorkflowParser } from '../../src/engine/workflow-parser.js';

export function convertPlaywrightScriptToWorkflow(
  scriptContent: string,
  targetUrl = 'https://www.linkedin.com',
  workflowName = 'LinkedIn Manual Flow'
): WorkflowDefinition {
  const lines = scriptContent.split('\n');
  const steps: StepDefinition[] = [];
  let stepIndex = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

    // 1. Match goto / navigate
    const gotoMatch = line.match(/(?:page\.)?goto\(['"`]([^'"`]+)['"`]\)/);
    if (gotoMatch) {
      const url = gotoMatch[1];
      steps.push({
        id: `step-${stepIndex++}`,
        action: 'navigate',
        description: `Navigate to ${url}`,
        targetUrl: url,
        timeoutMs: 30000,
        optional: false,
        continueOnError: false,
      });
      continue;
    }

    // 2. Match fill
    const fillMatch = line.match(/(?:page\.)?(?:locator|getByRole|getByText|getByLabel|getByPlaceholder|getByTestId)?\s*\(([^)]+)\)\.fill\(['"`](.*?)['"`]\)/) ||
                      line.match(/page\.fill\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`](.*?)['"`]\s*\)/);
    if (fillMatch) {
      const selectorRaw = fillMatch[1].replace(/['"`]/g, '').trim();
      const fillVal = fillMatch[2];
      steps.push({
        id: `step-${stepIndex++}`,
        action: 'fill',
        description: `Fill ${selectorRaw}`,
        selector: {
          primary: selectorRaw,
          fallbacks: [selectorRaw],
        },
        value: fillVal,
        timeoutMs: 15000,
        optional: false,
        continueOnError: false,
      });
      continue;
    }

    // 3. Match click
    const clickMatch = line.match(/(?:page\.)?(?:locator|getByRole|getByText|getByLabel|getByPlaceholder|getByTestId)?\s*\(([^)]+)\)\.click\(\)/) ||
                       line.match(/page\.click\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    if (clickMatch) {
      const selectorRaw = clickMatch[1].replace(/['"`]/g, '').trim();
      steps.push({
        id: `step-${stepIndex++}`,
        action: 'click',
        description: `Click ${selectorRaw}`,
        selector: {
          primary: selectorRaw,
          fallbacks: [selectorRaw],
        },
        timeoutMs: 15000,
        optional: false,
        continueOnError: false,
      });

      const isJobClick = /job|engineer|developer|architect|consultant|analyst|manager/i.test(selectorRaw);
      if (isJobClick) {
        steps.push({
          id: `step-${stepIndex++}`,
          action: 'extract_job_requirement',
          description: `Extract and persist requirements for ${selectorRaw} using Ollama`,
          timeoutMs: 45000,
          optional: true,
          continueOnError: true,
        });
      }
      continue;
    }

    // 4. Match press / keydown
    const pressMatch = line.match(/(?:page\.)?(?:locator\(([^)]+)\)\.)?press\(['"`]([^'"`]+)['"`]\)/);
    if (pressMatch) {
      const selectorRaw = pressMatch[1] ? pressMatch[1].replace(/['"`]/g, '').trim() : 'body';
      const key = pressMatch[2];
      steps.push({
        id: `step-${stepIndex++}`,
        action: 'press',
        description: `Press key ${key} on ${selectorRaw}`,
        selector: {
          primary: selectorRaw,
          fallbacks: [selectorRaw],
        },
        value: key,
        timeoutMs: 10000,
        optional: false,
        continueOnError: false,
      });
      continue;
    }

    // 5. Match waitForSelector
    const waitMatch = line.match(/waitForSelector\(['"`]([^'"`]+)['"`]\)/);
    if (waitMatch) {
      const selectorRaw = waitMatch[1].trim();
      steps.push({
        id: `step-${stepIndex++}`,
        action: 'wait_for_selector',
        description: `Wait for selector ${selectorRaw}`,
        selector: {
          primary: selectorRaw,
          fallbacks: [selectorRaw],
        },
        timeoutMs: 15000,
        optional: false,
        continueOnError: false,
      });
      continue;
    }
  }

  // If no steps parsed, add default initial navigate
  if (steps.length === 0) {
    steps.push({
      id: 'step-1',
      action: 'navigate',
      description: `Navigate to ${targetUrl}`,
      targetUrl,
      timeoutMs: 30000,
      optional: false,
      continueOnError: false,
    });
  }

  const defaultsManager = new WorkflowDefaultsManager();
  const partial: Partial<WorkflowDefinition> = {
    id: 'linkedin-manual-codegen-flow',
    name: workflowName,
    description: `Manually recorded workflow via Playwright interactive codegen for ${targetUrl}`,
    baseUrl: targetUrl,
    steps,
  };

  const { workflow } = defaultsManager.applyDefaults(partial, targetUrl, steps[0]?.action);
  return WorkflowParser.parse(workflow);
}

// CLI execution support
if (process.argv[1] && process.argv[1].endsWith('codegen-to-workflow.ts')) {
  const inputFile = process.argv[2] || '/app/workflows/linkedin_codegen_raw.js';
  const outputFile = process.argv[3] || '/app/workflows/linkedin_manual_flow.json';
  const targetUrl = process.argv[4] || 'https://www.linkedin.com';

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(inputFile, 'utf-8');
  const workflow = convertPlaywrightScriptToWorkflow(content, targetUrl);
  fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2), 'utf-8');
  console.log(`Successfully generated JSON schema workflow: ${outputFile} (${workflow.steps.length} steps)`);
}
