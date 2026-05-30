import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-vue',
              test: /node_modules[\\/](vue|@vue|vue-router|pinia)[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor-element-icons',
              test: /node_modules[\\/]@element-plus[\\/]icons-vue[\\/]/,
              priority: 25,
            },
            {
              name: 'vendor-element-plus',
              test: /node_modules[\\/]element-plus[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-common',
              test: /node_modules[\\/]/,
              priority: 10,
              maxSize: 450 * 1024,
            },
          ],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
