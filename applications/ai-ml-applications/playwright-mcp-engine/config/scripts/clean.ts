import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../../dist');

fs.rmSync(distDir, { recursive: true, force: true });
console.log('[CLEAN] Successfully cleaned dist directory.');
