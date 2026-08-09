'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** URL param naming the open note. */
const NOTE_PARAM = 'note';

export type NoteSelection = {
  selectedNoteId: string | null;
  /**
   * Opens a note, or closes the editor when passed null.
   *
   * `push` exists for the mobile drill-down: below lg the editor REPLACES the
   * list, so the browser back button has to return to the list rather than
   * leaving the app — the same reason useReleaseScope takes this option. On
   * desktop both panes are visible at once, so selection is a filter-like
   * cycle and replaces instead of growing history.
   */
  selectNote: (noteId: string | null, options?: { push?: boolean }) => void;
};

export function useNoteSelection(): NoteSelection {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(NOTE_PARAM);
  const selectedNoteId = raw && raw.length > 0 ? raw : null;

  const selectNote = useCallback(
    (noteId: string | null, options?: { push?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (noteId) {
        params.set(NOTE_PARAM, noteId);
      } else {
        params.delete(NOTE_PARAM);
      }
      const query = params.toString();
      const url = `${pathname ?? ''}${query ? `?${query}` : ''}`;
      if (options?.push) {
        router.push(url, { scroll: false });
      } else {
        router.replace(url, { scroll: false });
      }
    },
    [pathname, router, searchParams]
  );

  return { selectedNoteId, selectNote };
}
