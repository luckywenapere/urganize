'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChappiAttachment } from '@/lib/chappi/types';
import { MAX_ATTACHMENTS_PER_MESSAGE, attachmentFitReason } from '@/lib/urgans-attachments';
import { AttachmentError, readAttachment } from '@/lib/urgans-attachments-client';

/**
 * What the person has attached to the message they are writing.
 *
 * Files are read one after another rather than together: each one is checked
 * against what is already there, so the "too big together" answer does not
 * depend on which file finished first. A file that cannot be attached is
 * reported and skipped; the rest still go on.
 */
export function useAttachments() {
  const [attachments, setAttachments] = useState<ChappiAttachment[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Mirrors the state so a second pick made while the first is still being read
  // checks against the real list, not the one from the last render.
  const listRef = useRef<ChappiAttachment[]>([]);

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    const room = Math.max(0, MAX_ATTACHMENTS_PER_MESSAGE - listRef.current.length);
    const wanted = files.slice(0, room);
    let problem: string | null =
      files.length > wanted.length
        ? `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} things to one message.`
        : null;

    setPending((count) => count + wanted.length);
    for (const file of wanted) {
      try {
        const attachment = await readAttachment(file);
        const reason = attachmentFitReason(listRef.current, attachment);
        if (reason) {
          problem = problem ?? reason;
        } else {
          listRef.current = [...listRef.current, attachment];
          setAttachments(listRef.current);
        }
      } catch (caught) {
        problem =
          problem ??
          (caught instanceof AttachmentError ? caught.message : 'That could not be attached. Try another.');
      } finally {
        setPending((count) => Math.max(0, count - 1));
      }
    }
    if (problem) setError(problem);
  }, []);

  const remove = useCallback((id: string) => {
    listRef.current = listRef.current.filter((a) => a.id !== id);
    setAttachments(listRef.current);
    setError(null);
  }, []);

  const clear = useCallback(() => {
    listRef.current = [];
    setAttachments([]);
    setError(null);
  }, []);

  return { attachments, pending, error, addFiles, remove, clear, dismissError: () => setError(null) };
}
