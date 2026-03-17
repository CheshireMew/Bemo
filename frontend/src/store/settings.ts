import { reactive } from 'vue';
import type { AppSettings } from './settingsTypes';

export type {
  AiPromptPreset,
  AiProvider,
  AppSettings,
  CopyFormat,
  EditorMode,
  ImageCompressionMode,
  SyncMode,
} from './settingsTypes';

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

export const settings = reactive<AppSettings>({ ...defaultSettings });
