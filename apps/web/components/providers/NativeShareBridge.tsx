'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { parseSharedPayload } from '@urganize/native-bridge';
import { subscribe, whenInShell } from '@/lib/native-bridge';
import { receiveNativeShare } from '@/lib/note-import/native-share';

const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

/**
 * Native-only, mounted app-wide (see AppShell). When someone shares a chat, a
 * voice note, a photo or some text to Urganize from Android's share sheet, the
 * shell hands it over here. It is pulled into the share cache and the person
 * lands on Bring your notes with it loaded, exactly as the installed web app's
 * share target does. If the share cannot be kept, the dialog opens empty so the
 * share is never a dead end.
 *
 * Starts through whenInShell for the same reason NativePushBridge does:
 * subscribing is what tells the shell the page is ready for a share that
 * cold-started the app.
 */
export function NativeShareBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!NOTES_ENABLED) return;
    let remove: (() => void) | null = null;

    const stopWaiting = whenInShell(() => {
      remove = subscribe('shareReceived', (data) => {
        const shared = parseSharedPayload(data);
        if (!shared) return;
        void (async () => {
          const id = await receiveNativeShare(shared);
          router.push(id ? `/dashboard/notes?import=share&share=${encodeURIComponent(id)}` : '/dashboard/notes?import=1');
        })();
      });
    });

    return () => {
      stopWaiting();
      remove?.();
    };
  }, [router]);

  return null;
}
