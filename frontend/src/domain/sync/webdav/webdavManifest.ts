import type { ManifestRecord } from './webdavTypes.js';
import { readJson, writeJson } from './webdavRequest.js';

export async function readWebDavManifest(baseUrl: string, headers: HeadersInit): Promise<ManifestRecord | null> {
  return readJson<ManifestRecord>(`${baseUrl}/manifest.json`, headers);
}

export async function writeWebDavManifest(baseUrl: string, headers: HeadersInit, manifest: ManifestRecord) {
  await writeJson(`${baseUrl}/manifest.json`, headers, manifest);
}
