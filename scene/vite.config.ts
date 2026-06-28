import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  mode: 'production',
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': JSON.stringify({ NODE_ENV: 'production' }),
  },
  build: {
    minify: 'esbuild',
    lib: {
      entry: path.resolve(__dirname, 'src/bridge.tsx'),
      name: 'Office3D',
      formats: ['iife'],
      fileName: () => 'office-scene.js',
    },
    outDir: path.resolve(__dirname, '../static/scene'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'office-scene.[ext]',
      },
    },
    cssCodeSplit: false,
  },
  publicDir: 'public',
});