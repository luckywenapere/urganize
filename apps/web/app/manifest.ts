import type { MetadataRoute } from 'next';
import { HOME_PATH } from '@/lib/home-path';
import { SHORT_DESCRIPTION } from '@/lib/positioning';

// Web app manifest — makes the app installable as a PWA (Add to Home
// Screen), which is a prerequisite for push notifications on iOS Safari
// (16.4+) and gives Android installs a proper standalone window. Served at
// /manifest.webmanifest by the Next file convention.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Urganize',
    short_name: 'Urganize',
    // An app store reviewer reads this, so it carries the positioning (the
    // founder's core line since 2026-09-24) and no em dash. `SHORT_DESCRIPTION`
    // is under 160 characters for exactly this kind of field.
    description: SHORT_DESCRIPTION,
    // Cold-launch destination for an installed PWA — kept in sync with the
    // in-app post-auth landing surface (URG-205) via the shared constant.
    start_url: HOME_PATH,
    display: 'standalone',
    background_color: '#0d120e',
    theme_color: '#0d120e',
    // The real pixel dimensions, not `sizes: "any"`. Chrome's installability
    // check wants a declared raster icon of at least 144px before it will
    // offer an install (and therefore before it fires beforeinstallprompt,
    // which is the whole desktop half of InstallAppPrompt); `any` is defined
    // for scalable icons and leaves a PNG's size ambiguous. This file is
    // 1004x1004 — if it is ever replaced, change this to match or the
    // desktop install offer quietly stops appearing.
    icons: [
      {
        src: '/images/urganize-logo-square.png',
        sizes: '1004x1004',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
