import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ASDRO - Smart Delivery Route Optimizer',
    short_name: 'ASDRO',
    description: 'Optimize your delivery route with automatic stop sequencing and navigation',
    start_url: '/',
    display: 'standalone',
    background_color: '#030712',
    theme_color: '#2563eb',
    icons: [
      { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    share_target: {
      action: '/share',
      method: 'GET',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
      },
    },
  };
}
