'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { chatEmailRecipients, splitMessageForDisplay, type ChatPerson } from '@/lib/chat-mentions';
import { supabase } from '@/lib/supabase/client';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import { ThreadMessageList } from '@/components/threads/ThreadMessageList';
import { ThreadComposer } from '@/components/threads/ThreadComposer';
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

  return (
    // flex-1 + mt-auto on the composer: the message bar rests at the bottom
    // even when the thread is short or empty (founder report, 2026-10-07).
    <div className="mt-8 flex flex-1 flex-col">
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
      <div className="mt-auto">
        <ThreadComposer
          onSend={handleSend}
          placeholder="Message the team. Type @ to tag someone, or @everyone to email the team."
          mentionPeople={people}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}
