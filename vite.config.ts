import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
  build: {
    // Videos in public/ must be served as real files with a Content-Length,
    // which is what ScrollVideo's blob preloader needs for a true percentage.
    // Inlining any asset as a data: URI would defeat that.
    assetsInlineLimit: 0,
  },
});
