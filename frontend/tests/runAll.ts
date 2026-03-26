import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const specs = readdirSync(currentDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.js'))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

for (const spec of specs) {
  const specPath = path.join(currentDir, spec);
  const result = spawnSync(process.execPath, [specPath], {
    stdio: 'inherit',
  });
  assert.equal(result.status, 0, `${spec} exited with code ${result.status ?? 'null'}`);
}

console.log(`runAll completed ${specs.length} specs`);
