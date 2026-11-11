// Збірка сторінок розширення (popup, options) і service worker.
// Content script збирається окремо (vite.content.config.ts), бо Chrome
// не підтримує ES-модулі в content scripts — потрібен один IIFE-файл.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('./src'),
  publicDir: r('./public'), // manifest.json та іконки копіюються як є
  build: {
    outDir: r('./dist'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    // Chrome підтримує modulepreload нативно — поліфіл не потрібен.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: r('./src/popup/index.html'),
        options: r('./src/options/index.html'),
        background: r('./src/background/index.ts'),
      },
      output: {
        // service worker має стабільну назву, бо на нього посилається manifest.json
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
