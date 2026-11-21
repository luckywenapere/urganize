import type { MetadataRoute } from 'next';
import { MUSIC_PATH } from '@/lib/home-path';
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
    start_url: MUSIC_PATH,
    display: 'standalone',
    // The dark theme's ground (2026-10-18; it was the old ink #0d120e, a shade
    // greener than the page, so an installed app's launch read as a second
    // load screen). Same value as themeColor in app/layout.tsx.
    background_color: '#0c0c0d',
    theme_color: '#0c0c0d',
    // The real pixel dimensions, not `sizes: "any"`. Chrome's installability
    // check wants a declared raster icon of at least 144px before it will
    // offer an install (and therefore before it fires beforeinstallprompt,
    // which is the whole desktop half of InstallAppPrompt); `any` is defined
    // for scalable icons and leaves a PNG's size ambiguous. This file is
    // 1004x1004 — if it is ever replaced, change this to match or the
    // desktop install offer quietly stops appearing.
    // Bring your notes: Urganize appears in the phone's share sheet. A shared chat
    // export, voice note, photo or text is caught by public/sw-share-target.js
    // and opens Bring your notes with it loaded. Android Chrome only; iPhone
    // Safari has no share targets for web apps.
    share_target: {
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        // The manifest spec wants {name, accept}; Next's type says File.
        files: [
          {
            name: 'files',
            accept: [
              'text/plain',
              'text/markdown',
              '.txt',
              '.md',
              '.docx',
              '.zip',
              'application/zip',
              'application/x-zip-compressed',
              'image/*',
              'audio/*',
              '.opus',
            ],
          },
        ],
      } as unknown as NonNullable<MetadataRoute.Manifest['share_target']>['params'],
    },
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
