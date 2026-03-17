import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    },
    // 禁止浏览器缓存 HTML 入口，彻底避免旧哈希 504 问题
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  optimizeDeps: {
    include: ['axios', 'marked', 'lucide-vue-next', 'turndown', 'turndown-plugin-gfm'],
  },
})
