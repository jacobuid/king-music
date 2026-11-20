import { defineConfig } from 'vite'

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]
export default defineConfig({
  base: process.env.VITE_BASE_PATH || (repository ? `/${repository}/` : '/'),
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
        configure(proxy) {
          // Same-origin GETs omit Origin; KingAuth requires the frontend origin.
          proxy.on('proxyReq', (proxyRequest, request) => {
            if (!request.headers.origin) proxyRequest.setHeader('Origin', 'http://localhost:5173')
          })
        },
      },
    },
  },
})
