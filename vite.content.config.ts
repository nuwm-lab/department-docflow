// Збірка content script для Gmail в один IIFE-файл dist/content.js.
// Запускається після основної збірки й не очищає dist.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    outDir: r('./dist'),
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: r('./src/content/gmail.ts'),
      formats: ['iife'],
      name: 'DocflowContent',
      fileName: () => 'content.js',
    },
  },
});
