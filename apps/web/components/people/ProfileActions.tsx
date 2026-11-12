'use client';

import { useEffect, useState } from 'react';
import { Check, Plus } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { WorkRequestSheet } from '@/components/directory/WorkRequestSheet';
import type { DirectoryRole } from '@/lib/directory-roles';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';

// Reach + save, the foot of a claimed /p/{slug} page (URG-305).
//
// Signed out, both buttons go to sign in and come back here. Signed in, one
// call (by slug, after the page draws) says who to reach and whether the
// reader's team already saved this person; on the reader's own page the row is
// not drawn at all. Reach opens the existing work-request sheet; + saves the
// person to the team's contacts.

type Recipient = { userId: string; displayName: string; role: DirectoryRole | null };

const ACCENT = '#7fd99a';
const SURFACE = '#171719';
const LINE = '#202023';

export function ProfileActions({ slug }: { slug: string }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // On a computer the header's ProfileDeskActions reads reach instead (#1221).
  const isDesktop = useIsDesktopViewport();
  const [mounted, setMounted] = useState(false);
  const [self, setSelf] = useState(false);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [saved, setSaved] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isAuthenticated || isDesktop) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await fetch(`/api/public-profile/reach?slug=${encodeURIComponent(slug)}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok || cancelled) return;
        const body = (await response.json().catch(() => null)) as
          | { self?: boolean; saved?: boolean; recipient?: Recipient }
          | null;
        if (!body || cancelled) return;
        setSelf(body.self === true);
        setSaved(body.saved === true);
        setRecipient(body.recipient ?? null);
      } catch {
        // The buttons still work; Reach just asks again on tap.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isDesktop, slug]);

  const signIn = () => {
    window.location.href = `/auth?next=${encodeURIComponent(`/p/${slug}`)}`;
  };

  const reach = () => {
    if (!mounted || !isAuthenticated) return signIn();
    setStatus('');
    if (recipient) setSheetOpen(true);
  };

  const save = async () => {
    if (!mounted || !isAuthenticated) return signIn();
    if (saved || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/public-profile/reach', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) setStatus(body.error || 'Could not save. Try again.');
      else setSaved(true);
    } catch {
      setStatus('Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (self) return null;

  return (
    <div className="mt-6">
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={reach}
          className="motion-focus flex h-[52px] flex-1 items-center justify-center rounded-2xl text-base font-extrabold text-black"
          style={{ backgroundColor: ACCENT }}
        >
          Reach
        </button>
        <button
          type="button"
          onClick={() => void save()}
          aria-label={saved ? 'Saved' : 'Save'}
          aria-pressed={saved}
          className="motion-focus flex h-[52px] w-[52px] items-center justify-center rounded-2xl"
          style={{ backgroundColor: SURFACE, border: `1px solid ${LINE}`, color: saved ? ACCENT : '#fff' }}
        >
          {saved ? <Check className="h-5 w-5" aria-hidden="true" /> : <Plus className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      <p role="status" className="mt-3 min-h-5 text-sm" style={{ color: 'rgba(245,240,230,0.64)' }}>
        {status}
      </p>
      {sheetOpen && recipient ? (
        <WorkRequestSheet
          person={{ userId: recipient.userId, displayName: recipient.displayName }}
          defaultRole={recipient.role}
          releaseId={null}
          onClose={() => setSheetOpen(false)}
          onSent={(message) => {
            setSheetOpen(false);
            setStatus(message);
          }}
        />
      ) : null}
    </div>
  );
}
