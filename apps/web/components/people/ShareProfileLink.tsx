'use client';

import { useState, useSyncExternalStore } from 'react';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { openExternalUrl } from '@/lib/external-link';
import {
  PROFILE_GROWTH_COPY,
  profileLinkSharedProperties,
  profileShareText,
  profileWhatsappHref,
  type ProfileShareMethod,
  type ProfileShareSurface,
} from '@/lib/profile-growth';
import { canShareTextToApps, copyText, shareTextToApps } from '@/lib/share-file';

// One-tap sharing of a person's own public page (2026-10-11): Copy link,
// the phone's share sheet where there is one, and WhatsApp, which is how most
// of our people send links. Shown on the claim's last step ("Your page is
// saved.") and on their own /p/{slug} when they are signed in as its owner.
//
// `tone` picks the palette: 'app' for the claim page (the app's tokens),
// 'kit' for the dark-locked public page. Each successful share sends
// `profile_link_shared` with how and where, and nothing else.

type Tone = 'app' | 'kit';

const noSubscribe = () => () => {};

export function ShareProfileLink({
  url,
  surface,
  tone = 'app',
}: {
  url: string;
  surface: ProfileShareSurface;
  tone?: Tone;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  // The share sheet only exists in the browser: false on the server, read
  // once on the client. Nothing to subscribe to, it does not change.
  const canShare = useSyncExternalStore(noSubscribe, canShareTextToApps, () => false);

  const report = (method: ProfileShareMethod) =>
    captureAnalyticsEvent(createPostHogEvent('profile_link_shared', profileLinkSharedProperties({ method, surface })));

  async function onCopy() {
    setFailed(false);
    const ok = await copyText(url);
    if (!ok) {
      setFailed(true);
      return;
    }
    setCopied(true);
    report('copy');
    window.setTimeout(() => setCopied(false), 2500);
  }

  async function onShare() {
    const outcome = await shareTextToApps({ text: profileShareText(url) });
    if (outcome === 'shared') report('share');
    else if (outcome === 'unsupported') void onCopy();
  }

  function onWhatsapp() {
    report('whatsapp');
    void openExternalUrl(profileWhatsappHref(url));
  }

  const button =
    tone === 'kit'
      ? 'inline-flex min-h-11 items-center rounded-full px-4 text-sm'
      : 'inline-flex min-h-11 items-center rounded-full border border-stroke-control px-4 text-sm hover:border-content-secondary';
  const kitButton = tone === 'kit' ? { border: '1px solid var(--kit-border)', color: 'var(--kit-text)' } : undefined;
  const muted = tone === 'kit' ? { color: 'var(--kit-text-muted)' } : undefined;

  return (
    <section aria-labelledby="share-profile-heading" className="mt-8">
      <h2 id="share-profile-heading" className="text-sm font-medium">
        {PROFILE_GROWTH_COPY.shareHeading}
      </h2>
      <p className={tone === 'kit' ? 'mt-1 text-sm' : 'mt-1 text-sm text-content-secondary'} style={muted}>
        {PROFILE_GROWTH_COPY.shareHint}
      </p>
      <p className="mt-3 break-all font-mono text-xs" style={muted}>
        {url}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void onCopy()} className={button} style={kitButton}>
          {copied ? PROFILE_GROWTH_COPY.copied : PROFILE_GROWTH_COPY.copyLink}
        </button>
        {canShare ? (
          <button type="button" onClick={() => void onShare()} className={button} style={kitButton}>
            {PROFILE_GROWTH_COPY.share}
          </button>
        ) : null}
        <button type="button" onClick={onWhatsapp} className={button} style={kitButton}>
          {PROFILE_GROWTH_COPY.whatsapp}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs" style={muted}>
        {failed ? PROFILE_GROWTH_COPY.copyFailed : copied ? PROFILE_GROWTH_COPY.copied : ''}
      </p>
    </section>
  );
}
