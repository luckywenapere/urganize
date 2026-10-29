// SERVER ONLY. Rollout ideas (2026-10-26): reading the notes and the people on
// a rollout, and the pushes and emails a note, an ask and a finished plan send.
// The rules are pure, in lib/rollout-ideas.ts.
//
// Every notify function here NEVER THROWS: by the time it runs the note is
// saved (or the plan built), and a failed push or email must never turn that
// into an error. Callers run them in next/server's after().

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, isEmailConfigured } from '@/lib/email';
import { APP_URL } from '@/lib/email/links';
import { sendPushToUsers } from '@/lib/push-server';
import { loadProfilesByIds } from '@/lib/tasks-server';
import { getInitials } from '@/lib/tasks';
import { chatEmailExcerpt } from '@/lib/chat-mentions';
import { loadReleaseChatPeople, type ReleaseChatPerson } from '@/lib/release-chat-server';
import type { IdeaNote, IdeasPerson } from '@/lib/rollout-ideas';
import {
  chimeInAskLine,
  chimedInLine,
  ideaNoteRecipients,
  isRolloutArtist,
  planReadyLine,
  rolloutIdeasPath,
} from '@/lib/rollout-ideas';

/** Notes live in the existing release_messages table. No new table. */
export const IDEAS_TABLE = 'release_messages';

export type IdeasRelease = {
  id: string;
  title: string;
  ownerUserId: string;
  /** '' when the rollout has no artist. */
  artistId: string;
  artistName: string;
};

const normaliseEmail = (value: unknown): string => String(value || '').trim().toLowerCase();

function displayName(profile: { name?: string | null; email?: string | null } | undefined, fallback: string): string {
  return String(profile?.name || '').trim() || normaliseEmail(profile?.email) || fallback;
}

/** Every note on a rollout, oldest first, with its author's name. */
export async function loadIdeaNotes(
  admin: SupabaseClient,
  releaseId: string,
  currentUserId: string
): Promise<Array<IdeaNote & { audioPath: string | null }>> {
  const result = await admin
    .from(IDEAS_TABLE)
    .select('id,user_id,content,created_at,audio_path,audio_seconds')
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (result.error) throw result.error;

  const rows = (result.data || []) as Array<{
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    audio_path?: string | null;
    audio_seconds?: number | null;
  }>;
  const profiles = await loadProfilesByIds(
    admin,
    rows.map((row) => row.user_id)
  );
  return rows.map((row) => {
    const authorName = displayName(profiles.get(row.user_id), 'Team member');
    return {
      id: row.id,
      userId: row.user_id,
      authorName,
      authorInitials: getInitials(authorName),
      content: row.content,
      createdAt: row.created_at,
      isOwn: row.user_id === currentUserId,
      // Server only: the routes swap it for a signed audioUrl before answering.
      audioPath: row.audio_path || null,
      audioSeconds: typeof row.audio_seconds === 'number' ? row.audio_seconds : null,
    };
  });
}

/** Everyone who can see the rollout (the chat's own set), with emails, server side only. */
export async function loadIdeasPeople(admin: SupabaseClient, release: IdeasRelease): Promise<ReleaseChatPerson[]> {
  return loadReleaseChatPeople(admin, { ownerUserId: release.ownerUserId, artistId: release.artistId, id: release.id });
}

/** The picker's list: the people besides the viewer, names only, the artist marked. */
export async function toIdeasPeoplePayload(
  admin: SupabaseClient,
  people: ReleaseChatPerson[],
  viewerId: string,
  release: IdeasRelease
): Promise<IdeasPerson[]> {
  const others = people.filter((person) => person.userId !== viewerId);
  if (!others.length) return [];
  const extra = new Map<string, { role: string | null; artist_name: string | null }>();
  try {
    const result = await admin
      .from('profiles')
      .select('id,role,artist_name')
      .in(
        'id',
        others.map((person) => person.userId)
      );
    for (const row of (result.data || []) as Array<{ id: string; role: string | null; artist_name: string | null }>) {
      extra.set(row.id, row);
    }
  } catch {
    // Not knowing who the artist is only means nobody is ticked by default.
  }
  return others.map((person) => {
    const profile = extra.get(person.userId);
    return {
      userId: person.userId,
      name: person.name,
      isArtist: isRolloutArtist(
        { role: profile?.role ?? null, artistName: profile?.artist_name ?? null, name: person.name },
        release.artistName
      ),
    };
  });
}

async function authorLabelFor(admin: SupabaseClient, userId: string): Promise<string> {
  const profile = (await loadProfilesByIds(admin, [userId])).get(userId);
  return displayName(profile, 'Your teammate');
}

/**
 * A note was added: push everyone else who can see the rollout, and email the
 * owner (unless the owner wrote it).
 */
export async function notifyIdeaAdded(
  admin: SupabaseClient,
  input: { release: IdeasRelease; noteId: string; authorId: string; content: string; ownerOnly?: boolean }
): Promise<void> {
  try {
    const people = await loadIdeasPeople(admin, input.release);
    const { pushIds, emailOwner } = ideaNoteRecipients({
      peopleIds: people.map((person) => person.userId),
      ownerId: input.release.ownerUserId,
      authorId: input.authorId,
      ownerOnly: input.ownerOnly,
    });
    if (!pushIds.length) return;
    const author = await authorLabelFor(admin, input.authorId);
    const excerpt = input.content.trim().replace(/\s+/g, ' ');
    const pushSend = sendPushToUsers(admin, pushIds, {
      title: chimedInLine(author, input.release.title),
      body: excerpt.length > 140 ? `${excerpt.slice(0, 139).trimEnd()}…` : excerpt,
      url: rolloutIdeasPath(input.release.id),
      // Per note: two notes minutes apart must stack, not replace each other.
      tag: `rollout-idea-${input.noteId}`,
    }).catch((error) => {
      console.error('[rollout-ideas] push failed', error instanceof Error ? error.message : error);
    });

    if (emailOwner && isEmailConfigured()) {
      const owner = people.find((person) => person.userId === input.release.ownerUserId);
      if (owner?.email) {
        try {
          await sendEmail(admin, {
            templateId: 'chime_in',
            to: owner.email,
            props: {
              recipientName: owner.name,
              authorLabel: author,
              releaseTitle: input.release.title,
              kind: 'note',
              message: chatEmailExcerpt(input.content),
              rolloutUrl: `${APP_URL}${rolloutIdeasPath(input.release.id)}`,
            },
            trigger: 'rollout_idea_added',
            recipientUserId: owner.userId,
            actorUserId: input.authorId,
            fromLabel: `${author} via Urganize`,
            idempotencyKey: `idea-${input.noteId}-${owner.userId}`,
          });
        } catch (error) {
          console.error('[rollout-ideas] email failed', error instanceof Error ? error.message : error);
        }
      }
    }
    await pushSend;
  } catch (error) {
    console.error('[rollout-ideas] notify failed', error instanceof Error ? error.message : error);
  }
}

/** "Ask to chime in": a push and an email to each person ticked. */
export async function notifyChimeInAsk(
  admin: SupabaseClient,
  input: { release: IdeasRelease; askerId: string; userIds: string[]; people: ReleaseChatPerson[]; askId: string }
): Promise<void> {
  try {
    if (!input.userIds.length) return;
    const asker = await authorLabelFor(admin, input.askerId);
    const line = chimeInAskLine(asker, input.release.title);
    const pushSend = sendPushToUsers(admin, input.userIds, {
      title: line,
      body: 'Talk or type your idea.',
      url: rolloutIdeasPath(input.release.id),
      tag: `rollout-chime-in-${input.release.id}`,
    }).catch((error) => {
      console.error('[rollout-ideas] ask push failed', error instanceof Error ? error.message : error);
    });

    if (isEmailConfigured()) {
      const byId = new Map(input.people.map((person) => [person.userId, person]));
      const sendOne = async (userId: string) => {
        const person = byId.get(userId);
        if (!person?.email) return;
        try {
          await sendEmail(admin, {
            templateId: 'chime_in',
            to: person.email,
            props: {
              recipientName: person.name,
              authorLabel: asker,
              releaseTitle: input.release.title,
              kind: 'ask',
              rolloutUrl: `${APP_URL}${rolloutIdeasPath(input.release.id)}`,
            },
            trigger: 'rollout_chime_in_asked',
            recipientUserId: userId,
            actorUserId: input.askerId,
            fromLabel: `${asker} via Urganize`,
            idempotencyKey: `chime-in-${input.askId}-${userId}`,
          });
        } catch (error) {
          console.error('[rollout-ideas] ask email failed', error instanceof Error ? error.message : error);
        }
      };
      // A few at a time: a rollout team is small, and Resend dislikes bursts.
      for (let i = 0; i < input.userIds.length; i += 4) {
        await Promise.all(input.userIds.slice(i, i + 4).map(sendOne));
      }
    }
    await pushSend;
  } catch (error) {
    console.error('[rollout-ideas] ask notify failed', error instanceof Error ? error.message : error);
  }
}

/** The plan was built for a rollout with ideas: push everyone else on it. */
export async function notifyPlanReady(
  admin: SupabaseClient,
  input: { release: IdeasRelease; builderId: string }
): Promise<void> {
  try {
    const people = await loadIdeasPeople(admin, input.release);
    const ids = people.map((person) => person.userId).filter((id) => id && id !== input.builderId);
    if (!ids.length) return;
    await sendPushToUsers(admin, ids, {
      title: planReadyLine(input.release.title),
      body: 'See what goes first.',
      url: rolloutIdeasPath(input.release.id),
      // One per rollout: building twice replaces the first, never stacks.
      tag: `rollout-plan-ready-${input.release.id}`,
    });
  } catch (error) {
    console.error('[rollout-ideas] plan-ready push failed', error instanceof Error ? error.message : error);
  }
}
