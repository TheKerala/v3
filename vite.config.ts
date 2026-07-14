import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // This allows Rolldown to handle mixed ESM/CJS imports properly
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});