'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';

// Policy-update notice (URG-410, founder call 2026-10-19). The terms promise that
// material changes are flagged in-product, so this is that flag: one calm line in
// the strip slot, shown only to accounts created before the update, gone for good
// once dismissed. Bump POLICY_UPDATED_AT (and the key with it) for the next
// material change; the dismissal is per browser, which is enough for a notice.
const POLICY_UPDATED_AT = '2026-10-19';
const SEEN_KEY = `urganize.policy-seen.${POLICY_UPDATED_AT}`;
const TERMS_URL = 'https://urganize.app/terms';

export function PolicyUpdateStrip() {
  const createdAt = useAuthStore((s) => s.user?.created_at ?? null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(SEEN_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed || !createdAt || createdAt.slice(0, 10) >= POLICY_UPDATED_AT) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode: hidden for this visit only */
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 border-b border-stroke-subtle bg-bg-surface px-4 py-2 text-center">
      <p className="text-sm text-content-secondary">
        <span className="font-medium text-content-primary">We updated our terms and privacy policy.</span>{' '}
        <span className="hidden sm:inline">They now cover distribution, pitching and UrgAns.</span>
      </p>
      <a
        href={TERMS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-sm font-medium text-brand underline-offset-4 hover:underline"
      >
        Read
      </a>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 text-sm font-medium text-content-secondary underline-offset-4 hover:underline"
      >
        Got it
      </button>
    </div>
  );
}


