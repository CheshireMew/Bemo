import { Capacitor } from '@capacitor/core';
import { FilePicker, type PickedFile } from '@capawesome/capacitor-file-picker';

export type ImportFileKind = 'backup' | 'markdown-archive' | 'flomo';

function decodeBase64Payload(data: string) {
  const normalized = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getImportMimeTypes(kind: ImportFileKind) {
  if (kind === 'backup') {
    return ['application/zip', 'application/x-zip-compressed', 'application/json', 'application/octet-stream'];
  }
  if (kind === 'markdown-archive') {
    return ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'];
  }
  return ['application/zip', 'application/x-zip-compressed', 'text/csv', 'text/plain', 'text/html', 'application/octet-stream'];
}

async function fetchPickedFileBlob(path: string) {
  const candidates = [path, Capacitor.convertFileSrc(path)].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) continue;
      return await response.blob();
    } catch {
      // Continue with next path candidate.
    }
  }
  return null;
}

async function toImportFile(picked: PickedFile) {
  if (picked.blob) {
    return new File([picked.blob], picked.name, {
      type: picked.mimeType || picked.blob.type || 'application/octet-stream',
      lastModified: picked.modifiedAt || Date.now(),
    });
  }

  if (picked.data) {
    return new File([decodeBase64Payload(picked.data)], picked.name, {
      type: picked.mimeType || 'application/octet-stream',
      lastModified: picked.modifiedAt || Date.now(),
    });
  }

  if (picked.path) {
    const blob = await fetchPickedFileBlob(picked.path);
    if (blob) {
      return new File([blob], picked.name, {
        type: picked.mimeType || blob.type || 'application/octet-stream',
        lastModified: picked.modifiedAt || Date.now(),
      });
    }
  }

  throw new Error(`无法读取所选文件：${picked.name || '未命名文件'}`);
}

export function shouldUseAndroidNativeImportPicker() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function ensureNativeImportPermissions() {
  const status = await FilePicker.checkPermissions();
  const current = status.readExternalStorage;
  if (current === 'granted') {
    return;
  }

  const requested = await FilePicker.requestPermissions({
    permissions: ['readExternalStorage'],
  });

  if (requested.readExternalStorage !== 'granted') {
    throw new Error('没有获得 Android 文件读取权限，无法继续导入。');
  }
}

export async function pickNativeImportFile(kind: ImportFileKind): Promise<File | null> {
  await ensureNativeImportPermissions();
  const result = await FilePicker.pickFiles({
    limit: 1,
    readData: false,
    types: getImportMimeTypes(kind),
  });
  const picked = result.files[0];
  if (!picked) {
    return null;
  }
  return toImportFile(picked);
}
