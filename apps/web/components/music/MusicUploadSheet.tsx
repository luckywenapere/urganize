'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2, X } from '@/components/icons/lucide';
import { MusicSection } from '@/components/releases/MusicSection';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { useToast } from '@/components/shared/ToastProvider';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { supabase } from '@/lib/supabase/client';
import { Vinyl } from './Vinyl';

type Rollout = { id: string; title: string; artistName: string; releaseDate: string | null; coverUrl: string | null };

function describeDate(iso: string | null): string {
  if (!iso) return 'No release day yet';
  const day = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(day.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (day.getTime() <= today.getTime()) return 'Out now';
  return `Out ${day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

/**
 * Upload a song from the music side (#1364). Step one asks which rollout the
 * song is from; step two is the same upload, publish and rights screen a
 * rollout already has (MusicSection), so there is one way to put a song out.
 */
export function MusicUploadSheet({ onClose }: { onClose: () => void }) {
  const { pushToast } = useToast();
  const [rollouts, setRollouts] = useState<Rollout[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Rollout | null>(null);

  useEffect(() => lockBodyScroll(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch('/api/releases', {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        });
        const data = (await response.json().catch(() => ({}))) as {
          releases?: Array<{ id: string; title?: string; artistName?: string; releaseDate?: string | null; coverArtUrl?: string | null }>;
        };
        if (!response.ok || !Array.isArray(data.releases)) throw new Error('failed');
        if (cancelled) return;
        setRollouts(
          data.releases.map((release) => ({
            id: release.id,
            title: release.title || 'Untitled',
            artistName: release.artistName || '',
            releaseDate: release.releaseDate ?? null,
            coverUrl: release.coverArtUrl ?? null,
          }))
        );
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[170] flex flex-col bg-black/40" onClick={onClose}>
      <DialogPanel
        label={picked ? `Upload a song to ${picked.title}` : 'Upload a song'}
        onClose={onClose}
        className="mt-auto max-h-[88dvh] overflow-y-auto rounded-t-3xl border-t border-content-primary/[0.08] bg-bg-base px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2.5 md:mx-auto md:my-auto md:w-full md:max-w-lg md:rounded-3xl md:border"
      >
        <div onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto mb-3.5 h-1 w-[38px] rounded-full bg-content-primary/[0.16] md:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-1">
              {picked ? (
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  aria-label="Pick another rollout"
                  className="motion-focus -ml-2 inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-content-secondary hover:bg-content-primary/[0.06]"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : null}
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold tracking-[-0.03em] text-content-primary">
                  {picked ? picked.title : 'Upload a song'}
                </h2>
                <p className="truncate text-[13px] text-content-secondary">
                  {picked ? picked.artistName : 'Which rollout is it from?'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="motion-focus -mr-2 -mt-1 inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-content-secondary hover:bg-content-primary/[0.06]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {picked ? (
            <div className="mt-4">
              <MusicSection releaseId={picked.id} onToast={(message, tone) => pushToast(message, tone)} />
            </div>
          ) : failed ? (
            <p role="alert" className="mt-5 text-sm text-content-secondary">
              We could not load your rollouts. Check your connection and try again.
            </p>
          ) : rollouts === null ? (
            <div className="mt-6 flex justify-center text-content-secondary">
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading your rollouts" />
            </div>
          ) : rollouts.length === 0 ? (
            <p className="mt-5 text-sm text-content-secondary">
              A song goes on Urganize Music from a rollout. Start one on the dashboard, then upload it here.
            </p>
          ) : (
            <ul className="m-0 mt-3.5 list-none rounded-2xl border border-content-primary/[0.08] bg-bg-surface px-3.5 py-0">
              {rollouts.map((rollout) => (
                <li key={rollout.id} className="border-b border-content-primary/[0.08] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setPicked(rollout)}
                    className="motion-focus flex min-h-[58px] w-full items-center gap-3 text-left"
                  >
                    <Vinyl track={{ title: rollout.title, coverUrl: rollout.coverUrl }} showInitials className="h-9 w-9" grooves={4} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-content-primary">{rollout.title}</span>
                      <span className="block truncate text-xs text-content-tertiary">
                        {[rollout.artistName, describeDate(rollout.releaseDate)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 flex-none text-content-tertiary" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogPanel>
    </div>
  );
}
