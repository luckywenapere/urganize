'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { WorkRequestSheet } from '@/components/directory/WorkRequestSheet';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { copyText } from '@/lib/share-file';
import type { DirectoryRole } from '@/lib/directory-roles';

// The header actions on a person's page on a computer (#1221): Copy link and
// "Ask to work together". Signed out, the ask sends a stranger to sign up
// first. Signed in, it opens the existing work-request sheet, read from the
// same reach call the phone's Reach button uses. On your own page the ask is
// not drawn. The reach call runs only at desktop width, so a phone (which
// draws ProfileActions instead) never asks twice.

type Recipient = { userId: string; displayName: string; role: DirectoryRole | null };

const ACCENT = '#7fd99a';
const LINE = '#2c2c30';
const CREAM = '#f2f2f0';

export function ProfileDeskActions({ slug }: { slug: string }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isDesktop = useIsDesktopViewport();
  const [self, setSelf] = useState(false);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !isDesktop) return;
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
        const body = (await response.json().catch(() => null)) as { self?: boolean; recipient?: Recipient } | null;
        if (!body || cancelled) return;
        setSelf(body.self === true);
        setRecipient(body.recipient ?? null);
      } catch {
        // The ask says so on tap instead.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isDesktop, slug]);

  const copy = async () => {
    const ok = await copyText(`${window.location.origin}/p/${slug}`);
    setCopied(ok);
    setStatus(ok ? '' : 'Could not copy. Copy the address bar instead.');
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  const ask = () => {
    if (!isAuthenticated) {
      window.location.href = '/onboarding';
      return;
    }
    if (recipient) {
      setStatus('');
      setSheetOpen(true);
    } else {
      setStatus('Could not reach them right now. Try again in a moment.');
    }
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => void copy()}
          className="motion-focus inline-flex h-10 items-center rounded-full px-4 text-[13px] font-medium"
          style={{ border: `1px solid ${LINE}`, color: CREAM }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {self ? null : (
          <button
            type="button"
            onClick={ask}
            className="motion-focus inline-flex h-10 items-center rounded-full px-4 text-[13px] font-bold text-black"
            style={{ backgroundColor: ACCENT }}
          >
            Ask to work together
          </button>
        )}
      </div>
      <p role="status" className="min-h-5 text-right text-sm" style={{ color: 'rgba(245,240,230,0.64)' }}>
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

/** "Directory" back link, only for a signed-in reader: a stranger on a shared
 *  link has no Directory to go back to. */
export function DirectoryBackLink({ color }: { color: string }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <span className="h-5" aria-hidden />;
  return (
    <Link href="/dashboard/directory" className="motion-focus inline-flex w-fit items-center gap-2 text-sm" style={{ color }}>
      <span aria-hidden>←</span> Directory
    </Link>
  );
}
