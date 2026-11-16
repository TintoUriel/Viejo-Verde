import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages sirve la app en https://tintouriel.github.io/Viejo-Verde/
const base = '/Viejo-Verde/'

export default defineConfig({
  base,
  define: {
    __VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
    __COMPILADO__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Viejo Verde',
        short_name: 'Viejo Verde',
        description: 'Autocultivo: etapas, tareas de hoy, semillas y asistente.',
        lang: 'es-AR',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F2F2F7',
        theme_color: '#2E7D3A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${base}index.html`,
        // Nada de caché para las APIs: el clima, Claude y la planilla van siempre a la red.
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
