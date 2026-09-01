export type ImageCompressionMode = 'original' | 'balanced' | 'compact';
export type EditorMode = 'rich-text' | 'markdown';
export type CopyFormat = 'rich-text' | 'markdown';
export type SyncMode = 'local' | 'server' | 'webdav';

export interface AppSettings {
  importExport: {
    lastSection: 'export' | 'import';
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
