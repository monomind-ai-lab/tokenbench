import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const guideSlugs = [
  'track-claude-code-usage',
  'monitor-openai-codex-usage',
  'openrouter-guide-model-routing-cost-controls',
  'legitimate-free-ai-api-access-credits',
  'reduce-llm-api-costs-caching-batch-output-limits',
];

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          guides: path.resolve(__dirname, 'guides/index.html'),
          ...Object.fromEntries(guideSlugs.map((slug) => [`guide-${slug}`, path.resolve(__dirname, `guides/${slug}/index.html`)])),
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
