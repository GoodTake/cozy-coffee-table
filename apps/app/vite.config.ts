import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import stepsEditMarker from './.steps/visual-edit/babel-plugin';
import { stepsVisualEditRuntime } from './.steps/visual-edit/vite-plugin';

export default defineConfig(({ command }) => ({
  // Absolute, in both commands. A published site is served from the root of its own host
  // (deploy/cloudflare-release/src/static.js) and routes with BrowserRouter, so a relative
  // base makes every route below the root resolve its own bundle against that route --
  // `/journey/x` asks for `/journey/assets/index-*.js`, gets 404, and renders a blank page.
  // The dev server never showed it because only `build` emitted the relative base, so the
  // defect reached learners while every preview looked correct. Serving a built copy from a
  // sub-path (GitHub Pages and the like) is the one case that wants './', and that is not a
  // surface this platform serves.
  base: '/',
  // The platform preview container sets VITE_CACHE_DIR to a container-private
  // path so Vite's dep cache never lands in the shared project mount (a cache dir
  // owned by another uid there once bricked cold starts with EACCES). Unset —
  // local dev, exported projects — falls back to node_modules/.vite.
  ...(process.env.VITE_CACHE_DIR ? { cacheDir: process.env.VITE_CACHE_DIR } : {}),
  plugins: [
    react({
      babel: {
        plugins: command === 'serve' ? [stepsEditMarker] : [],
      },
    }),
    ...(command === 'serve' ? [stepsVisualEditRuntime()] : []),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
  },
}));
