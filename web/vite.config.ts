import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const appPort = Number(env.VITE_PORT || env.PORT || 4177);
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8000';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: appPort,
      strictPort: false,
      // Allow HMR to be disabled in scripted sessions.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: appPort,
      strictPort: false,
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('file-saver')) {
              return 'export-pdf';
            }

            if (id.includes('recharts')) {
              return 'charts';
            }

            if (
              id.includes('motion') ||
              id.includes('date-fns') ||
              id.includes('@tiptap/')
            ) {
              return 'shift-handoff-vendor';
            }

            if (id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'ui-utils';
            }

            if (id.includes('lucide-react')) {
              return 'icons';
            }

            return undefined;
          },
        },
      },
    },
  };
});
