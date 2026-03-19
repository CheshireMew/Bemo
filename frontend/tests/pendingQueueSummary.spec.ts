import assert from 'node:assert/strict';

import { formatPendingChangeType, summarizePendingChange } from '../src/domain/sync/pendingQueueSummary.js';

function testFormatPendingChangeTypeUsesReadableLabels() {
  assert.equal(formatPendingChangeType('note.create'), '新建');
  assert.equal(formatPendingChangeType('note.update'), '更新正文');
  assert.equal(formatPendingChangeType('note.patch'), '更新属性');
  assert.equal(formatPendingChangeType('note.delete'), '删除');
}

function testSummarizePendingChangeKeepsKeyFields() {
  assert.deepEqual(summarizePendingChange({
    operation_id: 'op-1',
    device_id: 'device-1',
    entity_id: 'note-1',
    target: 'server',
    type: 'note.update',
    base_revision: 4,
    timestamp: '2026-03-18T12:00:00.000Z',
    payload: {},
    createdAt: 1,
  }), {
    operationId: 'op-1',
    entityId: 'note-1',
    typeLabel: '更新正文',
    baseRevision: 4,
    timestamp: '2026-03-18T12:00:00.000Z',
  });
}

testFormatPendingChangeTypeUsesReadableLabels();
testSummarizePendingChangeKeepsKeyFields();

console.log('pendingQueueSummary.spec passed');
