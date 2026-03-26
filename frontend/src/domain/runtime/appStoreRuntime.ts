import { APP_STORAGE_MODE, usesBackendAppStorage } from '../../config.js';

export function shouldUseBackendAppStore() {
  return usesBackendAppStorage();
}

export function getAppStorageMode() {
  return APP_STORAGE_MODE;
}
