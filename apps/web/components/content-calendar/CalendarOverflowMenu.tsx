'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MoreHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { ContentCalendar } from '@/types/content-calendar';

/**
 * Rename + delete for the active calendar, in a small overflow menu on the
 * calendar page header (URG-157, Phase A, Delete placement decision D7:
 * calendar destructive actions live here, not on entry-section rows).
 *
 * Delete states the post count being deleted via window.confirm, matching
 * the same one-confirm-step pattern PostModal uses for post delete.
 */

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

type CalendarOverflowMenuProps = {
  releaseId: string;
  calendar: ContentCalendar;
  onRenamed: (calendar: ContentCalendar) => void;
  onDeleted: (calendarId: string) => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

export function CalendarOverflowMenu({ releaseId, calendar, onRenamed, onDeleted, onToast }: CalendarOverflowMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'rename'>('menu');
  const [name, setName] = useState(calendar.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const close = () => {
    setIsOpen(false);
    setMode('menu');
    setName(calendar.name);
  };

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close() is stable in intent (recreated each render but only reads calendar.name/setters); re-subscribing every render would be wasteful for a plain click-outside listener.
  }, [isOpen]);

  const handleRename = async () => {
    const trimmed = name.trim();
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const res = await fetch(`/api/releases/${releaseId}/content-calendars/${calendar.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { calendar?: ContentCalendar; error?: string };
      if (!res.ok || !data.calendar) throw new Error(data.error || 'Could not rename calendar.');
      onRenamed(data.calendar);
      onToast('Calendar renamed', 'success');
      close();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not rename calendar.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const postWord = calendar.postCount === 1 ? 'post' : 'posts';
    if (!window.confirm(`Delete this calendar and its ${calendar.postCount} ${postWord}?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const res = await fetch(`/api/releases/${releaseId}/content-calendars/${calendar.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Could not delete calendar.');
      }
      onDeleted(calendar.id);
      onToast('Calendar deleted', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not delete calendar.', 'error');
    } finally {
      setIsDeleting(false);
      close();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-label="Calendar options"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex h-9 w-9 items-center justify-center border border-[var(--cc-border)] text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1.5 w-56 border border-[var(--cc-border)] bg-[var(--cc-ground)] p-1 text-sm shadow-lg"
        >
          {mode === 'menu' ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  // Re-seed from the current prop on every open, not just at
                  // mount: after a successful rename, close() reverts to
                  // 'menu' before the parent's new `calendar` prop lands
                  // (React batches the state update), so `name` would
                  // otherwise still hold the pre-rename value the next time
                  // this form opens.
                  setName(calendar.name);
                  setMode('rename');
                }}
                className="block w-full px-3 py-2 text-left text-[var(--cc-text)] hover:bg-[var(--cc-text)]/5"
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                className="block w-full px-3 py-2 text-left text-[var(--cc-text-muted)] hover:bg-[var(--cc-text)]/5 hover:text-[var(--cc-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? 'Deleting…' : 'Delete calendar'}
              </button>
            </>
          ) : (
            <div className="p-2">
              <label className="block">
                <span className="sr-only">Calendar name</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  disabled={isSaving}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleRename();
                    }
                  }}
                  className="h-9 w-full border border-[var(--cc-border)] bg-transparent px-2 text-sm text-[var(--cc-text)] focus:border-[var(--cc-accent)]"
                />
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={isSaving}
                  className="px-2 py-1 text-xs text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleRename()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 bg-[var(--cc-accent)] px-2.5 py-1 text-xs font-semibold text-[var(--cc-ground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
