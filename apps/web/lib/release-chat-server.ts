// Who can see a rollout's chat, and the emails and pushes a tag sends.
//
// The rules (who a message reaches) are pure, in lib/chat-mentions.ts. This
// file only reads the people and sends. Everything here NEVER THROWS: by the
// time it runs the message is saved, and a failed email must never turn a sent
// message into an error.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, isEmailConfigured } from '@/lib/email';
import { APP_URL } from '@/lib/email/links';
import { sendPushToUsers } from '@/lib/push-server';
import { loadProfilesByIds } from '@/lib/tasks-server';
import {
  buildChatMentionPush,
  chatEmailExcerpt,
  chatEmailRecipients,
  releaseChatPath,
  type ChatPerson,
} from '@/lib/chat-mentions';

export type ReleaseChatPerson = ChatPerson & { email: string | null };

type ReleaseRef = {
  ownerUserId: string;
  /** '' when the rollout has no artist; then artist-scoped members cannot see it. */
  artistId: string;
};

const normaliseEmail = (value: unknown): string => String(value || '').trim().toLowerCase();

/** The name a person is tagged by: their profile name, else the part of their
 *  email before the @ (an email itself cannot follow an @). Empty means they
 *  cannot be tagged. */
export function chatNameFor(profile: { name?: string | null; email?: string | null } | undefined): string {
  const name = String(profile?.name || '').trim().replace(/\s+/g, ' ');
  if (name) return name;
  const email = normaliseEmail(profile?.email);
  return email ? email.split('@')[0] : '';
}

/**
 * Everyone who can see this rollout: its owner, and every active member of
 * the owner's team who is not limited to a different artist. This is the same
 * set decideReleaseAccess admits (guests included: they can read the chat), so
 * nobody is tagged who could not open what the email links to.
 */
export async function loadReleaseChatPeople(
  admin: SupabaseClient,
  release: ReleaseRef
): Promise<ReleaseChatPerson[]> {
  const ids = new Set<string>();
  if (release.ownerUserId) ids.add(release.ownerUserId);

  try {
    const workspace = await admin
      .from('workspaces')
      .select('id')
      .eq('owner_id', release.ownerUserId)
      .maybeSingle();
    const workspaceId = (workspace.data as { id?: string } | null)?.id;
    if (workspaceId) {
      const members = await admin
        .from('workspace_members')
        .select('user_id,artist_scope_id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active');
      for (const row of (members.data || []) as Array<{ user_id: string | null; artist_scope_id: string | null }>) {
        if (!row.user_id) continue;
        if (row.artist_scope_id && row.artist_scope_id !== release.artistId) continue;
        ids.add(row.user_id);
      }
    }
  } catch (error) {
    console.error('[release-chat] could not read the team', error instanceof Error ? error.message : error);
  }

  const profiles = await loadProfilesByIds(admin, Array.from(ids));
  const people: ReleaseChatPerson[] = [];
  for (const id of ids) {
    const profile = profiles.get(id);
    const name = chatNameFor(profile);
    if (!name) continue;
    people.push({ userId: id, name, email: normaliseEmail(profile?.email) || null });
  }
  return people.sort((a, b) => a.name.localeCompare(b.name));
}

/** The picker's list: names only. Emails stay on the server. */
export function toChatPeoplePayload(people: ReleaseChatPerson[]): ChatPerson[] {
  return people.map(({ userId, name }) => ({ userId, name }));
}

/**
 * Emails and pushes the people a new message tags. A plain message sends
 * nothing. Returns how many emails were attempted, for the log.
 */
export async function notifyReleaseChatMessage(
  admin: SupabaseClient,
  input: {
    release: ReleaseRef & { id: string; title: string };
    messageId: string;
    authorId: string;
    content: string;
  }
): Promise<{ recipients: number }> {
  try {
    const people = await loadReleaseChatPeople(admin, input.release);
    const { userIds, everyone } = chatEmailRecipients({
      content: input.content,
      people,
      authorId: input.authorId,
    });
    if (!userIds.length) return { recipients: 0 };

    const authorProfile = (await loadProfilesByIds(admin, [input.authorId])).get(input.authorId);
    const authorLabel =
      String(authorProfile?.name || '').trim() || normaliseEmail(authorProfile?.email) || 'Your teammate';

    const push = buildChatMentionPush({
      authorName: authorLabel,
      releaseTitle: input.release.title,
      everyone,
      content: input.content,
      releaseId: input.release.id,
      messageId: input.messageId,
    });

    const byId = new Map(people.map((person) => [person.userId, person]));
    const message = chatEmailExcerpt(input.content);
    const chatUrl = `${APP_URL}${releaseChatPath(input.release.id)}`;

    const sendOne = async (userId: string) => {
      const person = byId.get(userId);
      if (!person?.email) return;
      try {
        await sendEmail(admin, {
          templateId: 'chat_mention',
          to: person.email,
          props: {
            recipientName: person.name,
            authorLabel,
            releaseTitle: input.release.title,
            everyone,
            message,
            chatUrl,
          },
          trigger: everyone ? 'release_chat_everyone' : 'release_chat_mention',
          recipientUserId: userId,
          actorUserId: input.authorId,
          fromLabel: `${authorLabel} via Urganize`,
          // One email per person per message, even if this runs twice.
          idempotencyKey: `chat-${input.messageId}-${userId}`,
        });
      } catch (error) {
        console.error('[release-chat] email failed', error instanceof Error ? error.message : error);
      }
    };

    const pushSend = sendPushToUsers(admin, userIds, push).catch((error) => {
      console.error('[release-chat] push failed', error instanceof Error ? error.message : error);
    });

    if (isEmailConfigured()) {
      // A few at a time: a rollout team is small, and Resend dislikes bursts.
      for (let i = 0; i < userIds.length; i += 4) {
        await Promise.all(userIds.slice(i, i + 4).map(sendOne));
      }
    }
    await pushSend;
    return { recipients: userIds.length };
  } catch (error) {
    console.error('[release-chat] notify failed', error instanceof Error ? error.message : error);
    return { recipients: 0 };
  }
}
