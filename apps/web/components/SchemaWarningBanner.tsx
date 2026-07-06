'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

const CHECKED_KEY = 'urganize.schema.artist_name.checked';
const MISSING_KEY = 'urganize.schema.artist_name.missing';
const DISMISSED_KEY = 'urganize.schema.artist_name.dismissed';

const isMissingArtistNameColumnError = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false;
  const code = String(error.code || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();
  return (
    (code === 'pgrst204' || code === '42703') &&
    message.includes('artist_name')
  ) || (
    message.includes('artist_name') &&
    (message.includes('column') || message.includes('schema cache') || message.includes('does not exist'))
  );
};

type SchemaWarningBannerProps = {
  enabled: boolean;
};

export function SchemaWarningBanner({ enabled }: SchemaWarningBannerProps) {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const dismissed = localStorage.getItem(DISMISSED_KEY) === '1';
    const checked = localStorage.getItem(CHECKED_KEY) === '1';
    const missing = localStorage.getItem(MISSING_KEY) === '1';

    if (dismissed) return;
    if (checked) {
      setShowWarning(missing);
      return;
    }

    let cancelled = false;

    const check = async () => {
      const { error } = await supabase.from('profiles').select('artist_name').limit(1);
      const isMissing = isMissingArtistNameColumnError(error || undefined);
      if (cancelled) return;
      localStorage.setItem(CHECKED_KEY, '1');
      localStorage.setItem(MISSING_KEY, isMissing ? '1' : '0');
      setShowWarning(isMissing);
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || !showWarning) return null;

  return (
    <div className="fixed left-1/2 top-3 z-[200] w-[min(980px,calc(100%-1.5rem))] -translate-x-1/2 rounded-xl border border-status-warning/45 bg-status-warning/12 px-4 py-3 shadow-[0_14px_36px_-24px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-content-primary">
          Schema warning: `profiles.artist_name` is missing. Artist profile lock/prefill may fail. Run migration in{' '}
          <Link href="/docs/DB_MIGRATION_ARTIST_NAME.md" className="underline">
            docs/DB_MIGRATION_ARTIST_NAME.md
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            setShowWarning(false);
            localStorage.setItem(DISMISSED_KEY, '1');
          }}
          className="rounded-md border border-stroke-default bg-bg-surface px-2.5 py-1 text-xs text-content-primary hover:bg-bg-hover"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
