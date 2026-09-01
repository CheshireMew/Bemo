import type { AppSettings } from './settingsTypes.js';

export const defaultSettings: AppSettings = {
  importExport: {
    lastSection: 'export',
  },
  editor: {
    autoSaveEnabled: true,
    autoSaveDelaySec: 3,
    imageCompression: 'balanced',
    markdownGfm: true,
    markdownBreaks: true,
    preferredMode: 'rich-text',
    copyFormat: 'rich-text',
  },
  sync: {
    mode: 'local',
    deviceName: 'This Device',
    serverUrl: '',
    accessToken: '',
    webdavUrl: '',
    username: '',
    password: '',
    basePath: '',
  },
};
