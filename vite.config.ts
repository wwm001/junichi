import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.GITHUB_ACTIONS ? '/junichi/' : '/';
const buildVersion =
  process.env.GITHUB_SHA?.slice(0, 7) ??
  new Date().toISOString().replace(/[-:.TZ]/g, '');

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/icon.svg', 'icons/icon-maskable.svg'],
      manifest: {
        id: base,
        name: '英検準一級合格アプリ準一 (JUNICHI)',
        short_name: 'JUNICHI',
        description: '英検準一級の語彙を短時間で学習するモバイル向けPWA',
        theme_color: '#1f2937',
        background_color: '#f9fafb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icons/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,svg,json,woff2,webmanifest}']
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  test: {
    environment: 'node'
  }
});
