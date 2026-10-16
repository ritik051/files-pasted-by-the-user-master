import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'editor';
          if (id.includes('@react-three') || id.includes('/three/')) return 'three';
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react';
          return undefined;
        },
      },
    },
  },
});
