import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { parseBackupArchive } from '../src/domain/importExport/backupArchive.js';
import { parseMarkdownArchive } from '../src/domain/importExport/markdownArchive.js';

async function archive(manifest: object) {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  return new File([Uint8Array.from(await zip.generateAsync({ type: 'uint8array' }))], 'backup.zip', { type: 'application/zip' });
}
let failed = 0;
const cases: Array<[string, () => Promise<void>]> = [
  ['004 ZIP missing note arrays is rejected', async () => {
    await assert.rejects(parseBackupArchive(await archive({ format: 'bemo-backup', version: 3, attachments: [] })));
  }],
  ['004 ZIP missing declared attachment is rejected', async () => {
    await assert.rejects(parseBackupArchive(await archive({ format: 'bemo-backup', version: 3, notes: [], trash: [], attachments: [{ filename: 'x.png', mime_type: 'image/png', path: 'attachments/x.png' }] })));
  }],
  ['004 incomplete Markdown archive is rejected', async () => {
    await assert.rejects(parseMarkdownArchive(await archive({ format: 'bemo-markdown-archive', version: 1, notes: 1, trash: 0, attachments: 0 })));
  }],
];
for (const [name, run] of cases) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`, error); }
}
assert.equal(failed, 0);
