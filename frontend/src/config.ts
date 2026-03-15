// Centralized API configuration

// Ensure it points to exactly what we need per environment
// 1. In browser (Web/PWA): we can read from import.meta.env
// 2. In Capacitor (Mobile): it needs a full URL (e.g., https://api.bemo.com)
// 3. In Tauri (Desktop): the sidecar spins up locally, so http://127.0.0.1:8000

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
