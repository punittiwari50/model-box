import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../../src');

function scanDirectory(dir: string): string[] {
  let files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(scanDirectory(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const tsFiles = scanDirectory(srcDir);
let hasViolations = false;

console.log(`[VERIFY-IMPORTS] Verifying import paths across ${tsFiles.length} TypeScript files in src/...`);

const relativeImportRegex = /from\s+['"](\.\/|\.\.\/)/;

for (const file of tsFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    if (relativeImportRegex.test(line)) {
      console.error(`[VIOLATION] ${file}:${index + 1} uses relative import:`);
      console.error(`  --> ${line.trim()}`);
      console.error(`  Expected alias '@/' instead of './' or '../'`);
      hasViolations = true;
    }
  });
}

if (hasViolations) {
  console.error('\nFAIL: Relative imports found! All internal imports must use @/ instead.');
  process.exit(1);
} else {
  console.log('\nSUCCESS: 100% of internal imports use @/ alias. No relative ./ or ../ imports found!');
}
