import { createApp } from 'vue'
import './style.css'
import './assets/settings.css'
import App from './App.vue'

createApp(App).mount('#app')

const isDevRuntime = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

async function unregisterDevServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

if (isDevRuntime) {
  window.addEventListener('load', () => {
    unregisterDevServiceWorkers().catch((err) => {
      console.warn('[SW] Dev cleanup failed:', err);
    });
  });
}

// Register Service Worker for PWA
if (!isDevRuntime && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[SW] Registered:', reg.scope);
    }).catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
  });
}
