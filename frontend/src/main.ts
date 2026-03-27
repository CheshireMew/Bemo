import { createApp } from 'vue'
import './style.css'
import './assets/settings.css'
import App from './App.vue'
import { Capacitor } from '@capacitor/core';

createApp(App).mount('#app')

const isDevRuntime = import.meta.env.DEV;
const isNativeRuntime = Capacitor.isNativePlatform();

async function unregisterServiceWorkersAndClearCaches() {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
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
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[SW] Registered:', reg.scope);
    }).catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
  });
}
