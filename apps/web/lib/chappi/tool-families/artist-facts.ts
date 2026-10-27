/**
 * What UrgAns remembers about each artist (2026-10-27): lib/artist-facts.ts.
 *
 * The facts are already in UrgAns's context every turn (portable-context.ts),
 * so list_artist_facts is for when it needs the ids. Saving and forgetting are
 * both confirmation-gated: UrgAns proposes, the person taps Save, and nothing
 * is remembered behind their back. The dispatcher logs both in the UrgAns
 * action log (object type artist_fact).
 *
 * These call lib/artist-facts-server.ts directly with the Chappi context
 * rather than the REST routes: there is no flag to translate, and the context
 * already carries the same scope (workspaceIds plus the artist-scoped members)
 * the routes build.
 */

import {
  ARTIST_FACT_TOPICS,
  ARTIST_FACT_TOPIC_LABEL,
  describeFactForgetCard,
  describeFactSaveCard,
  planFactSave,
  validateFactInput,
} from '@/lib/artist-facts';
import {
  deleteArtistFact,
  listArtistFacts,
  listFactsInScope,
  resolveFactArtist,
  resolveFactById,
  saveArtistFact,
} from '@/lib/artist-facts-server';
import { argString, fail, type ChappiTool, type ChappiToolContext } from './shared';

const scopeOf = (ctx: ChappiToolContext) => ({
  workspaceIds: ctx.workspaceIds,
  artistScopeByWorkspaceId: ctx.artistScopeByWorkspaceId,
});

const NO_ARTIST = 'That artist was not found. Call list_artists for the right id.';

export const ARTIST_FACT_TOOLS: ChappiTool[] = [
  {
    name: 'list_artist_facts',
    kind: 'read',
    level: 'read',
    description:
      'List what the team has told you to remember about its artists, with ids. Pass artistId for one artist. The facts are already in your context; call this when you need a fact id to change or forget one.',
    inputSchema: {
      type: 'object',
      properties: { artistId: { type: 'string', description: 'Only this artist.' } },
    },
    execute: async (ctx, args) => {
      const artistId = argString(args, 'artistId');
      const groups = await listFactsInScope(ctx.adminClient, scopeOf(ctx));
      const shown = artistId ? groups.filter((g) => g.artistId === artistId) : groups;
      const count = shown.reduce((sum, g) => sum + g.facts.length, 0);
      return {
        ok: true,
        summary: count === 0 ? 'Nothing saved yet.' : `${count} saved fact(s).`,
        data: shown.map((g) => ({
          artistId: g.artistId,
          artistName: g.artistName,
          facts: g.facts.map((f) => ({ factId: f.id, topic: f.topic, value: f.value, source: f.source })),
        })),
      };
    },
  },
  {
    name: 'save_artist_fact',
    kind: 'mutate',
    level: 'confirm',
    description: `Propose remembering a standing decision or preference about an artist, for example "Kemi doesn't want playlist pitching". Shows the user a card; nothing is saved until they tap Save. One fact per topic per artist: saving on a topic that already has one proposes replacing it. Topics: ${ARTIST_FACT_TOPICS.join(', ')} (other is for anything else). Keep value short and plain, under 200 characters. Pass factId only to change one specific "other" fact.`,
    inputSchema: {
      type: 'object',
      properties: {
        artistId: { type: 'string' },
        topic: { type: 'string', enum: [...ARTIST_FACT_TOPICS] },
        value: { type: 'string', description: 'What to remember, short and plain.' },
        factId: { type: 'string', description: 'Only to change one existing fact.' },
      },
      required: ['artistId', 'topic', 'value'],
    },
    confirm: async (ctx, args) => {
      const input = validateFactInput({ topic: args.topic, value: args.value });
      if (!input.ok) return { ok: false, summary: input.error };
      const artist = await resolveFactArtist(ctx.adminClient, scopeOf(ctx), argString(args, 'artistId'));
      if (!artist) return { ok: false, summary: NO_ARTIST };
      const plan = planFactSave(await listArtistFacts(ctx.adminClient, artist.id), {
        ...input,
        factId: argString(args, 'factId') || null,
      });
      switch (plan.kind) {
        case 'insert':
        case 'replace':
          return { ok: true, ...describeFactSaveCard(artist.name, input, plan) };
        case 'unchanged':
          return { ok: false, summary: `Already saved for ${artist.name}. Nothing to change.` };
        case 'full':
          return { ok: false, summary: `${artist.name} already has 10 other facts. Ask which one to forget first.` };
        case 'taken':
          return {
            ok: false,
            summary: `${artist.name} already has a ${ARTIST_FACT_TOPIC_LABEL[plan.holder.topic]} fact. Save on that topic without factId to replace it.`,
          };
        case 'missing':
          return { ok: false, summary: 'That fact id was not found. Call list_artist_facts.' };
      }
    },
    execute: async (ctx, args) => {
      const input = validateFactInput({ topic: args.topic, value: args.value });
      if (!input.ok) return fail(input.error);
      const artist = await resolveFactArtist(ctx.adminClient, scopeOf(ctx), argString(args, 'artistId'));
      if (!artist) return fail(NO_ARTIST);
      const saved = await saveArtistFact(ctx.adminClient, {
        artist,
        topic: input.topic,
        value: input.value,
        source: 'chat',
        userId: ctx.user.id,
        factId: argString(args, 'factId') || null,
      });
      if (!saved.ok) return fail(saved.error);
      const label = ARTIST_FACT_TOPIC_LABEL[saved.fact.topic];
      const was = saved.plan.kind === 'replace' ? ` (was: ${saved.plan.previous.value})` : '';
      return {
        ok: true,
        summary: `Saved to ${artist.name}: ${label}: ${saved.fact.value}${was}. It is on ${artist.name}'s page.`,
        data: { factId: saved.fact.id, artistId: artist.id, topic: saved.fact.topic, value: saved.fact.value },
      };
    },
  },
  {
    name: 'forget_artist_fact',
    kind: 'mutate',
    level: 'confirm',
    description:
      'Propose forgetting one saved fact about an artist. Shows the user a card; nothing changes until they approve. Needs the factId from list_artist_facts.',
    inputSchema: {
      type: 'object',
      properties: { factId: { type: 'string' } },
      required: ['factId'],
    },
    confirm: async (ctx, args) => {
      const found = await resolveFactById(ctx.adminClient, scopeOf(ctx), argString(args, 'factId'));
      if (!found) return { ok: false, summary: 'That fact was not found. Call list_artist_facts.' };
      return { ok: true, ...describeFactForgetCard(found.artist.name, found.fact) };
    },
    execute: async (ctx, args) => {
      const found = await resolveFactById(ctx.adminClient, scopeOf(ctx), argString(args, 'factId'));
      if (!found) return fail('That fact was not found.');
      const removed = await deleteArtistFact(ctx.adminClient, found.artist, found.fact.id);
      if (!removed.ok) return fail(removed.error);
      return { ok: true, summary: `Forgot it: ${found.artist.name}, ${found.fact.value}.` };
    },
  },
];
