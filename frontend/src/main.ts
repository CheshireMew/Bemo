import { createApp } from 'vue'
import './style.css'
import './assets/settings.css'
import { Capacitor } from '@capacitor/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { setRuntimeConfigOverride } from './config';

async function bootstrap() {
  if (isTauri() && !Capacitor.isNativePlatform()) {
    const connection = await invoke<{ api_origin: string; data_dir: string }>('backend_connection');
    setRuntimeConfigOverride({ apiBase: connection.api_origin, appStorageMode: 'backend' });
  }
  const { default: App } = await import('./App.vue');
  createApp(App).mount('#app');
}
void bootstrap().catch((error) => {
  const root = document.querySelector('#app');
  if (!root) return;
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = `Bemo 无法启动：${String(error)}。请检查后端环境和数据目录权限，再重启应用。`;
  root.replaceChildren(message);
});

const isDevRuntime = import.meta.env.DEV;
const isNativeRuntime = Capacitor.isNativePlatform() || isTauri();

async function unregisterServiceWorkersAndClearCaches() {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.filter((registration) =>
    [registration.active, registration.waiting, registration.installing].some((worker) => worker && new URL(worker.scriptURL).pathname === '/sw.js')
  ).map((registration) => registration.unregister()));

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('bemo-')).map((key) => caches.delete(key)));
  }
}

if (isDevRuntime || isNativeRuntime) {
  window.addEventListener('load', () => {
    unregisterServiceWorkersAndClearCaches().catch((err) => {
      console.warn('[SW] Cleanup failed:', err);
    });
  });
}

// Register Service Worker for PWA
if (!isDevRuntime && !isNativeRuntime && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(async (reg) => {
      await reg.update();
      console.log('[SW] Registered:', reg.scope);
    }).catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
  });
}
