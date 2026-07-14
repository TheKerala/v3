import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    // This forces Vite to handle mixed CommonJS and ES Modules,
    // which prevents the Rolldown binding error.
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  // Add this to bypass the strict Rolldown check
  ssr: {
    noExternal: true
  }
});