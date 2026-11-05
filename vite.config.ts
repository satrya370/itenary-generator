import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_DEV_PORT || 5173),
    proxy: { '/api': `http://127.0.0.1:${Number(process.env.PORT || 3000)}` }
  }
});
