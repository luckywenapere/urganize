'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { getAccessToken } from './get-access-token';
import { calendarFontVariables } from './calendar-fonts';
import {
  CONTENT_POST_FORMAT_OPTIONS,
  CONTENT_POST_PILLAR_OPTIONS,
  CONTENT_POST_STATUS_OPTIONS,
  type ContentPost,
  type ContentPostFormat,
  type ContentPostPillar,
  type ContentPostStatus,
} from '@/types/content-calendar';
import { getStatusLabel } from './StatusMark';

/**
 * Create/edit modal for a single post (URG-157, Phase A). Same
 * portal + backdrop + Escape + body-scroll-lock pattern as CreateReleaseModal,
 * styled inside the brand island (var(--cc-*) only, no raw colors here,
 * including for the error/destructive states: severity is conveyed by icon +
 * wording ("quiet destructive"), not a new hue, since the island's palette
 * has no red to spend without breaking the "only cc-vars" rule).
 *
 * Delete is a quiet text button, edit mode only, one window.confirm step,
 * matching the spec's "quiet destructive" wording. (The "Also post on other
 * calendars — Coming soon" placeholder row was removed 2026-08-10: a
 * permanently disabled control that also implied the product posts for you.
 * Phase B sharing gets a real control when it ships.)
 */

const MAX_TITLE_LENGTH = 120;
const MAX_CAPTION_LENGTH = 2000;

function getFormatLabel(format: ContentPostFormat): string {
  switch (format) {
    case 'video':
      return 'Video';
    case 'image':
      return 'Image';
    case 'carousel':
      return 'Carousel';
    case 'text':
      return 'Text';
    default:
      return 'Other';
  }
}

function getPillarLabel(pillar: ContentPostPillar): string {
  switch (pillar) {
    case 'behind_the_scenes':
      return 'Behind the scenes';
    case 'performance':
      return 'Performance';
    case 'promo':
      return 'Promo';
    case 'fan_engagement':
      return 'Fan engagement';
    case 'announcement':
      return 'Announcement';
    default:
      return 'Other';
  }
}

type PostModalProps = {
  open: boolean;
  releaseId: string;
  calendarId: string;
  /** Pre-filled date for create mode (the tapped/clicked day). Ignored in edit mode. */
  initialDate: string | null;
  /** Non-null puts the modal in edit mode. */
  post: ContentPost | null;
  onClose: () => void;
  onSaved: (post: ContentPost, mode: 'created' | 'updated') => void;
  onDeleted: (postId: string) => void;
  /** Out-of-band notices that must outlive the modal (it closes on save). */
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

export function PostModal({ open, releaseId, calendarId, initialDate, post, onClose, onSaved, onDeleted, onToast }: PostModalProps) {
  const isEditMode = Boolean(post);

  const [scheduledDate, setScheduledDate] = useState('');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [format, setFormat] = useState<ContentPostFormat>('video');
  const [pillar, setPillar] = useState<ContentPostPillar | ''>('');
  const [status, setStatus] = useState<ContentPostStatus>('draft');
  const [postedUrl, setPostedUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Pre-fill whenever the modal opens, for both create and edit; mirrors
  // The house "reset on open" convention for modals.
  useEffect(() => {
    if (!open) return;
    setError('');
    if (post) {
      setScheduledDate(post.scheduledDate);
      setTitle(post.title);
      setCaption(post.caption);
      setFormat(post.format);
      setPillar(post.pillar ?? '');
      setStatus(post.status);
      setPostedUrl(post.postedUrl ?? '');
    } else {
      setScheduledDate(initialDate ?? '');
      setTitle('');
      setCaption('');
      setFormat('video');
      setPillar('');
      setStatus('draft');
      setPostedUrl('');
    }
  }, [open, post, initialDate]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving && !isDeleting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDeleting, isSaving, onClose, open]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // Minimal dialog focus contract (2026-08-10): focus lands on the title
  // input when the modal opens (the date is usually pre-filled by the tapped
  // day) and returns to the opener on close. Not a full trap — the backdrop
  // button is tabIndex={-1} so Tab can't land outside the dialog's visible
  // controls by accident.
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleInputRef.current?.focus();
    return () => {
      opener?.focus();
    };
  }, [open]);

  const isBusy = isSaving || isDeleting;
  const canSubmit = useMemo(
    () => scheduledDate.length > 0 && title.trim().length > 0 && !isBusy,
    [scheduledDate, title, isBusy]
  );

  if (!open || !isMounted) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSaving(true);
    setError('');

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');

      if (isEditMode && post) {
        const res = await fetch(`/api/releases/${releaseId}/content-posts/${post.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduledDate,
            title: title.trim(),
            caption,
            format,
            status,
            pillar: pillar || null,
            postedUrl: status === 'posted' ? postedUrl.trim() || null : post.postedUrl ?? null,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { post?: ContentPost; error?: string };
        if (!res.ok || !data.post) throw new Error(data.error || 'Could not save post.');
        onSaved(data.post, 'updated');
        return;
      }

      const res = await fetch(`/api/releases/${releaseId}/content-posts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarId,
          scheduledDate,
          title: title.trim(),
          caption,
          format,
          status,
          pillar: pillar || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { post?: ContentPost; error?: string };
      if (!res.ok || !data.post) throw new Error(data.error || 'Could not create post.');

      let created = data.post;
      // The create route has no postedUrl field (a post can't already be
      // "posted with proof" at the moment it's created in the normal flow).
      // If the user picked status=posted AND typed a link in this same
      // create step, follow up with a PATCH so their input isn't silently
      // dropped, honoring the visible-state principle over a smaller diff.
      let linkDropped = false;
      if (status === 'posted' && postedUrl.trim()) {
        const patchRes = await fetch(`/api/releases/${releaseId}/content-posts/${created.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ postedUrl: postedUrl.trim() }),
        });
        const patchData = (await patchRes.json().catch(() => ({}))) as { post?: ContentPost };
        if (patchRes.ok && patchData.post) {
          created = patchData.post;
        } else {
          linkDropped = true;
        }
      }
      onSaved(created, 'created');
      if (linkDropped) {
        // The post itself saved, but the link PATCH failed — saying nothing
        // would be a silent data drop. AFTER onSaved, so this warning wins
        // over its "Post saved" toast in the single toast slot.
        onToast?.('Post saved, but the link didn’t stick — open the post and add it again.', 'warning');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save post.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    if (!window.confirm('Delete this post?')) return;
    setIsDeleting(true);
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const res = await fetch(`/api/releases/${releaseId}/content-posts/${post.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Could not delete post.');
      }
      onDeleted(post.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete post.');
      setIsDeleting(false);
    }
  };

  const modal = (
    // `cc-island` + calendarFontVariables on the portal root (2026-08-04,
    // the second fixed here). This component portals to document.body, and
    // both CSS custom properties AND next/font's `.variable` class only take
    // effect where they're literally applied in the DOM tree — not the React
    // tree — so every var(--cc-*) AND var(--font-cc-*) read resolved to
    // nothing once portaled outside the calendar scene's wrapper. cc-island
    // declares its own --cc-* values directly, so adding the class here is
    // self-sufficient. The font variables aren't declared anywhere — they're
    // produced by the next/font/google calls in calendar-fonts.ts — but that
    // module is a singleton (one font load, shared), so applying its exported
    // className here doesn't load the fonts twice; it just marks this DOM
    // subtree as one more place the same already-loaded faces apply.
    <div
      className={`cc-island fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8 ${calendarFontVariables}`}
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close post modal"
        tabIndex={-1}
        className="absolute inset-0"
        onClick={() => {
          if (!isBusy) onClose();
        }}
      />

      <div role="dialog" aria-modal="true" aria-labelledby="post-modal-title" className="relative mx-auto w-full max-w-lg">
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden border border-[var(--cc-border)] bg-[var(--cc-ground)] text-[var(--cc-text)] shadow-2xl sm:max-h-[calc(100dvh-4rem)]"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--cc-border)] p-4 sm:p-5">
            <h2
              id="post-modal-title"
              className="font-[family-name:var(--font-cc-display)] text-xl font-medium text-[var(--cc-text)]"
            >
              {isEditMode ? 'Edit post' : 'New post'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              aria-label="Close modal"
              className="-m-2 flex h-9 w-9 shrink-0 items-center justify-center text-[var(--cc-text-muted)] hover:text-[var(--cc-text)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--cc-text-muted)]">
                Date
              </span>
              <input
                type="date"
                required
                value={scheduledDate}
                onChange={(event) => setScheduledDate(event.target.value)}
                disabled={isBusy}
                className="h-10 w-full border border-[var(--cc-border)] bg-transparent px-3 text-sm text-[var(--cc-text)] focus:border-[var(--cc-accent)] disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--cc-text-muted)]">
                Title
              </span>
              <input
                ref={titleInputRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={MAX_TITLE_LENGTH}
                disabled={isBusy}
                placeholder="Teaser clip"
                className="h-10 w-full border border-[var(--cc-border)] bg-transparent px-3 text-sm text-[var(--cc-text)] placeholder:text-[var(--cc-text-faint)] focus:border-[var(--cc-accent)] disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--cc-text-muted)]">
                Caption
              </span>
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                maxLength={MAX_CAPTION_LENGTH}
                disabled={isBusy}
                rows={4}
                placeholder="Optional caption"
                className="min-h-24 w-full resize-none border border-[var(--cc-border)] bg-transparent px-3 py-2 text-sm text-[var(--cc-text)] placeholder:text-[var(--cc-text-faint)] focus:border-[var(--cc-accent)] disabled:opacity-60"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--cc-text-muted)]">
                  Format
                </span>
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value as ContentPostFormat)}
                  disabled={isBusy}
                  className="h-10 w-full border border-[var(--cc-border)] bg-[var(--cc-ground)] px-2 text-sm text-[var(--cc-text)] focus:border-[var(--cc-accent)] disabled:opacity-60"
                >
                  {CONTENT_POST_FORMAT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {getFormatLabel(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--cc-text-muted)]">
                  Pillar
                </span>
                <select
                  value={pillar}
                  onChange={(event) => setPillar(event.target.value as ContentPostPillar | '')}
                  disabled={isBusy}
                  className="h-10 w-full border border-[var(--cc-border)] bg-[var(--cc-ground)] px-2 text-sm text-[var(--cc-text)] focus:border-[var(--cc-accent)] disabled:opacity-60"
                >
                  <option value="">None</option>
                  {CONTENT_POST_PILLAR_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {getPillarLabel(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--cc-text-muted)]">
                  Status
                </span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ContentPostStatus)}
                  disabled={isBusy}
                  className="h-10 w-full border border-[var(--cc-border)] bg-[var(--cc-ground)] px-2 text-sm text-[var(--cc-text)] focus:border-[var(--cc-accent)] disabled:opacity-60"
                >
                  {CONTENT_POST_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {getStatusLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {status === 'posted' ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--cc-text-muted)]">
                  Link to post <span className="text-[var(--cc-text-faint)]">(optional)</span>
                </span>
                <input
                  type="url"
                  value={postedUrl}
                  onChange={(event) => setPostedUrl(event.target.value)}
                  disabled={isBusy}
                  placeholder="https://..."
                  className="h-10 w-full border border-[var(--cc-border)] bg-transparent px-3 text-sm text-[var(--cc-text)] placeholder:text-[var(--cc-text-faint)] focus:border-[var(--cc-accent)] disabled:opacity-60"
                />
              </label>
            ) : null}
          </div>

          {error ? (
            <div className="mx-4 mb-4 flex shrink-0 items-start gap-2 border border-[var(--cc-border)] bg-[var(--cc-text)]/5 p-3 text-sm text-[var(--cc-text)] sm:mx-5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cc-text-muted)]" />
              <p>{error}</p>
            </div>
          ) : null}

          {/* pb includes the safe-area inset: layout.tsx sets viewportFit
              'cover', so on a notched phone 100dvh includes the home-indicator
              strip and the Save/Cancel/Delete row could land inside it. */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--cc-border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:p-5 sm:pb-5">
            {isEditMode ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isBusy}
                className="text-sm font-medium text-[var(--cc-text-muted)] underline-offset-2 hover:text-[var(--cc-text)] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? 'Deleting…' : 'Delete post'}
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isBusy}
                className="h-10 border border-[var(--cc-border)] px-4 text-sm font-medium text-[var(--cc-text)] hover:bg-[var(--cc-text)]/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex h-10 items-center gap-2 bg-[var(--cc-accent)] px-4 text-sm font-semibold text-[var(--cc-ground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
