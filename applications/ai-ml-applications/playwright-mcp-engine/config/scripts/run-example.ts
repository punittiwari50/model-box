import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkflowParser } from '@/engine/workflow-parser.js';
import { CodeGenerator } from '@/generator/code-generator.js';
import { logger } from '@/core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const examplesDir = path.resolve(__dirname, '../examples/workflows');

async function main(): Promise<void> {
  logger.info('[RUN-EXAMPLE] Starting example validation script...');

  const exampleFiles = [
    'auth-endpoint-scan-workflow.json',
    'dynamic-search-workflow.json',
    'multimodal-ai-workflow.json',
    'test-stuck-process.json',
  ];

  for (const filename of exampleFiles) {
    const fullPath = path.join(examplesDir, filename);
    if (!fs.existsSync(fullPath)) {
      logger.warn(`Example workflow file not found: ${fullPath}`);
      continue;
    }

    logger.info(`Validating workflow: ${filename}`);
    const rawJson = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    const parsed = WorkflowParser.parse(rawJson);
    logger.info(`Parsed successfully: ${parsed.name} (${parsed.id}) with ${parsed.steps.length} steps.`);

    const generatedCode = CodeGenerator.generatePlaywrightTypeScript(parsed);
    if (!generatedCode || generatedCode.length < 50) {
      throw new Error(`Code generation failed for ${filename}`);
    }
    logger.info(`Generated code length: ${generatedCode.length} characters.`);
  }

  logger.info('[RUN-EXAMPLE] All example workflows validated successfully!');
}

main().catch((err) => {
  logger.error('[RUN-EXAMPLE] Validation failed:', err);
  process.exit(1);
});
