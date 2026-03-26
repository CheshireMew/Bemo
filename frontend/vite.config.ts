import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/vue')) return 'vendor-vue'
          if (id.includes('node_modules/lucide-vue-next')) return 'vendor-icons'
          if (id.includes('node_modules/marked') || id.includes('node_modules/turndown')) return 'vendor-markdown'
          if (id.includes('node_modules/jszip')) return 'vendor-archive'
          if (id.includes('/src/domain/sync/webdav/')) return 'sync-webdav'
          if (id.includes('/src/domain/sync/')) return 'sync-core'
          if (id.includes('/src/components/AiChatModal.vue') || id.includes('/src/composables/useAi')) return 'feature-ai'
          if (id.includes('/src/components/Editor.vue') || id.includes('/src/composables/useEditor')) return 'feature-editor'
          return undefined
        },
      },
    },
  },
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
