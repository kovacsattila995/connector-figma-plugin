import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

// Two separate configs exported via env var
const target = process.env.BUILD_TARGET;

export default defineConfig(
  target === 'code'
    ? {
        build: {
          lib: {
            entry: resolve(__dirname, 'src/plugin/code.ts'),
            formats: ['iife'],
            name: 'code',
            fileName: () => 'code.js',
          },
          target: 'es2017',
          outDir: 'dist',
          emptyOutDir: false,
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
        },
      }
    : {
        plugins: [react(), viteSingleFile()],
        root: resolve(__dirname, 'src/ui'),
        build: {
          outDir: resolve(__dirname, 'dist'),
          emptyOutDir: false,
        },
      }
);
