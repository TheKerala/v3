// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // This often resolves Rolldown CJS/ESM interop errors
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});