export type ImageCompressionMode = 'original' | 'balanced' | 'compact';
export type AiProvider = 'openai' | 'deepseek' | 'openai-compatible' | 'custom';
export type EditorMode = 'rich-text' | 'markdown';
export type CopyFormat = 'rich-text' | 'markdown';
export type SyncMode = 'local' | 'server' | 'webdav';

export type AiPromptPreset = {
  id: string;
  content: string;
};

export interface AppSettings {
  importExport: {
    lastSection: 'export' | 'import';
    legacyMigrationCompletedAt: string;
  };
  aiPrompts: {
    presets: AiPromptPreset[];
  };
  editor: {
    autoSaveEnabled: boolean;
    autoSaveDelaySec: number;
    imageCompression: ImageCompressionMode;
    markdownGfm: boolean;
    markdownBreaks: boolean;
    preferredMode: EditorMode;
    copyFormat: CopyFormat;
  };
  ai: {
    enabled: boolean;
    provider: AiProvider;
    baseUrl: string;
    model: string;
    systemPrompt: string;
    apiKey: string;
    hasApiKey: boolean;
    maskedApiKey: string;
  };
  sync: {
    mode: SyncMode;
    deviceName: string;
    serverUrl: string;
    accessToken: string;
    webdavUrl: string;
    username: string;
    password: string;
    basePath: string;
  };
}
