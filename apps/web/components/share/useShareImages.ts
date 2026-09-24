'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { isBrowserOnline } from '@/lib/offline/status';
import {
  buildShareCardSearch,
  shareImageFileName,
  type ShareDateMode,
  type ShareFormat,
} from '@/lib/social-share';

export type ShareImageState =
  | { kind: 'loading' }
  | { kind: 'ready'; file: File; url: string }
  | { kind: 'error'; message: string };

type Images = Record<ShareFormat, ShareImageState>;

const LOADING: Images = { post: { kind: 'loading' }, status: { kind: 'loading' } };

/**
 * The two posters for the open sheet, fetched from the share-card route and
 * held as Files.
 *
 * WHY FILES, AND WHY BEFORE THE TAP. A phone browser only opens its share
 * sheet inside the tap that asked for it, so the image has to exist before the
 * person presses Share. Fetching on the tap would spend that tap on a network
 * round trip and iOS Safari would then refuse to share at all. The preview the
 * person is looking at IS the file that gets shared, which is also the honest
 * version: what you see is exactly what goes out.
 *
 * The post renders first and the status after it, deliberately in sequence:
 * the post is the tab that opens, and on a weak connection two downloads in
 * parallel would make the first thing anyone sees the slowest.
 *
 * Results are keyed by what they were made from, so answers edited in the
 * sheet read as loading straight away instead of showing the old poster, and
 * nothing is set synchronously inside the effect (only in its async steps),
 * which keeps this off the set-state-in-effect warning.
 */
export function useShareImages(input: {
  enabled: boolean;
  releaseId: string;
  title: string;
  dateMode: ShareDateMode;
  extraLine: string;
  todayYmd: string;
}): { images: Images; retry: () => void } {
  const { enabled, releaseId, title, dateMode, extraLine, todayYmd } = input;
  const [attempt, setAttempt] = useState(0);
  const key = `${releaseId}|${dateMode}|${extraLine}|${todayYmd}|${attempt}`;
  const [results, setResults] = useState<{ key: string; images: Partial<Images> } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const created: string[] = [];

    const settle = (format: ShareFormat, state: ShareImageState) => {
      if (controller.signal.aborted) return;
      setResults((previous) => ({
        key,
        images: { ...(previous?.key === key ? previous.images : {}), [format]: state },
      }));
    };

    const run = async () => {
      let token = '';
      try {
        token = await getAccessToken();
      } catch {
        // Fall through: the route answers 401 and the error below says so.
      }
      for (const format of ['post', 'status'] as const) {
        if (controller.signal.aborted) return;
        try {
          const search = buildShareCardSearch({ format, dateMode, extraLine, todayYmd });
          const response = await fetch(`/api/releases/${releaseId}/share-card?${search}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(payload.error || 'Could not make the image. Try again.');
          }
          const blob = await response.blob();
          const file = new File([blob], shareImageFileName(title, format), { type: 'image/png' });
          const url = URL.createObjectURL(file);
          created.push(url);
          settle(format, { kind: 'ready', file, url });
        } catch (error) {
          if (controller.signal.aborted) return;
          settle(format, {
            kind: 'error',
            message: !isBrowserOnline()
              ? "You're offline. Connect again to make your images."
              : error instanceof Error && error.message
                ? error.message
                : 'Could not make the image. Try again.',
          });
        }
      }
    };

    void run();
    return () => {
      controller.abort();
      // Safe to revoke here: a new key already reads as loading, so no <img>
      // is left pointing at a URL this just released.
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [enabled, key, releaseId, title, dateMode, extraLine, todayYmd]);

  const images: Images =
    results && results.key === key ? { ...LOADING, ...results.images } : LOADING;

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { images, retry };
}
