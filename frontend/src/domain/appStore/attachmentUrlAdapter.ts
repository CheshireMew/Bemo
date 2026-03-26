import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { resolveBackendAttachmentAssetUrl } from '../attachments/backendAttachmentsApi.js';

export function resolveAttachmentSourceUrl(url: string) {
  return shouldUseBackendAppStore()
    ? resolveBackendAttachmentAssetUrl(url)
    : url;
}
