import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { versionFrontendAssetReferences } from './src/routing/frontend-assets';
import { staticHtmlEntries } from './src/routing/routes';

const generatedHtmlInputs = staticHtmlEntries(__dirname);

export default defineConfig(async ({ command }) => {
  // Pages Functions own production APIs. Vite has no Functions runtime, so
  // local serve/preview receives an explicitly stale synthetic sample instead.
  // Keep this dynamic import out of `vite build` and every production bundle.
  const localPreviewPlugins = command === 'serve'
    ? [(await import('./scripts/local-preview-benchmark-api')).localPreviewBenchmarkApi()]
    : [];
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...localPreviewPlugins,
      {
        name: 'version-stable-frontend-assets',
        enforce: 'post' as const,
        transformIndexHtml: {
          order: 'post' as const,
          handler: versionFrontendAssetReferences,
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      cssCodeSplit: false,
      rollupOptions: {
        input: generatedHtmlInputs,
        output: {
          entryFileNames: 'assets/[name].js',
          // Every generated HTML page imports this shared browser entry. Keep the Pages Function target stable.
          chunkFileNames: (chunk) => chunk.moduleIds.some((moduleId) => moduleId.replaceAll('\\', '/').endsWith('/src/main.tsx'))
            ? 'assets/main.js'
            : 'assets/[name]-[hash].js',
          assetFileNames: (asset) => asset.names?.some((name) => name.endsWith('.css'))
            ? 'assets/tokenbench.css'
            : 'assets/[name]-[hash][extname]',
        },
      },
    },
    test: {
      environment: 'happy-dom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
    },
  };
});
