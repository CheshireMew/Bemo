import type { AppSettings } from './settingsTypes.js';

export const defaultSettings: AppSettings = {
  importExport: {
    lastSection: 'export',
  },
  aiPrompts: {
    presets: [],
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
  ai: {
    enabled: false,
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    systemPrompt: '',
    apiKey: '',
    hasApiKey: false,
    maskedApiKey: '',
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
