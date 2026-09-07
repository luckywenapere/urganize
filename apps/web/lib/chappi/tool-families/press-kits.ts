/**
 * The standing press kit — one per artist, twelve fixed sections, its own
 * public link.
 *
 * Like a show, a kit hangs off the ARTIST and not off a release, so these
 * tools start from an artist id. It replaced the per-release EPK on
 * 2026-09-05; the old epk tools went with it, which is why nothing here is
 * named after one.
 *
 * WHAT THE MODEL MAY WRITE IS DELIBERATELY NARROW. write_press_kit_section
 * reuses DRAFT_ALLOWED_FIELDS from lib/press-kit-draft.ts, whose own header
 * gives the reason: "a model asked for a bio will cheerfully offer a home city
 * or a genre alongside it, and both of those are facts that came from
 * somewhere real." So the assistant writes the three prose sections and
 * nothing else. The numbers, the press quotes, the contacts and the links are
 * the manager's to enter, because a plausible invented follower count in a kit
 * that goes to a booker is worse than an empty section.
 *
 * The embedded presskit.draft_section action is the propose-then-apply
 * version of the same write and is untouched. This is the conversational one:
 * the model drafts in the transcript, the user says yes, and the tool saves —
 * which is the rule ROLE already sets for suggesting activities. The two share
 * that allowlist and nothing else: the embedded one calls a model of its own
 * and therefore owns the prompt building, the output parsing and the
 * stale-write guard, none of which a same-turn write has any use for. Both
 * write to urgans_actions so /admin/urgans can tell the doors apart.
 */

import { DRAFT_ALLOWED_FIELDS, isDraftableSection } from '@/lib/press-kit-draft';
import { PRESS_KIT_SECTION_LABELS } from '@/lib/press-kits';
import { recordChatActionRun } from '@/lib/urgans-actions/chat-log-server';
import {
  PRESS_KIT_SECTIONS,
  type PressKit,
  type PressKitSection,
  type PressKitSectionKey,
} from '@/types/press-kits';
import {
  apiError,
  argBoolean,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const KITS_OFF = "Press kits aren't switched on for this team yet.";

/**
 * The embedded action write_press_kit_section is the chat door onto. Note the
 * id has no underscore in "presskit" even though the object type does — an
 * existing wart in the registry, spelled out here because the readable guess
 * is wrong and a silently unmatched action type would log nothing.
 */
const KIT_DRAFT_ACTION = 'presskit.draft_section';

const VISIBILITIES = ['link_only', 'public', 'public_listed'] as const;

const compactKit = (kit: PressKit) => ({
  id: kit.id,
  artistId: kit.artistId,
  artist: kit.artistName,
  slug: kit.slug,
  state: kit.state,
  visibility: kit.visibility,
  publishedAt: kit.publishedAt,
  embargoDate: kit.embargoDate,
  availableForInterview: kit.availableForInterview,
});

export const PRESS_KIT_TOOLS: ChappiTool[] = [
  {
    name: 'list_press_kits',
    kind: 'read',
    description:
      "List every artist on the roster and their press kit, if they have started one. Use this to find a kit id, or to see who still has no kit.",
    inputSchema: { type: 'object', properties: {} },
    execute: async (ctx) => {
      const res = await callInternalApi(ctx, '/api/press-kits', { method: 'GET' });
      if (isFlagGateOff(res)) return fail(KITS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the press kits.'));
      const entries = (res.body.entries || []) as Array<{
        artistId: string;
        artistName: string;
        kit: PressKit | null;
      }>;
      const started = entries.filter((entry) => entry.kit);
      return {
        ok: true,
        summary:
          entries.length === 0
            ? 'No artists on the roster yet.'
            : `${started.length} of ${entries.length} artists have a press kit.`,
        data: {
          entries: entries.map((entry) => ({
            artistId: entry.artistId,
            artist: entry.artistName,
            kit: entry.kit ? compactKit(entry.kit) : null,
          })),
        },
      };
    },
  },
  {
    name: 'get_press_kit',
    kind: 'read',
    description:
      "Get one press kit: every section, whether each is empty, a draft or ready, and whether the kit is live. Read this before writing a section, because it is what a section's current content comes from.",
    inputSchema: {
      type: 'object',
      properties: { kitId: { type: 'string', description: 'The press kit id.' } },
      required: ['kitId'],
    },
    execute: async (ctx, args) => {
      const kitId = argString(args, 'kitId');
      if (!kitId) return fail('kitId is required.');
      const res = await callInternalApi(ctx, `/api/press-kits/${kitId}`, { method: 'GET' });
      if (isFlagGateOff(res)) return fail(KITS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load that press kit.'));
      const kit = res.body.kit as PressKit | undefined;
      if (!kit) return fail('That press kit was not found.');
      const sections = (res.body.sections || []) as PressKitSection[];
      return {
        ok: true,
        summary: `${kit.artistName}'s press kit — ${kit.state}${
          kit.publishedAt ? ', live' : ''
        }.`,
        data: {
          kit: compactKit(kit),
          publicUrl: kit.publishedAt ? `${ctx.origin}/k/${kit.slug}` : null,
          sections: sections.map((section) => ({
            section: section.section,
            label: PRESS_KIT_SECTION_LABELS[section.section] ?? section.section,
            status: section.status,
            source: section.source,
            writable: isDraftableSection(section.section),
            content: section.content,
          })),
          assetCount: ((res.body.assets || []) as unknown[]).length,
        },
      };
    },
  },
  {
    name: 'create_press_kit',
    kind: 'mutate',
    description:
      "Start a press kit for an artist. Safe to call twice: an artist who already has one gets theirs back, since there is only ever one per artist.",
    inputSchema: {
      type: 'object',
      properties: { artistId: { type: 'string' } },
      required: ['artistId'],
    },
    execute: async (ctx, args) => {
      const artistId = argString(args, 'artistId');
      if (!artistId) return fail('artistId is required.');
      const res = await callInternalApi(ctx, '/api/press-kits', {
        method: 'POST',
        body: { artistId },
      });
      if (isFlagGateOff(res)) return fail(KITS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not start the press kit.'));
      const kit = res.body.kit as PressKit | undefined;
      return {
        ok: true,
        summary: kit
          ? `${kit.artistName}'s press kit is started. Some of it was filled in from what the workspace already knows.`
          : 'Started the press kit.',
        data: { kitId: kit?.id ?? null },
      };
    },
  },
  {
    name: 'update_press_kit',
    kind: 'mutate',
    description:
      "Change a kit's settings: its web address (slug), who can see it, an embargo date, or whether the artist is available for interview. Not the content, which is write_press_kit_section's job.",
    inputSchema: {
      type: 'object',
      properties: {
        kitId: { type: 'string' },
        slug: { type: 'string', description: 'The last part of the public web address.' },
        visibility: { type: 'string', enum: [...VISIBILITIES] },
        embargoDate: { type: 'string', description: 'YYYY-MM-DD, or empty to clear it.' },
        availableForInterview: { type: 'boolean' },
      },
      required: ['kitId'],
    },
    execute: async (ctx, args) => {
      const kitId = argString(args, 'kitId');
      if (!kitId) return fail('kitId is required.');
      const body: Record<string, unknown> = {};
      const slug = argString(args, 'slug');
      if (slug) body.slug = slug;
      const visibility = argString(args, 'visibility');
      if (visibility) body.visibility = visibility;
      if ('embargoDate' in args) body.embargoDate = argString(args, 'embargoDate') || null;
      const interview = argBoolean(args, 'availableForInterview');
      if (interview !== undefined) body.availableForInterview = interview;
      if (Object.keys(body).length === 0) return fail('Nothing to change.');

      const res = await callInternalApi(ctx, `/api/press-kits/${kitId}`, {
        method: 'PATCH',
        body,
      });
      if (isFlagGateOff(res)) return fail(KITS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not update the press kit.'));
      return { ok: true, summary: 'Updated the press kit.' };
    },
  },
  {
    name: 'write_press_kit_section',
    kind: 'mutate',
    description:
      'Save writing into a press kit section. Only the three prose sections can be written this way: "header" (a one-line descriptor), "bios" (short, medium and long) and "latest_release" (a hook). Everything else (numbers, press quotes, contacts, links) is the manager\'s to enter, because those are facts. Draft the words in the conversation first and save once the user agrees.',
    inputSchema: {
      type: 'object',
      properties: {
        kitId: { type: 'string' },
        section: { type: 'string', enum: ['header', 'bios', 'latest_release'] },
        fields: {
          type: 'object',
          description:
            'The writing, keyed by field: header takes descriptor; bios takes short, medium and long; latest_release takes hook. Leave a field out to keep what is already there.',
        },
      },
      required: ['kitId', 'section', 'fields'],
    },
    execute: async (ctx, args) => {
      const kitId = argString(args, 'kitId');
      const section = argString(args, 'section') as PressKitSectionKey;
      if (!kitId || !section) return fail('kitId and section are required.');
      if (!(PRESS_KIT_SECTIONS as readonly string[]).includes(section)) {
        return fail('That is not a section of a press kit.');
      }
      if (!isDraftableSection(section)) {
        const label = PRESS_KIT_SECTION_LABELS[section] ?? section;
        return fail(
          `${label} holds facts rather than writing, so I should not fill it in. The numbers, quotes, contacts and links have to come from the manager. Open the press kit to edit it.`
        );
      }

      const allowed = DRAFT_ALLOWED_FIELDS[section] || [];
      const raw = args.fields;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return fail('Send the writing as fields, e.g. { "short": "..." }.');
      }
      // The same allowlist the embedded drafting action applies, and for the
      // same reason: anything not named here is a fact from somewhere real.
      const incoming: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (allowed.includes(key) && typeof value === 'string' && value.trim()) {
          incoming[key] = value.trim();
        }
      }
      if (Object.keys(incoming).length === 0) {
        return fail(`For ${section}, send any of: ${allowed.join(', ')}.`);
      }

      // Read then merge. This PATCH REPLACES the section's content object, so
      // saving just the short bio would blank the long one somebody already
      // wrote — the same trap update_release_metadata documents.
      const current = await callInternalApi(ctx, `/api/press-kits/${kitId}`, { method: 'GET' });
      if (isFlagGateOff(current)) return fail(KITS_OFF);
      if (!current.ok) return fail(apiError(current, 'Could not read the press kit.'));
      const sections = (current.body.sections || []) as PressKitSection[];
      const existing = sections.find((entry) => entry.section === section);
      if (!existing) return fail('That section is not set up on this kit yet.');

      const res = await callInternalApi(ctx, `/api/press-kits/${kitId}/sections/${section}`, {
        method: 'PATCH',
        body: { content: { ...(existing.content || {}), ...incoming } },
      });
      if (isFlagGateOff(res)) return fail(KITS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not save the section.'));

      // Logged as ALREADY APPLIED, with no prior drafted row, because this is
      // a one-shot: the words were composed in the transcript and the user
      // asked for them to be saved, so the write IS the apply. The embedded
      // presskit.draft_section action is the two-step version of the same job
      // — a model drafts, a card accepts — and it is what owns the stale-write
      // guard, which a same-turn write has no window to need.
      await recordChatActionRun(ctx.adminClient, {
        actionType: KIT_DRAFT_ACTION,
        objectId: kitId,
        actor: ctx.user,
        status: 'applied',
        inputSummary: { section, fields: Object.keys(incoming) },
      });

      const saved = Object.keys(incoming).join(', ');
      return {
        ok: true,
        summary: `Saved ${saved} in the ${
          PRESS_KIT_SECTION_LABELS[section] ?? section
        } section. It is a draft until the kit is published.`,
      };
    },
  },
  {
    name: 'publish_press_kit',
    kind: 'mutate',
    description:
      "Put the press kit on the web at its public link. Publishing takes a snapshot of what is written now, and later edits stay drafts until it is published again.",
    inputSchema: {
      type: 'object',
      properties: { kitId: { type: 'string' } },
      required: ['kitId'],
    },
    confirm: async (ctx, args) => {
      const kitId = argString(args, 'kitId');
      if (!kitId) return { ok: false, summary: 'kitId is required.' };
      const res = await callInternalApi(ctx, `/api/press-kits/${kitId}`, { method: 'GET' });
      if (isFlagGateOff(res)) return { ok: false, summary: KITS_OFF };
      if (!res.ok) return { ok: false, summary: apiError(res, 'Could not find that press kit.') };
      const kit = res.body.kit as PressKit | undefined;
      if (!kit) return { ok: false, summary: 'That press kit was not found.' };
      const sections = (res.body.sections || []) as PressKitSection[];
      const empty = sections.filter((section) => section.status === 'empty').length;
      const again = Boolean(kit.publishedAt);
      return {
        ok: true,
        title: again
          ? `Publish ${kit.artistName}'s press kit again?`
          : `Put ${kit.artistName}'s press kit live?`,
        detail: `Anyone with the link can read it at ${ctx.origin}/k/${kit.slug}.${
          empty > 0 ? ` ${empty} ${empty === 1 ? 'section is' : 'sections are'} still empty.` : ''
        } You can unpublish it afterwards, though people may have seen it.`,
        confirmLabel: again ? 'Publish again' : 'Publish',
      };
    },
    execute: async (ctx, args) => {
      const kitId = argString(args, 'kitId');
      if (!kitId) return fail('kitId is required.');
      const res = await callInternalApi(ctx, `/api/press-kits/${kitId}/publish`, {
        method: 'POST',
        body: {},
      });
      if (isFlagGateOff(res)) return fail(KITS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not publish the press kit.'));
      const kit = res.body.kit as PressKit | undefined;
      return {
        ok: true,
        summary: kit
          ? `It is live at ${ctx.origin}/k/${kit.slug}.`
          : 'The press kit is live.',
      };
    },
  },
  {
    name: 'unpublish_press_kit',
    kind: 'mutate',
    description:
      'Take the press kit back off the web. The writing is kept, and only the public link stops working.',
    inputSchema: {
      type: 'object',
      properties: { kitId: { type: 'string' } },
      required: ['kitId'],
    },
    execute: async (ctx, args) => {
      const kitId = argString(args, 'kitId');
      if (!kitId) return fail('kitId is required.');
      const res = await callInternalApi(ctx, `/api/press-kits/${kitId}/publish`, {
        method: 'DELETE',
      });
      if (isFlagGateOff(res)) return fail(KITS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not unpublish the press kit.'));
      return { ok: true, summary: 'The press kit is off the web. Nothing you wrote was lost.' };
    },
  },
];
