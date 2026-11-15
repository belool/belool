// Regenera a lista de arquivos do service worker (rodar após adicionar arquivos): node tools/gen-sw.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'vendor/three.module.min.js', ...walk('icons'), ...walk('src').filter((f) => f.endsWith('.js'))].map((f) => f.split(path.sep).join('/'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8').replace(/const FILES = \[[\s\S]*?\];/, `const FILES = [\n  ${files.map((f) => `'${f}'`).join(',\n  ')},\n];`);
fs.writeFileSync(path.join(root, 'sw.js'), sw.replace(/operation-zero-v\d+/, (m) => 'operation-zero-v' + (Number(m.split('v').pop()) + 1)));
console.log(`sw.js: ${files.length} arquivos`);
