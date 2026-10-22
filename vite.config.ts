import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 會把網站放在 https://<帳號>.github.io/kang-app/ 底下
export default defineConfig({
  base: '/kang-app/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
});
