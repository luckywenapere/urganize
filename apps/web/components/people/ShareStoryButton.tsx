'use client';

import { useEffect, useState } from 'react';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { profileLinkSharedProperties, type ProfileShareSurface } from '@/lib/profile-growth';
import { shareCardPath } from '@/lib/person-page';
import { shareFileToApps } from '@/lib/share-file';

// "Share to Story" (URG-305): the person's 9:16 card as a file, into the phone's
// share sheet (where Instagram and WhatsApp status live), or saved on a desktop.
//
// The card is fetched BEFORE the tap: a browser only opens the share sheet
// inside the tap that asked for it, so the File must already be in hand
// (lib/share-file.ts has the full reason). The button waits until it is.

const ACCENT = '#7fd99a';

export function ShareStoryButton({
  slug,
  surface,
  className = '',
}: {
  slug: string;
  surface: ProfileShareSurface;
  className?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(shareCardPath(slug), { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (!cancelled) setFile(new File([blob], `${slug}-urganize.png`, { type: 'image/png' }));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (failed) return null;

  return (
    <button
      type="button"
      disabled={!file}
      onClick={async () => {
        if (!file) return;
        const outcome = await shareFileToApps({ file, title: 'Urganize' });
        if (outcome === 'shared' || outcome === 'downloaded') {
          captureAnalyticsEvent(
            createPostHogEvent('profile_link_shared', profileLinkSharedProperties({ method: 'story', surface }))
          );
        }
      }}
      className={`motion-focus flex h-[52px] w-full items-center justify-center rounded-2xl text-base font-extrabold text-black disabled:opacity-60 ${className}`}
      style={{ backgroundColor: ACCENT }}
    >
      Share to Story
    </button>
  );
}
