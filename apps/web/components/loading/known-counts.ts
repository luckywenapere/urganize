'use client';

// Count-aware skeletons (founder call, 2026-07-23): every list skeleton
// renders THIS user's last-known shape — one release gets one placeholder
// card, three teammates get three placeholder rows — instead of a generic
// guess that visibly collapses or grows when real data lands. Counts come
// from localStorage records the data layer already maintains; they hydrate
// in a mount effect (SSR renders the fallback) to avoid a server/client
// HTML mismatch, same pattern as TasksPanel's bucket state.

import { useEffect, useState } from 'react';
import { readPersistedState } from '@/lib/persisted-state';
import { readResumableChatHint } from '@/lib/chappi/conversation-cache';

/**
 * How many messages the UrgAns chat about to resume has, or 0 — so the page
 * skeleton can reserve a transcript instead of the greeting when a reload is
 * going to land back in a chat. Capped, since a skeleton only needs the shape.
 * Always 0 when nothing is cached, which includes chat history being off.
 */
export function useKnownResumableChat(max = 4): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(Math.min(readResumableChatHint(Date.now()), max));
  }, [max]);
  return count;
}

// Written by useReleaseStore on every successful command-center load.
const RELEASE_COUNT_KEY = 'urganize.workspace.release-count';

// The Settings cache-first record (SettingsPageClient) — the members array's
// length is the teammate count.
const TEAMMATES_CACHE_KEY = 'urganize.settings.teammates';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** Last-known roster size. `fallback` renders on SSR/first-ever visits. */
export function useKnownReleaseCount(fallback = 4, max = 12): number {
  const [count, setCount] = useState(fallback);
  useEffect(() => {
    const persisted = readPersistedState<number>(
      RELEASE_COUNT_KEY,
      1,
      (value): value is number => typeof value === 'number' && Number.isFinite(value)
    );
    if (persisted !== null && persisted >= 0) {
      setCount(clamp(persisted, 1, max));
    }
  }, [max]);
  return count;
}

// Written by useNotesStore on every successful load.
const NOTE_COUNT_KEY = 'urganize.notes.note-count';

/** Last-known notebook size. */
export function useKnownNoteCount(fallback = 5, max = 10): number {
  const [count, setCount] = useState(fallback);
  useEffect(() => {
    const persisted = readPersistedState<number>(
      NOTE_COUNT_KEY,
      1,
      (value): value is number => typeof value === 'number' && Number.isFinite(value)
    );
    if (persisted !== null && persisted >= 0) {
      setCount(clamp(persisted || 1, 1, max));
    }
  }, [max]);
  return count;
}

/** Last-known teammates-list size (includes pending invites). */
export function useKnownTeammateCount(fallback = 2, max = 8): number {
  const [count, setCount] = useState(fallback);
  useEffect(() => {
    const persisted = readPersistedState<{ members: unknown[] }>(
      TEAMMATES_CACHE_KEY,
      1,
      (value): value is { members: unknown[] } =>
        typeof value === 'object' &&
        value !== null &&
        Array.isArray((value as { members?: unknown }).members)
    );
    if (persisted && persisted.members.length >= 0) {
      setCount(clamp(persisted.members.length || 1, 1, max));
    }
  }, [max]);
  return count;
}
