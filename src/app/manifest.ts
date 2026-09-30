import type { MetadataRoute } from 'next'

/** Manifest PWA: instala el sistema como app (abre directo en el POS). */
export default function manifest(): MetadataRoute.Manifest {
  const nombre = process.env.NEXT_PUBLIC_APP_NAME || 'MiniMarket'
  return {
    name: nombre,
    short_name: nombre.length > 12 ? 'MiniMarket' : nombre,
    description: 'Punto de venta, inventario y facturación electrónica',
    start_url: '/pos',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#070710',
    theme_color: '#2563eb',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }
}
