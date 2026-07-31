import type { MetadataRoute } from 'next';
import { HOME_PATH } from '@/lib/home-path';

// Web app manifest — makes the app installable as a PWA (Add to Home
// Screen), which is a prerequisite for push notifications on iOS Safari
// (16.4+) and gives Android installs a proper standalone window. Served at
// /manifest.webmanifest by the Next file convention.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Urganize',
    short_name: 'Urganize',
    description:
      'Urganize is how your music gets the release it deserves — plan releases, track tasks, keep your team aligned.',
    // Cold-launch destination for an installed PWA — kept in sync with the
    // in-app post-auth landing surface (URG-205) via the shared constant.
    start_url: HOME_PATH,
    display: 'standalone',
    background_color: '#0d120e',
    theme_color: '#0d120e',
    icons: [
      {
        src: '/images/urganize-logo-square.png',
        sizes: 'any',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
