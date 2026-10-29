'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { whatsappShareHref } from '@/lib/claim-copy';
import { currentShareOrigin } from '@/lib/app-hosts';

// The two buttons on an unclaimed page (URG-304): Claim this profile, and
// Invite <first name>.
//
// Claim hands off to the existing claim route. Signed out, it goes through
// /auth and comes back here. Signed in, /api/claim-start makes a claim link
// only when the account's confirmed email is on this person's credits, then
// opens /claim/{token}; anyone else is told to sign in with that email.
//
// Invite shares this page with the person (the phone's share sheet, or
// WhatsApp where there is none). The page itself is what invites them: it is
// theirs to claim or remove.

const ACCENT = 'var(--kit-accent)';
const SURFACE = 'var(--kit-surface)';
const STROKE = 'var(--kit-border)';
const CREAM = 'var(--kit-text)';
const MUTED = 'var(--kit-text-muted)';

export function UnclaimedActions({ slug, displayName }: { slug: string; displayName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const firstName = displayName.trim().split(/\s+/)[0] || 'them';

  async function claim() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        window.location.assign(`/auth?next=${encodeURIComponent(`/p/${slug}`)}`);
        return;
      }
      const response = await fetch('/api/claim-start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (response.ok && typeof body.url === 'string' && body.url.startsWith('/claim/')) {
        window.location.assign(body.url);
        return;
      }
      setError(body.error || 'Try again.');
    } catch {
      setError('Try again.');
    }
    setBusy(false);
  }

  async function invite() {
    const url = `${currentShareOrigin()}/p/${slug}`;
    const text = `${firstName}, your page on Urganize: ${url}`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text, url });
        return;
      } catch {
        // Dismissed or unsupported: fall back to WhatsApp below only when
        // the share sheet could not open at all.
        return;
      }
    }
    window.open(whatsappShareHref(text), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="mt-7 flex flex-col gap-2.5">
      <button
        type="button"
        onClick={claim}
        disabled={busy}
        className="flex h-[52px] items-center justify-center rounded-2xl text-base font-extrabold disabled:opacity-60"
        style={{ backgroundColor: ACCENT, color: '#000' }}
      >
        Claim this profile
      </button>
      <button
        type="button"
        onClick={invite}
        className="flex h-[52px] items-center justify-center rounded-2xl text-base font-extrabold"
        style={{ backgroundColor: SURFACE, border: `1px solid ${STROKE}`, color: CREAM }}
      >
        Invite {firstName}
      </button>
      {error ? (
        <p role="alert" className="text-center text-sm" style={{ color: MUTED }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
