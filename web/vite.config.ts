import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served at the root of its own host (view.virtusfeed.com when that exists),
// so base stays '/'. Port 5181 so it can run alongside the Harvest console,
// which owns 5180.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5181 },
});
