import { reactive } from 'vue';
import { defaultSettings } from './defaultSettings.js';
import type { AppSettings } from './settingsTypes.js';

export const settings = reactive<AppSettings>(structuredClone(defaultSettings));
