/**
 * The fan email capture page: one public page per release that trades a link
 * for an email address.
 *
 * The interesting part of this feature is not the form, it is the PLAYBOOK.
 * lib/capture-playbook/ is hand-written, version-controlled conversion
 * knowledge with a deterministic grader, and its own header says why there is
 * no AI in it: "a model asked 'is this headline good' answers differently
 * every time and cannot be tested." So get_capture_page relays that grader's
 * verdict rather than the assistant forming an opinion of its own. When UrgAns
 * says a headline is too long it is quoting a rule with a number, not
 * guessing.
 *
 * ⚠️ THE PATCH IS A FULL-DOCUMENT PUT. normalizeCaptureDraft reads every field
 * off the body and defaults what is missing — so a sparse update does not just
 * lose the fields it omits, it sets isPaused to false and unpauses the page.
 * update_capture_page reads then merges. This is the sharpest instance of the
 * trap update_release_metadata documents, because one of the fields it would
 * silently blank is the destination link, which is the whole thing the fan is
 * owed in exchange for their address.
 */

import {
  CAPTURE_HEADLINE_RECOMMENDED_MAX,
  evaluateCapturePage,
  isUsableDestination,
} from '@/lib/capture-playbook';
import type { ReleaseCapturePage } from '@/types/capture';
import {
  apiError,
  argBoolean,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const CAPTURE_OFF = "Fan capture isn't switched on for your team yet.";

type CaptureResponse = {
  page?: ReleaseCapturePage | null;
  leadCount?: number;
  hasGraphic?: boolean;
  leads?: Array<Record<string, unknown>>;
};

/** The nine fields the PATCH rewrites wholesale, as a draft the grader reads. */
const toDraft = (page: ReleaseCapturePage) => ({
  headline: page.headline,
  incentive: page.incentive,
  destinationUrl: page.destinationUrl,
  destinationLabel: page.destinationLabel,
  buttonLabel: page.buttonLabel,
  graphicAssetId: page.graphicAssetId,
  collectName: page.collectName,
  consentNote: page.consentNote,
  isPaused: page.isPaused,
});

export const CAPTURE_TOOLS: ChappiTool[] = [
  {
    name: 'get_capture_page',
    kind: 'read',
    description:
      "A rollout's fan capture page: what it says, whether it is live, how many emails it has collected, and what the conversion playbook says is still wrong with it.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/capture`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return fail(CAPTURE_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the capture page.'));
      const body = res.body as CaptureResponse;
      const page = body.page;
      if (!page) {
        return {
          ok: true,
          summary: 'No fan capture page on this rollout yet.',
          data: { page: null },
        };
      }

      // The playbook's own verdict, not the model's. Deterministic, testable,
      // and it cites a rule rather than an opinion.
      const readiness = evaluateCapturePage(toDraft(page), {
        hasGraphic: body.hasGraphic === true,
      });
      const outstanding = readiness.results.filter((rule) => !rule.passed);

      return {
        ok: true,
        summary: `${page.isPaused ? 'Paused' : 'Live'}, ${body.leadCount ?? 0} ${
          (body.leadCount ?? 0) === 1 ? 'email' : 'emails'
        } collected.${
          outstanding.length > 0 ? ` ${outstanding.length} thing(s) still to fix.` : ''
        }`,
        data: {
          shareUrl: `${ctx.origin}/capture/${page.shareToken}`,
          headline: page.headline,
          incentive: page.incentive,
          destinationUrl: page.destinationUrl,
          destinationLabel: page.destinationLabel,
          buttonLabel: page.buttonLabel,
          collectName: page.collectName,
          isPaused: page.isPaused,
          leadCount: body.leadCount ?? 0,
          // Relay the grader verbatim. A blocker means the page cannot do its
          // job at all; a suggestion is advice the manager may ignore.
          outstanding: outstanding.map((rule) => ({ severity: rule.severity, fix: rule.fix })),
        },
      };
    },
  },
  {
    name: 'create_capture_page',
    kind: 'mutate',
    description:
      "Start a fan capture page for a rollout. Safe to call twice — a rollout that already has one gets it back. It starts paused and needs a destination link before it can do anything.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/capture`, {
        method: 'POST',
        body: {},
      });
      if (isFlagGateOff(res)) return fail(CAPTURE_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not start the capture page.'));
      const page = (res.body as CaptureResponse).page;
      return {
        ok: true,
        summary: page
          ? 'Started the capture page. It needs the link fans get before it will collect anything.'
          : 'Started the capture page.',
        data: page ? { shareUrl: `${ctx.origin}/capture/${page.shareToken}` } : {},
      };
    },
  },
  {
    name: 'update_capture_page',
    kind: 'mutate',
    description:
      "Change what the capture page says, or pause and unpause it. Send only what is changing. The destination link is what fans get the moment they submit — without it the page takes an address and pays nothing back.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        headline: {
          type: 'string',
          description: `The big line. Aim for ${CAPTURE_HEADLINE_RECOMMENDED_MAX} characters or fewer.`,
        },
        incentive: { type: 'string', description: 'What they get for their email.' },
        destinationUrl: { type: 'string', description: 'The link revealed on submit, https://…' },
        destinationLabel: { type: 'string', description: 'What that link is called.' },
        buttonLabel: { type: 'string' },
        collectName: { type: 'boolean', description: 'Ask for a name as well as an email.' },
        consentNote: { type: 'string' },
        isPaused: { type: 'boolean', description: 'True takes the page down without deleting it.' },
      },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');

      // Read then merge, and this is not optional here: the PATCH rewrites
      // every field, so sending just a headline would blank the destination
      // link AND unpause the page.
      const current = await callInternalApi(ctx, `/api/releases/${releaseId}/capture`, {
        method: 'GET',
      });
      if (isFlagGateOff(current)) return fail(CAPTURE_OFF);
      if (!current.ok) return fail(apiError(current, 'Could not read the capture page.'));
      const page = (current.body as CaptureResponse).page;
      if (!page) return fail('There is no capture page on this rollout yet — create one first.');

      const draft: Record<string, unknown> = { ...toDraft(page) };
      for (const key of [
        'headline',
        'incentive',
        'destinationUrl',
        'destinationLabel',
        'buttonLabel',
        'consentNote',
      ]) {
        if (key in args) draft[key] = argString(args, key);
      }
      const collectName = argBoolean(args, 'collectName');
      if (collectName !== undefined) draft.collectName = collectName;
      const isPaused = argBoolean(args, 'isPaused');
      if (isPaused !== undefined) draft.isPaused = isPaused;

      // Refuse to publish a page that would take an address and give nothing
      // back. The route does not stop this; the playbook calls it the one
      // blocker that matters most, so it is checked before the write.
      if (draft.isPaused === false && !isUsableDestination(String(draft.destinationUrl || ''))) {
        return fail(
          'That page has no working link yet, so unpausing it would collect emails and pay nothing back. Add the destination link first.'
        );
      }

      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/capture`, {
        method: 'PATCH',
        body: draft,
      });
      if (isFlagGateOff(res)) return fail(CAPTURE_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not update the capture page.'));
      const updated = (res.body as CaptureResponse).page;
      return {
        ok: true,
        summary: updated
          ? `Updated the capture page. It is ${updated.isPaused ? 'paused' : 'live'}.`
          : 'Updated the capture page.',
      };
    },
  },
  {
    name: 'list_capture_leads',
    kind: 'read',
    description:
      'How many emails a capture page has collected, and the most recent few. Nothing in Urganize sends email — this is for exporting.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/capture`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return fail(CAPTURE_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the emails.'));
      const body = res.body as CaptureResponse;
      const leads = body.leads || [];
      return {
        ok: true,
        summary: `${body.leadCount ?? leads.length} ${
          (body.leadCount ?? leads.length) === 1 ? 'email' : 'emails'
        } collected. Export them from the Fan capture page.`,
        data: {
          leadCount: body.leadCount ?? leads.length,
          // A handful, newest first, so the reply can show the shape of what
          // is coming in. The full list belongs in the export, not in a
          // transcript — these are other people's addresses.
          recent: leads.slice(0, 5).map((lead) => ({
            email: lead.email ?? null,
            name: lead.name ?? null,
            createdAt: lead.createdAt ?? null,
          })),
        },
      };
    },
  },
];
