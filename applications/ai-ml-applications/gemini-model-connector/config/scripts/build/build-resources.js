#!/usr/bin/env node
/**
 * ModelBox Hermetic SCSS Build & Resource Synchronizer
 * 
 * Conforms to:
 * - STD-COD-007: SLAP, clean error handling, modular functions <= 20 lines.
 * - STD-COD-010: Hermetic Node.js execution using native standard library.
 * 
 * Purpose:
 * 1. Compiles modular SCSS in src/main/resources/assets/scss to valid CSS.
 * 2. Synchronizes resources from src/main/resources to dist/resources.
 * 3. Injects compiled CSS directly into <style id="modelbox-theme-css"> in dist/resources/index.html.
 * 4. Writes dist/resources/assets/css/main.css and src/main/resources/assets/css/main.css.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const SRC_RESOURCES = path.join(projectRoot, 'src/main/resources');
const DIST_RESOURCES = path.join(projectRoot, 'dist/resources');
const SCSS_DIR = path.join(SRC_RESOURCES, 'assets/scss');
const ENTRY_SCSS = path.join(SCSS_DIR, 'main.scss');

/**
 * Strips single-line comments outside of strings.
 */
function stripComments(content) {
  return content.replace(/\/\/[^\n\r]*/g, '');
}

/**
 * Extracts all $variable: value; definitions from content into a Map.
 */
function parseVariables(content) {
  const vars = new Map();
  const varRegex = /\$([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = varRegex.exec(content)) !== null) {
    vars.set(match[1].trim(), match[2].trim());
  }
  return vars;
}

/**
 * Replaces $var and #{$var} occurrences with their defined values.
 */
function substituteVariables(content, vars) {
  let result = content;
  // Replace interpolation #{$var}
  result = result.replace(/#\{\$([a-zA-Z0-9_-]+)\}/g, (_, name) => {
    return vars.get(name) || `var(--${name})`;
  });

  // Replace direct $var occurrences (word bounded)
  for (const [name, val] of vars.entries()) {
    const reg = new RegExp(`\\$${name}\\b`, 'g');
    result = result.replace(reg, val);
  }
  return result;
}

/**
 * Parses and extracts @mixin declarations.
 */
function parseMixins(content) {
  const mixins = new Map();
  const mixinRegex = /@mixin\s+([a-zA-Z0-9_-]+)(?:\(([^)]*)\))?\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let match;
  while ((match = mixinRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const rawArgs = match[2] ? match[2].split(',').map((a) => a.trim()) : [];
    const body = match[3];
    mixins.set(name, { rawArgs, body });
  }
  return mixins;
}

/**
 * Expands @include mixin-name(...) calls in content.
 */
function expandIncludes(content, mixins) {
  let result = content;
  for (const [name, mixin] of mixins.entries()) {
    const incRegex = new RegExp(`@include\\s+${name}(?:\\(([^)]*)\\))?\\s*;?`, 'g');
    result = result.replace(incRegex, (_, callArgsStr) => {
      let expandedBody = mixin.body;
      const callArgs = callArgsStr ? callArgsStr.split(',').map((a) => a.trim()) : [];

      mixin.rawArgs.forEach((paramDef, idx) => {
        const [paramName, defaultVal] = paramDef.split(':').map((s) => s.trim());
        const cleanParam = paramName.replace(/^\$/, '');
        const actualVal = (callArgs[idx] && callArgs[idx].length > 0) ? callArgs[idx] : (defaultVal || '');
        const pRegex = new RegExp(`\\$${cleanParam}\\b`, 'g');
        expandedBody = expandedBody.replace(pRegex, actualVal);
      });
      return expandedBody;
    });
  }
  return result;
}

/**
 * Unrolls SCSS nested rules and & pseudo-selectors into flat standard CSS.
 */
function unrollNesting(cssContent) {
  const lines = cssContent.split('\n');
  const output = [];
  const selectorStack = [];
  let currentDeclarations = [];

  const flushDeclarations = () => {
    if (currentDeclarations.length > 0 && selectorStack.length > 0) {
      const fullSelector = buildSelector(selectorStack);
      output.push(`${fullSelector} {\n  ${currentDeclarations.join('\n  ')}\n}`);
      currentDeclarations = [];
    }
  };

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.endsWith('{')) {
      flushDeclarations();
      const sel = line.slice(0, -1).trim();
      selectorStack.push(sel);
    } else if (line === '}') {
      flushDeclarations();
      if (selectorStack.length > 0) {
        selectorStack.pop();
      }
    } else {
      currentDeclarations.push(line);
    }
  }

  flushDeclarations();
  return output.join('\n\n');
}

/**
 * Combines selector stack resolving & parent references.
 */
function buildSelector(stack) {
  // If outer is @media, @keyframes, or @supports, preserve it
  if (stack[0].startsWith('@')) {
    const atRule = stack[0];
    const innerStack = stack.slice(1);
    if (innerStack.length === 0) return atRule;
    const innerSelector = resolveCombinedSelector(innerStack);
    return `${atRule} {\n  ${innerSelector}`;
  }
  return resolveCombinedSelector(stack);
}

function resolveCombinedSelector(stack) {
  return stack.reduce((parent, current) => {
    if (!parent) return current;
    const parentParts = parent.split(',').map((p) => p.trim());
    const currentParts = current.split(',').map((c) => c.trim());
    const combined = [];

    for (const p of parentParts) {
      for (const c of currentParts) {
        if (c.startsWith('&')) {
          combined.push(p + c.slice(1));
        } else {
          combined.push(`${p} ${c}`);
        }
      }
    }
    return combined.join(', ');
  }, '');
}

/**
 * Compiles SCSS files into single valid CSS string.
 */
export function compileScss(entryFile) {
  const scssBaseDir = path.dirname(entryFile);
  let mainContent = fs.readFileSync(entryFile, 'utf-8');

  // Load partials
  const varPath = path.join(scssBaseDir, '_variables.scss');
  const mixPath = path.join(scssBaseDir, '_mixins.scss');
  const respPath = path.join(scssBaseDir, '_responsive.scss');

  const varContent = fs.existsSync(varPath) ? fs.readFileSync(varPath, 'utf-8') : '';
  const mixContent = fs.existsSync(mixPath) ? fs.readFileSync(mixPath, 'utf-8') : '';
  const respContent = fs.existsSync(respPath) ? fs.readFileSync(respPath, 'utf-8') : '';

  // 1. Collect all variables
  const allVarSources = stripComments(`${varContent}\n${mixContent}\n${mainContent}`);
  const vars = parseVariables(allVarSources);

  // 2. Collect mixins
  const allMixSources = stripComments(`${mixContent}\n${mainContent}`);
  const mixins = parseMixins(allMixSources);

  // 3. Remove @use directives and combine
  let combined = `${mainContent}\n${respContent}`
    .replace(/@use\s+['"][^'"]+['"]\s+as\s+\*;?/g, '');

  combined = stripComments(combined);
  combined = expandIncludes(combined, mixins);
  combined = substituteVariables(combined, vars);

  // Clean trailing empty mixin statements or variable declarations
  combined = combined.replace(/^\s*\$[a-zA-Z0-9_-]+\s*:[^;]+;/gm, '');
  combined = combined.replace(/@mixin\s+[a-zA-Z0-9_-]+[^{]*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');

  return combined.trim();
}

/**
 * Injects compiled CSS into target HTML file inside <style id="modelbox-theme-css">.
 */
function injectCssIntoHtml(htmlFilePath, css) {
  if (!fs.existsSync(htmlFilePath)) return;
  let html = fs.readFileSync(htmlFilePath, 'utf-8');

  const styleTagRegex = /<style\s+id=["']modelbox-theme-css["'][^>]*>([\s\S]*?)<\/style>/i;
  const newStyleBlock = `<style id="modelbox-theme-css">\n${css}\n  </style>`;

  if (styleTagRegex.test(html)) {
    html = html.replace(styleTagRegex, newStyleBlock);
  } else {
    // If not existing, insert before </head>
    html = html.replace('</head>', `  ${newStyleBlock}\n</head>`);
  }

  fs.writeFileSync(htmlFilePath, html, 'utf-8');
}

/**
 * Main build orchestrator.
 */
export function buildResources() {
  console.log('[BUILD] Compiling SCSS to CSS from src/main/resources/assets/scss/main.scss...');
  const compiledCss = compileScss(ENTRY_SCSS);

  // 1. Ensure CSS destination directories exist
  const srcCssDir = path.join(SRC_RESOURCES, 'assets/css');
  const distCssDir = path.join(DIST_RESOURCES, 'assets/css');
  fs.mkdirSync(srcCssDir, { recursive: true });
  fs.mkdirSync(distCssDir, { recursive: true });

  // 2. Write compiled CSS to src and dist
  const srcCssFile = path.join(srcCssDir, 'main.css');
  const distCssFile = path.join(distCssDir, 'main.css');
  fs.writeFileSync(srcCssFile, compiledCss, 'utf-8');
  fs.writeFileSync(distCssFile, compiledCss, 'utf-8');
  console.log(`[BUILD] Generated ${srcCssFile} (${compiledCss.length} bytes)`);

  // 3. Synchronize all resources from src/main/resources to dist/resources
  console.log(`[BUILD] Synchronizing resources: ${SRC_RESOURCES} -> ${DIST_RESOURCES}`);
  fs.cpSync(SRC_RESOURCES, DIST_RESOURCES, { recursive: true, force: true });

  // 4. Inject compiled SCSS (CSS) directly inside HTML files in dist/resources
  const distHtmlFiles = [
    path.join(DIST_RESOURCES, 'index.html'),
    path.join(DIST_RESOURCES, 'static/index.html')
  ];

  distHtmlFiles.forEach((htmlPath) => {
    injectCssIntoHtml(htmlPath, compiledCss);
    console.log(`[BUILD] Injected compiled SCSS inside ${htmlPath}`);
  });

  console.log('[BUILD] Resource synchronization and SCSS-in-HTML build complete! [OK]');
}

// Run if called directly
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    buildResources();
  } catch (err) {
    console.error('[BUILD] Error compiling resources:', err);
    process.exit(1);
  }
}
