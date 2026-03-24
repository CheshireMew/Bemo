import JSZip from 'jszip';
import { putAttachmentBlob } from '../attachments/blobStorage.js';
import { buildLocalAttachmentPath, createLocalAttachmentFilename } from '../attachments/localAttachmentPaths.js';
import { deriveNoteTitle } from '../notes/noteContract.js';
import type { NoteMeta } from '../notes/notesTypes.js';

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, '');
}

export function parseFlomoCsvLine(line: string) {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

function extractBalancedDivBlock(source: string, className: string) {
  const marker = `class="${className}"`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return '';

  const start = source.lastIndexOf('<div', markerIndex);
  if (start === -1) return '';

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source.startsWith('<div', index)) {
      depth += 1;
      continue;
    }
    if (source.startsWith('</div>', index)) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 6);
      }
    }
  }

  return '';
}

function extractMemoBlocks(html: string) {
  const blocks: string[] = [];
  let searchFrom = 0;

  while (searchFrom < html.length) {
    const start = html.indexOf('<div class="memo">', searchFrom);
    if (start === -1) break;

    let depth = 0;
    let end = -1;
    for (let index = start; index < html.length; index += 1) {
      if (html.startsWith('<div', index)) {
        depth += 1;
        continue;
      }
      if (html.startsWith('</div>', index)) {
        depth -= 1;
        if (depth === 0) {
          end = index + 6;
          break;
        }
      }
    }

    if (end === -1) break;
    blocks.push(html.slice(start, end));
    searchFrom = end;
  }

  return blocks;
}

function extractDivText(block: string, className: string) {
  const match = block.match(new RegExp(`<div class="${className}">([\\s\\S]*?)</div>`));
  return match ? decodeHtmlEntities(stripBom(match[1].trim())) : '';
}

function extractDivTexts(block: string, className: string) {
  return Array.from(
    block.matchAll(new RegExp(`<div class="${className}">([\\s\\S]*?)</div>`, 'g')),
  ).map((match) => decodeHtmlEntities(stripBom(match[1].trim()))).filter(Boolean);
}

function convertHtmlFragmentToMarkdown(fragment: string) {
  const normalized = stripBom(fragment)
    .replace(/<div class="audio-player__content">[\s\S]*?<\/div>/gi, '\n\n')
    .replace(/<div class="audio-player">[\s\S]*?<\/div>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, text: string) => {
      const plainText = decodeHtmlEntities(text.replace(/<[^>]+>/g, '').trim());
      const plainHref = decodeHtmlEntities(href.trim());
      if (!plainText) return plainHref;
      if (plainText === plainHref) return plainHref;
      return `[${plainText}](${plainHref})`;
    })
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(p|div|section|article|blockquote|h[1-6])>/gi, '\n\n')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(normalized)
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function guessMimeType(path: string) {
  const normalized = path.toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.svg')) return 'image/svg+xml';
  if (normalized.endsWith('.mp3')) return 'audio/mpeg';
  if (normalized.endsWith('.m4a')) return 'audio/mp4';
  if (normalized.endsWith('.wav')) return 'audio/wav';
  if (normalized.endsWith('.ogg')) return 'audio/ogg';
  if (normalized.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}

function findZipEntry(zip: JSZip, entryPath: string) {
  const direct = zip.file(entryPath);
  if (direct) {
    return direct;
  }

  const normalized = entryPath.replace(/\\/g, '/');
  const suffixMatches = Object.values(zip.files).filter((entry) => (
    !entry.dir
    && entry.name.replace(/\\/g, '/').endsWith(normalized)
  ));

  if (suffixMatches.length > 0) {
    return suffixMatches[0];
  }

  return null;
}

async function extractAndStoreAttachment(zip: JSZip, entryPath: string) {
  const entry = findZipEntry(zip, entryPath);
  if (!entry) return null;

  const sourceName = entryPath.split('/').pop() || 'attachment.bin';
  const filename = createLocalAttachmentFilename(sourceName);
  const mimeType = guessMimeType(entryPath);
  const data = await entry.async('uint8array');

  await putAttachmentBlob({
    filename,
    blob: new Blob([Uint8Array.from(data)], { type: mimeType }),
    mimeType,
  });

  return {
    filename,
    mimeType,
    url: buildLocalAttachmentPath(filename),
  };
}

function resolveZipEntryPath(htmlEntryName: string, attachmentPath: string) {
  const normalizedAttachment = attachmentPath.replace(/^\.?\//, '');
  const htmlBase = htmlEntryName.includes('/')
    ? htmlEntryName.slice(0, htmlEntryName.lastIndexOf('/') + 1)
    : '';

  return `${htmlBase}${normalizedAttachment}`;
}

function collectMediaReferences(source: string) {
  return Array.from(source.matchAll(/<(img|audio|source)\b[^>]*src="([^"]+)"[^>]*>/gi)).map((match) => ({
    tagName: match[1].toLowerCase(),
    path: decodeHtmlEntities(match[2].trim()),
  })).filter((item) => Boolean(item.path));
}

function buildAttachmentMarkdownLines(input: Array<{
  tagName: string;
  label: string;
  url: string;
  mimeType: string;
}>) {
  return input.map(({ tagName, label, url, mimeType }) => {
    if (tagName === 'img' || mimeType.startsWith('image/')) {
      return `![${label}](${url})`;
    }
    return `[${label}](${url})`;
  });
}

export async function parseFlomoZip(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const htmlEntry = zip.file(/\.html$/i)[0];
  if (!htmlEntry) {
    throw new Error('flomo 导出 zip 缺少 html 文件');
  }

  const html = await htmlEntry.async('string');
  const memoBlocks = extractMemoBlocks(html);
  const notes: NoteMeta[] = [];
  let importedAttachments = 0;

  for (const [index, block] of memoBlocks.entries()) {
    const timeText = extractDivText(block, 'time');
    const contentBlock = extractBalancedDivBlock(block, 'content');
    const filesBlock = extractBalancedDivBlock(block, 'files');
    const contentHtml = contentBlock.replace(/^<div class="content">/, '').replace(/<\/div>$/, '');
    const body = convertHtmlFragmentToMarkdown(contentHtml);
    const transcriptTexts = extractDivTexts(block, 'audio-player__content')
      .map((text) => convertHtmlFragmentToMarkdown(text))
      .filter(Boolean);
    const attachmentMatches = [
      ...collectMediaReferences(contentHtml),
      ...collectMediaReferences(filesBlock),
    ];
    const importedAttachmentLines: Array<{
      tagName: string;
      label: string;
      url: string;
      mimeType: string;
    }> = [];
    const seenAttachmentPaths = new Set<string>();

    for (const match of attachmentMatches) {
      const { tagName, path: attachmentPath } = match;
      if (!attachmentPath || seenAttachmentPaths.has(attachmentPath)) continue;
      seenAttachmentPaths.add(attachmentPath);
      const zipEntryPath = resolveZipEntryPath(htmlEntry.name, attachmentPath);
      const stored = await extractAndStoreAttachment(zip, zipEntryPath);
      if (!stored) continue;

      importedAttachments += 1;
      importedAttachmentLines.push({
        tagName,
        label: stored.filename,
        url: stored.url,
        mimeType: stored.mimeType,
      });
    }

    const transcriptBlock = transcriptTexts.length > 0
      ? `音频转录\n\n${transcriptTexts.join('\n\n')}`
      : '';
    const attachmentBlock = buildAttachmentMarkdownLines(importedAttachmentLines).join('\n\n');
    const content = [body, transcriptBlock, attachmentBlock].filter(Boolean).join('\n\n').trim();
    if (!content) continue;

    const createdAt = timeText ? Date.parse(timeText.replace(' ', 'T')) : Date.now();
    const ts = Math.floor((Number.isNaN(createdAt) ? Date.now() : createdAt) / 1000);
    notes.push({
      note_id: `flomo_${Date.now()}_${index}`,
      revision: 1,
      filename: `${ts}-flomo-${index + 1}.md`,
      title: deriveNoteTitle(content, 'Flomo 导入', 40),
      created_at: ts,
      updated_at: ts,
      content,
      tags: [],
      pinned: false,
    });
  }

  return { notes, importedAttachments };
}

export async function parseFlomoCsv(file: File) {
  const text = stripBom(await file.text());
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    return [];
  }

  const rows = lines.slice(1).map(parseFlomoCsvLine);
  const notes: NoteMeta[] = [];
  rows.forEach((row, index) => {
    const content = (row[0] || '').trim();
    if (!content) return;
    const createdAt = row[1] ? Date.parse(row[1]) : Date.now();
    const tags = (row[2] || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const ts = Math.floor((Number.isNaN(createdAt) ? Date.now() : createdAt) / 1000);
    notes.push({
      note_id: `flomo_${Date.now()}_${index}`,
      revision: 1,
      filename: `${ts}-flomo-${index + 1}.md`,
      title: deriveNoteTitle(content, 'Flomo 导入', 40),
      created_at: ts,
      updated_at: ts,
      content,
      tags,
      pinned: false,
    });
  });
  return notes;
}
