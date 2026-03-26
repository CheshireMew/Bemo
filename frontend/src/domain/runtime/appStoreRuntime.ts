import { getAppStorageMode as readConfiguredAppStorageMode, usesBackendAppStorage } from '../../config.js';

export function shouldUseBackendAppStore() {
  return usesBackendAppStorage();
}

export function getAppStorageMode() {
  return readConfiguredAppStorageMode();
}
