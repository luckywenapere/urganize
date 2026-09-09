/**
 * A release's artwork, and what else is attached to it.
 *
 * The interesting one is upload_cover_art, and it exists because of a hard
 * limit rather than a design choice: a model turn is text, so nothing can hand
 * a tool a file, and `input.click()` only opens a picker inside a user
 * gesture — which a tool result, arriving over the network, is not. So the
 * tool does the half a model is good at (resolve the release, say what is
 * already attached, which doubles as the ownership and flag check because the
 * route 404s for a release that is not yours) and hands the BROWSER a picker
 * card. upload_song set this pattern; see its header for the full argument.
 *
 * Cover art and release files sit behind two DIFFERENT flags —
 * NEXT_PUBLIC_FEATURE_COVER_ART and NEXT_PUBLIC_FEATURE_FILES — and that split
 * is deliberate in the product: the founder switched the file cabinet off
 * while "replace this release's artwork" stayed a live, central ask. So these
 * tools can be available one at a time, and each translates its own flag.
 */

import {
  COVER_ART_FORMATS_LABEL,
  COVER_ART_MAX_BYTES,
} from '@/lib/cover-art-upload';
import { DSP_MIN_EDGE } from '@/lib/cover-art-dsp';
import { formatFileSize } from '@/lib/asset-constants';
import {
  apiError,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const COVER_ART_OFF = "Cover art isn't switched on for your team yet.";
const FILES_OFF = "Rollout files aren't switched on for your team yet.";

export const FILE_TOOLS: ChappiTool[] = [
  {
    name: 'get_cover_art',
    kind: 'read',
    description:
      "Whether a rollout has cover art, what file it is, and whether it meets what music stores require. Says nothing about the rollout card's fallback image — this is the real artwork or nothing.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/cover-art`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return fail(COVER_ART_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not check the cover art.'));
      const coverArt = res.body.coverArt as Record<string, unknown> | null;
      if (!coverArt) {
        return {
          ok: true,
          summary: 'No cover art on this rollout yet.',
          data: { coverArt: null },
        };
      }
      const image = (coverArt.metadata as Record<string, unknown> | undefined)?.image as
        | { width?: number; height?: number }
        | undefined;
      const size =
        image?.width && image?.height ? `${image.width} x ${image.height}` : 'size unrecorded';
      return {
        ok: true,
        summary: `Cover art is attached: ${String(coverArt.fileName || 'an image')}, ${size}.`,
        data: {
          fileName: coverArt.fileName ?? null,
          width: image?.width ?? null,
          height: image?.height ?? null,
          meetsStoreRequirements:
            typeof image?.width === 'number' &&
            typeof image?.height === 'number' &&
            image.width === image.height &&
            image.width >= DSP_MIN_EDGE,
        },
      };
    },
  },
  {
    name: 'upload_cover_art',
    kind: 'mutate',
    description:
      "Start attaching cover art to a rollout. You cannot be sent a file and cannot upload one yourself — this puts a file picker in the conversation for the user to choose with. Uploading REPLACES whatever artwork is there now. Say the picker is ready and ask them to pick; never claim it is done until they say so.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');

      // Read first. This is the ownership and flag check as much as it is a
      // read: the route 404s for a release that is not this team's, so a
      // picker never opens for one the user cannot touch.
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/cover-art`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return fail(COVER_ART_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not open the cover art for that rollout.'));
      const existing = res.body.coverArt as Record<string, unknown> | null;

      return {
        ok: true,
        summary: existing
          ? `There is a picker in the conversation now. Choosing a file replaces the current artwork (${String(
              existing.fileName || 'an image'
            )}). Square, at least ${DSP_MIN_EDGE} x ${DSP_MIN_EDGE}, ${COVER_ART_FORMATS_LABEL}, up to ${formatFileSize(
              COVER_ART_MAX_BYTES
            )}.`
          : `There is a picker in the conversation now. Square, at least ${DSP_MIN_EDGE} x ${DSP_MIN_EDGE}, ${COVER_ART_FORMATS_LABEL}, up to ${formatFileSize(
              COVER_ART_MAX_BYTES
            )}.`,
        clientAction: { type: 'open_cover_art_upload', releaseId },
      };
    },
  },
  {
    name: 'list_release_files',
    kind: 'read',
    description:
      "What is attached to a rollout — artwork, masters, contracts, split sheets — by category. Read only: you cannot attach a file yourself, and only the song and the cover art have a picker.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/assets`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return fail(FILES_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the files.'));
      const assets = (res.body.assets || []) as Array<Record<string, unknown>>;
      const byCategory = new Map<string, number>();
      for (const asset of assets) {
        const category = String(asset.category || 'other');
        byCategory.set(category, (byCategory.get(category) || 0) + 1);
      }
      return {
        ok: true,
        summary:
          assets.length === 0
            ? 'Nothing attached to this rollout yet.'
            : `${assets.length} ${assets.length === 1 ? 'file' : 'files'}: ${[...byCategory]
                .map(([category, count]) => `${count} ${category.replace(/_/g, ' ')}`)
                .join(', ')}.`,
        data: {
          // No download links. They are short-lived signed URLs, so one quoted
          // into a transcript is a link that stops working — and the transcript
          // is not where a file belongs anyway.
          files: assets.map((asset) => ({
            id: String(asset.id || ''),
            category: String(asset.category || ''),
            fileName: asset.fileName ?? null,
          })),
        },
      };
    },
  },
];
