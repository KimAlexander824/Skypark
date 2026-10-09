import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const recognitionUrl = env.RECOGNITION_URL || 'http://localhost:8001'
  const recognitionToken = env.RECOGNITION_TOKEN

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      proxy: {
        '/recognition': {
          target: recognitionUrl,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/recognition/, ''),
          headers: recognitionToken ? { 'X-Internal-Token': recognitionToken } : undefined,
        },
      },
    },
  }
})
