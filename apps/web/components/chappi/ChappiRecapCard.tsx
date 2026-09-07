'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Share2, Sparkles, X } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { isNativePlatform } from '@/lib/platform';
import { shareOrDownloadImage } from '@/lib/share-file';
import { recapFileName, type RecapSize } from '@/lib/recap-share';
import type { ReleaseRecap } from '@/types/recap';

type ChappiRecapCardProps = {
  releaseId: string;
  /** For the headline and the saved filename, so the card names what it is. */
  releaseTitle: string;
  onDismiss: () => void;
  /**
   * Says what happened, in the assistant's own voice.
   *
   * A transcript line rather than a toast, matching how the two upload cards
   * report (`handleSongUploaded` appends a reply): this component renders in
   * three surfaces — the page, the dock and the rail — and only two of them
   * sit under a ToastProvider, so a toast would be silent in the third. The
   * conversation is also the right place for it: "Recap saved." is a thing the
   * assistant just did.
   */
  onReport: (message: string) => void;
};

/**
 * Handing over the finished recap poster from inside the conversation.
 *
 * The mirror image of ChappiSongUploadCard: that card exists because a tool
 * cannot be HANDED a file, this one because a tool cannot GIVE you one. The
 * recap's output is two PNGs, and a paragraph of text cannot hand those over —
 * so `generate_recap` builds them and this card does the sharing, through the
 * same `shareOrDownloadImage` path the removed RecapModal used.
 *
 * It replaced that modal on 2026-09-07 (founder call: the recap belongs in the
 * UrgAns conversation, like the status update the day before). Three of the
 * modal's four steps were already conversational and needed no card at all —
 * `get_recap` answers "is there one", the optional highlight is collected by
 * asking, and `generate_recap` builds it. Only the fourth, handing the image
 * over, could not be said in words.
 *
 * TWO THINGS IT DELIBERATELY DOES NOT CARRY, both of which the modal had:
 *
 *  - No Regenerate button. Asking again IS the regenerate, and it is better,
 *    because the highlight is part of the request — the route replaces both
 *    PNGs safely on every POST. A button here would rebuild with whatever
 *    highlight the last turn happened to use.
 *  - No stat tiles. On the poster the figures ARE the design (see
 *    lib/recap-card.tsx), so tiles above it were in-app chrome explaining an
 *    artifact that already says it. The model has the same numbers from
 *    `get_recap` if anyone asks.
 *
 * Inline in the transcript rather than a modal, for the reasons
 * ChappiConfirmationCard documents: it belongs to the turn that produced it,
 * and the surfaces the assistant lives in sit deliberately below the modal
 * tier. Nothing here is destructive, so it is a plain surface rather than the
 * red permission treatment.
 */
export function ChappiRecapCard({
  releaseId,
  releaseTitle,
  onDismiss,
  onReport,
}: ChappiRecapCardProps) {
  const [recap, setRecap] = useState<ReleaseRecap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [size, setSize] = useState<RecapSize>('story');
  const [isSharing, setIsSharing] = useState(false);

  // The card fetches its own signed URLs rather than taking them from the tool
  // result, and that is a rule rather than a convenience: those URLs are
  // short-lived, so carrying them through the tool would put a credential in
  // the model's context AND leave a link in the transcript that expires while
  // it sits there. One read per mount, exactly as the modal did per open.
  const load = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(`/api/releases/${releaseId}/recap`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      if (!response.ok) throw new Error('load failed');
      const payload = (await response.json()) as { recap: ReleaseRecap | null };
      setRecap(payload.recap?.storyImageUrl ? payload.recap : null);
    } catch {
      // Nothing to show is the honest outcome; the copy below says to ask
      // again rather than blaming the reader.
      setRecap(null);
    } finally {
      setIsLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const previewUrl = size === 'story' ? recap?.storyImageUrl : recap?.squareImageUrl;
  const native = isNativePlatform();

  const handleShare = async () => {
    if (!previewUrl) return;
    setIsSharing(true);
    try {
      const outcome = await shareOrDownloadImage({
        url: previewUrl,
        fileName: recapFileName(releaseTitle, size),
        title: `${releaseTitle} recap`,
      });
      if (outcome === 'downloaded') onReport('Saved your recap card.');
      if (outcome === 'opened') {
        onReport('Opened your recap card. Press and hold the image to save it.');
      }
    } catch {
      onReport('Could not save the recap card. Try again.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Release recap
          </p>
          <p className="mt-1 truncate font-display text-base font-semibold text-content-primary">
            {releaseTitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss the recap card"
          className="motion-focus motion-press -mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center text-content-tertiary hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-content-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Getting your card…
        </p>
      ) : !recap ? (
        <p className="mt-3 text-sm text-content-secondary">
          That card is not there any more. Ask me to build it again.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center gap-2" role="group" aria-label="Card size">
            {(['story', 'square'] as RecapSize[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSize(option)}
                aria-pressed={size === option}
                className={`motion-focus motion-press inline-flex h-8 shrink-0 items-center whitespace-nowrap px-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                  size === option
                    ? 'border border-brand bg-brand/10 text-content-primary'
                    : 'border border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                }`}
              >
                {option === 'story' ? 'Story' : 'Square'}
              </button>
            ))}
          </div>

          {previewUrl ? (
            // Plain img, not next/image: these are short-lived signed URLs and
            // the optimizer would cache them past their expiry.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`${releaseTitle} recap card, ${size} size`}
              className="max-h-80 w-auto self-start border border-stroke-default"
            />
          ) : (
            <p className="text-sm text-content-secondary">
              That size is not available. Ask me to build the card again.
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={!previewUrl || isSharing}
            className="motion-focus motion-press inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start whitespace-nowrap border border-brand bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-strong disabled:opacity-60"
          >
            {isSharing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : native ? (
              <Share2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {native ? 'Share' : 'Download'}
          </button>
        </div>
      )}
    </div>
  );
}
