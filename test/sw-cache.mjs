import { readFileSync, existsSync } from 'fs';
import { dirname, normalize, relative } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = 'src/main.js';
const seen = new Set();
const needed = new Set([entry]);
const importRe = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(root + file, 'utf8');
  for (const match of src.matchAll(importRe)) {
    const spec = match[1];
    if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
    const child = normalize(dirname(file) + '/' + spec).replaceAll('\\', '/');
    if (!existsSync(root + child)) continue;
    needed.add(child);
    visit(child);
  }
}

visit(entry);

const sw = readFileSync(root + 'sw.js', 'utf8');
const shell = new Set([...sw.matchAll(/['"]\.\/([^'"]+)['"]/g)].map((m) => m[1]));
const missing = [...needed].filter((file) => !shell.has(file));

if (missing.length) {
  console.error('sw.js SHELL misses ESM modules:\n' + missing.map((f) => '  - ./' + f).join('\n'));
  process.exit(1);
}

console.log(`sw.js SHELL covers ${needed.size} ESM modules from ./${relative(root, root + entry)}`);
