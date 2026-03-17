import assert from 'node:assert/strict';

import {
  buildImageEditorAttachments,
  extractEditorAttachments,
  mergeEditorMarkdown,
  mergeEditorMarkdownWithImages,
  removeEditorAttachment,
  selectImageAttachmentInputs,
  splitEditorMarkdown,
} from '../src/utils/editorAttachments.js';

function testSplitEditorMarkdownPreservesBodyAndAttachments() {
  const markdown = [
    'Alpha',
    '',
    'Beta',
    '',
    '![cover](/images/cover.png)',
    '',
    '[audio](/images/voice.mp3)',
  ].join('\n');

  const result = splitEditorMarkdown(markdown);

  assert.equal(result.body, 'Alpha\n\nBeta');
  assert.deepEqual(
    result.attachments.map((attachment) => ({
      raw: attachment.raw,
      label: attachment.label,
      url: attachment.url,
      kind: attachment.kind,
    })),
    [
      {
        raw: '![cover](/images/cover.png)',
        label: 'cover',
        url: '/images/cover.png',
        kind: 'image',
      },
      {
        raw: '[audio](/images/voice.mp3)',
        label: 'audio',
        url: '/images/voice.mp3',
        kind: 'file',
      },
    ],
  );
}

function testMergeEditorMarkdownWithImagesAppendsImageMarkdown() {
  const merged = mergeEditorMarkdownWithImages('Plain text', [
    { alt: 'cover', url: '/images/cover.png' },
    { alt: 'detail', url: '/images/detail.png' },
  ]);

  assert.equal(
    merged,
    [
      'Plain text',
      '',
      '![cover](/images/cover.png)',
      '',
      '![detail](/images/detail.png)',
    ].join('\n'),
  );
}

function testRemoveEditorAttachmentOnlyRemovesMatchingAttachment() {
  const markdown = [
    'Plain text',
    '',
    '![cover](/images/cover.png)',
    '',
    '![detail](/images/detail.png)',
  ].join('\n');

  const result = removeEditorAttachment(markdown, '/images/cover.png');

  assert.equal(
    result,
    [
      'Plain text',
      '',
      '![detail](/images/detail.png)',
    ].join('\n'),
  );
}

function testBuildAndMergeHelpersUseConsistentAttachmentShape() {
  const attachments = buildImageEditorAttachments([
    { alt: 'cover', url: '/images/cover.png' },
  ]);

  assert.deepEqual(extractEditorAttachments(mergeEditorMarkdown('Body', attachments)), attachments);
}

function testSelectImageAttachmentInputsOnlyReturnsImages() {
  const attachments = extractEditorAttachments([
    'Body',
    '',
    '![cover](/images/cover.png)',
    '',
    '[audio](/images/voice.mp3)',
  ].join('\n'));

  assert.deepEqual(selectImageAttachmentInputs(attachments), [
    { alt: 'cover', url: '/images/cover.png' },
  ]);
}

function testMergeEditorMarkdownPreservesFileAttachments() {
  const attachments = extractEditorAttachments([
    'Body',
    '',
    '![cover](/images/cover.png)',
    '',
    '[音频附件](/images/voice.mp3)',
  ].join('\n'));

  assert.equal(
    mergeEditorMarkdown('Edited body', attachments),
    [
      'Edited body',
      '',
      '![cover](/images/cover.png)',
      '',
      '[音频附件](/images/voice.mp3)',
    ].join('\n'),
  );
}

testSplitEditorMarkdownPreservesBodyAndAttachments();
testMergeEditorMarkdownWithImagesAppendsImageMarkdown();
testRemoveEditorAttachmentOnlyRemovesMatchingAttachment();
testBuildAndMergeHelpersUseConsistentAttachmentShape();
testSelectImageAttachmentInputsOnlyReturnsImages();
testMergeEditorMarkdownPreservesFileAttachments();

console.log('editorAttachments tests passed');
