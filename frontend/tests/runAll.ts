import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const selected = args.filter((arg) => arg !== '--list');
const specs = readdirSync(path.resolve(currentDir, '../../tests'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
  .map((entry) => entry.name.replace(/\.ts$/, '.js'))
  .filter((name) => selected.length === 0 || selected.includes(name.replace(/\.js$/, '')))
  .sort((left, right) => left.localeCompare(right));

assert.ok(specs.length > 0, 'No matching test specs');
for (const name of selected) assert.ok(specs.includes(`${name}.js`), `Unknown test spec: ${name}`);
if (listOnly) {
  console.log(specs.join('\n'));
  process.exit(0);
}

for (const spec of specs) {
  const specPath = path.join(currentDir, spec);
  const result = spawnSync(process.execPath, [specPath], {
    stdio: 'inherit',
  });
  assert.equal(result.status, 0, `${spec} exited with code ${result.status ?? 'null'}`);
}

console.log(`runAll completed ${specs.length} specs`);
