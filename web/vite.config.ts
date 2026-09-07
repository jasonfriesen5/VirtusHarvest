import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served at the root of view.virtusharvest.com, so base stays '/'.
// If this ever moves under a path (e.g. virtusharvest.com/view), set
// base to '/view/' and add a matching basename to <BrowserRouter>.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  // Loopback only. Add `host: true` to reach the dev server from a phone on
  // the same Wi-Fi; left off so it isn't exposed to the local network.
  server: { port: 5180 },
});
