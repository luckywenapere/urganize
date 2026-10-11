'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { chatEmailRecipients, splitMessageForDisplay, type ChatPerson } from '@/lib/chat-mentions';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useKeyboardViewport } from '@/lib/keyboard-viewport';
import { isReleaseChatKeyboardMode, releaseChatLayout } from '@/lib/release-chat-layout';
import { supabase } from '@/lib/supabase/client';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import { ThreadMessageList } from '@/components/threads/ThreadMessageList';
import { ThreadComposer } from '@/components/threads/ThreadComposer';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { usePinnedChatHeight } from './usePinnedChatHeight';
import { useSceneData } from './useSceneData';
import type { ReleaseMessage } from '@/types/release-message';
import type { ThreadMessage } from '@/types/thread';

type ReleaseChatSectionProps = {
  releaseId: string;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

/**
 * The rollout's own chat thread — every message every release-team member
 * posts, in order. Visible to anyone with release access (unlike a task
 * thread, which is narrower — see the Chat section inside a task's own
 * pop-up). Follows the Song scene's cache-first-then-mutate pattern rather
 * than the debounced-autosave Notes pattern: a thread is an append-only
 * feed of short entries, closer to notifications than to a document.
 */
export function ReleaseChatSection({ releaseId, onToast }: ReleaseChatSectionProps) {
  const { data, isLoading, error: loadError, reload } = useSceneData(releaseId, 'chat');
  const setScene = useSceneDataStore((state) => state.setScene);
  const rawMessages = useMemo(() => data?.messages ?? [], [data]);
  const people = useMemo<ChatPerson[]>(() => data?.people ?? [], [data]);
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);

  const messages = useMemo<ThreadMessage[]>(
    () =>
      rawMessages.map((message: ReleaseMessage) => ({
        id: message.id,
        userId: message.userId,
        content: message.content,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        authorName: message.authorName,
        authorEmail: message.authorEmail,
        authorInitials: message.authorInitials,
        isOwnMessage: message.isOwnMessage,
      })),
    [rawMessages]
  );

  const request = async (input: string, init: RequestInit) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Your session expired. Sign in again and retry.');
    }

    const response = await fetch(input, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      messages?: ReleaseMessage[];
    };
    if (!response.ok) {
      throw new Error(payload.error || 'Something went wrong.');
    }
    // A write answers with messages only; keep the people list we already have.
    const current = useSceneDataStore.getState().getScene(releaseId, 'chat');
    setScene(releaseId, 'chat', { messages: payload.messages || [], people: current?.people ?? people });
  };

  const handleSend = async (content: string) => {
    await request(`/api/releases/${releaseId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    // The server decides from the same text with the same rule, so this says
    // who it is emailing without asking it.
    const { userIds, everyone } = chatEmailRecipients({
      content,
      people,
      authorId: currentUserId ?? '',
    });
    if (everyone && userIds.length) {
      onToast(`Sent. Emailing everyone on this rollout (${userIds.length}).`, 'success');
    } else if (userIds.length) {
      const names = userIds
        .map((id) => people.find((person) => person.userId === id)?.name)
        .filter(Boolean) as string[];
      const named = names.length <= 2 ? names.join(' and ') : `${names[0]} and ${names.length - 1} others`;
      onToast(`Sent. Emailing ${named}.`, 'success');
    }
  };

  const renderContent = (content: string) =>
    splitMessageForDisplay(content, people).map((part, index) =>
      part.mention ? (
        <span key={index} className="font-semibold text-brand">
          {part.text}
        </span>
      ) : (
        <span key={index}>{part.text}</span>
      )
    );

  const handleEdit = async (messageId: string, content: string) => {
    await request(`/api/releases/${releaseId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  };

  const handleDelete = async (messageId: string) => {
    await request(`/api/releases/${releaseId}/messages/${messageId}`, { method: 'DELETE' });
    onToast('Message deleted.', 'success');
  };

  // A messenger layout (2026-10-11, founder fix): the box ends just above the
  // bottom tab bar (or the desktop column's edge), the message list is the
  // only thing that scrolls, and the composer is pinned under it. Before this
  // the composer sat in the page flow, under the bar and the floating Rollout
  // menu pill (which is hidden on this scene now), with its Send button cut
  // off. See usePinnedChatHeight for the measuring.
  //
  // With a phone's keyboard up (v1.115.6 fix for iOS Safari) the box pins
  // itself to the visible region instead, read from visualViewport, so the
  // composer sits right above the keyboard and the messages fill the space
  // above it. Before, the box stayed in the page: iOS scrolled the page to
  // reveal the field, the box then shrank by the keyboard's height under that
  // scroll, and the person saw an empty band of background with the composer
  // behind the keyboard. See lib/release-chat-layout.ts.
  const isPhone = !useIsDesktopViewport();
  const keyboard = useKeyboardViewport();
  const keyboardMode = isReleaseChatKeyboardMode({
    isPhone,
    keyboardOpen: keyboard.open,
    viewportHeightPx: keyboard.viewportHeightPx,
  });
  const slotRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const height = usePinnedChatHeight(slotRef, keyboardMode);
  const layout = releaseChatLayout({
    isPhone,
    keyboardOpen: keyboard.open,
    offsetTopPx: keyboard.offsetTopPx,
    viewportHeightPx: keyboard.viewportHeightPx,
    flowHeightPx: height,
  });

  // On a phone the page behind a chat never scrolls (the message list does),
  // so a swipe or the keyboard opening cannot carry the page off screen. If
  // iOS scrolls it anyway to reveal the field, it goes back when the keyboard
  // closes. A computer's page is left alone.
  const lockedScrollY = useRef(0);
  useEffect(() => {
    if (!isPhone) return;
    lockedScrollY.current = window.scrollY;
    return lockBodyScroll();
  }, [isPhone]);
  const wasKeyboardMode = useRef(false);
  useEffect(() => {
    if (wasKeyboardMode.current && !keyboardMode && isPhone) {
      if (Math.abs(window.scrollY - lockedScrollY.current) > 1) {
        window.scrollTo({ top: lockedScrollY.current });
      }
    }
    wasKeyboardMode.current = keyboardMode;
  }, [keyboardMode, isPhone]);

  // Newest message in view: on arrival, on every new message, and when the
  // box changes size (the keyboard opening or closing) so the last line is
  // not hidden.
  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastMessageId, isLoading, height, keyboardMode, keyboard.viewportHeightPx]);

  return (
    <div ref={slotRef} className="mt-6 min-h-[260px]" style={layout.slot}>
      <div
        className={`flex min-h-0 flex-col ${
          layout.mode === 'keyboard' ? 'bg-bg-base px-4 pb-2 pt-2 sm:px-5' : ''
        }`}
        style={layout.box}
        data-chat-layout={layout.mode}
      >
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
          role="log"
          aria-label="Rollout chat"
          aria-live="polite"
        >
          <ThreadMessageList
            messages={messages}
            isLoading={isLoading}
            loadError={loadError}
            onRetry={() => void reload()}
            onEdit={handleEdit}
            onDelete={handleDelete}
            emptyTitle="No messages yet."
            emptyBody="Start the conversation. Anyone with access to this rollout can see it here."
            renderContent={renderContent}
          />
        </div>
        <div className="shrink-0 bg-bg-base">
          <ThreadComposer
            onSend={handleSend}
            placeholder="Message the team. Type @ to tag someone, or @everyone to email the team."
            mentionPeople={people}
            currentUserId={currentUserId}
          />
        </div>
      </div>
    </div>
  );
}
