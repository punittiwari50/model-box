import fs from 'node:fs';
import path from 'node:path';
import { WorkflowDefaultsManager } from '../../dist/recorder/workflow-defaults.js';
import { WorkflowParser } from '../../dist/engine/workflow-parser.js';

function extractSmartSelector(line) {
  // 1. Check getByRole('role', { name: 'name' })
  const roleNameMatch = line.match(/getByRole\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{\s*name:\s*['"`]([^'"`]+)['"`]/);
  if (roleNameMatch) {
    const role = roleNameMatch[1];
    const name = roleNameMatch[2];
    return {
      primary: `role=${role}[name="${name}"]`,
      fallbacks: [`${role}:has-text("${name}")`, `[aria-label="${name}"]`],
      desc: `${role} "${name}"`,
    };
  }

  // 2. Check getByText('text')
  const textMatch = line.match(/getByText\(\s*['"`]([^'"`]+)['"`]/);
  if (textMatch) {
    const txt = textMatch[1];
    return {
      primary: `text="${txt}"`,
      fallbacks: [`:has-text("${txt}")`],
      desc: `text "${txt}"`,
    };
  }

  // 3. Check getByLabel('label')
  const labelMatch = line.match(/getByLabel\(\s*['"`]([^'"`]+)['"`]/);
  if (labelMatch) {
    const lbl = labelMatch[1];
    return {
      primary: `[aria-label="${lbl}"]`,
      fallbacks: [`label:has-text("${lbl}")`],
      desc: `label "${lbl}"`,
    };
  }

  // 4. Check getByPlaceholder('placeholder')
  const phMatch = line.match(/getByPlaceholder\(\s*['"`]([^'"`]+)['"`]/);
  if (phMatch) {
    const ph = phMatch[1];
    return {
      primary: `[placeholder="${ph}"]`,
      fallbacks: [`input[placeholder="${ph}"]`],
      desc: `placeholder "${ph}"`,
    };
  }

  // 4b. Check getByTestId('testid')
  const testIdMatch = line.match(/getByTestId\(\s*['"`]([^'"`]+)['"`]/);
  if (testIdMatch) {
    const tid = testIdMatch[1];
    return {
      primary: `[data-testid="${tid}"]`,
      fallbacks: [`[data-test-id="${tid}"]`, `[data-test="${tid}"]`],
      desc: `test-id "${tid}"`,
    };
  }

  // 5. Check locator('selector')
  const locatorMatch = line.match(/locator\(\s*(['"`])(.*?)\1\s*\)/);
  if (locatorMatch) {
    let sel = locatorMatch[2].trim();
    // Quote unquoted attribute selectors like [data-test-id=foo] -> [data-test-id="foo"]
    sel = sel.replace(/\[([a-zA-Z0-9_-]+)=([^"'][^\]]*)\]/g, '[$1="$2"]');
    return {
      primary: sel,
      fallbacks: [sel],
      desc: sel,
    };
  }

  // 6. Check page.click('selector') or page.fill('selector')
  const directMatch = line.match(/(?:click|fill)\(\s*(['"`])(.*?)\1/);
  if (directMatch) {
    let sel = directMatch[2].trim();
    sel = sel.replace(/\[([a-zA-Z0-9_-]+)=([^"'][^\]]*)\]/g, '[$1="$2"]');
    return {
      primary: sel,
      fallbacks: [sel],
      desc: sel,
    };
  }

  return {
    primary: 'button',
    fallbacks: ['a', '[role="button"]'],
    desc: 'element',
  };
}

export function convertPlaywrightScriptToWorkflow(
  scriptContent,
  targetUrl = 'https://www.linkedin.com',
  workflowName = 'LinkedIn Manual Flow'
) {
  const lines = scriptContent.split('\n');
  const steps = [];
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
    const fillValMatch = line.match(/\.fill\(['"`](.*?)['"`]\)/) || line.match(/page\.fill\([^,]+,\s*['"`](.*?)['"`]\)/);
    if (fillValMatch) {
      const { primary, fallbacks, desc } = extractSmartSelector(line);
      const fillVal = fillValMatch[1];
      steps.push({
        id: `step-${stepIndex++}`,
        action: 'fill',
        description: `Fill ${desc}`,
        selector: {
          primary,
          fallbacks,
        },
        value: fillVal,
        timeoutMs: 15000,
        optional: false,
        continueOnError: false,
      });
      continue;
    }

    // 3. Match click or check
    if (line.includes('.click(') || line.includes('.check(')) {
      const { primary, fallbacks, desc } = extractSmartSelector(line);
      steps.push({
        id: `step-${stepIndex++}`,
        action: 'click',
        description: `Click ${desc}`,
        selector: {
          primary,
          fallbacks,
        },
        timeoutMs: 15000,
        optional: false,
        continueOnError: false,
      });

      // Auto-attach extraction if this click targeted a job role or search result item
      const isJobClick = /job|engineer|developer|architect|consultant|analyst|manager/i.test(desc) ||
                         /jobs-search-results|job-card/i.test(primary);
      if (isJobClick) {
        steps.push({
          id: `step-${stepIndex++}`,
          action: 'extract_job_requirement',
          description: `Extract and persist requirements for ${desc} using Ollama`,
          timeoutMs: 45000,
          optional: true,
          continueOnError: true,
        });
      }
      continue;
    }

    // 4. Match press / keydown
    const pressMatch = line.match(/\.press\(['"`]([^'"`]+)['"`]\)/);
    if (pressMatch) {
      const { primary, fallbacks } = extractSmartSelector(line);
      const key = pressMatch[1];
      steps.push({
        id: `step-${stepIndex++}`,
        action: 'press',
        description: `Press key "${key}"`,
        selector: {
          primary,
          fallbacks,
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
  const partial = {
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
const inputFile = process.argv[2] || '/app/workflows/linkedin_codegen_raw.js';
const outputFile = process.argv[3] || '/app/workflows/linkedin_manual_flow.json';
const targetUrl = process.argv[4] || 'https://www.linkedin.com';

if (fs.existsSync(inputFile)) {
  const content = fs.readFileSync(inputFile, 'utf-8');
  const workflow = convertPlaywrightScriptToWorkflow(content, targetUrl);
  fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2), 'utf-8');
  console.log(`Successfully generated JSON schema workflow: ${outputFile} (${workflow.steps.length} steps)`);
} else {
  console.log(`Input file does not exist yet: ${inputFile}`);
}
