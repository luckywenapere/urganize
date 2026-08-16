// Song tools (SERVER-ONLY): the release's audio master — checking whether one
// is there, and getting one uploaded.
//
// `upload_song` is the reason this family is shaped the way it is, and the
// constraint behind it is worth stating once because it is permanent: a model
// turn is text, so no tool can ever RECEIVE a file. CLAUDE.md recorded file
// upload as deferred for exactly that reason ("multipart + signed URLs are
// impractical from chat"), and that is still true of the transport.
//
// What is NOT true is that the assistant therefore cannot do this. The upload
// does not need to travel through the model — it needs to START from the
// conversation. So this tool does the half a model is actually good at: work
// out which release is meant, say what is already attached, and hand the
// browser a `clientAction` that drops a real file picker into the transcript.
// The bytes then take the same three-step signed-URL path the workspace scene
// uses (lib/song.ts), never touching the model or our serverless functions.
//
// One browser rule makes that handoff the only honest design: `input.click()`
// only opens a file dialog inside a user gesture. A tool result arrives from a
// network response, not a click, so nothing here could pop a dialog even if it
// wanted to — the card with a button on it IS the mechanism, not a consolation.

import type { ChappiClientAction } from '../types';
import {
  apiError,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const SONG_OFF = "Song uploads aren't enabled yet.";

type SongPayload = {
  fileName?: unknown;
  fileSize?: unknown;
  uploadedAt?: unknown;
};

/** Bounded: a release has one song, occasionally a couple of versions. */
const MAX_LISTED_SONGS = 10;

async function loadSongs(
  ctx: Parameters<ChappiTool['execute']>[0],
  releaseId: string
): Promise<{ error: string } | { songs: SongPayload[] }> {
  const res = await callInternalApi(ctx, `/api/releases/${releaseId}/song`, { method: 'GET' });
  if (isFlagGateOff(res)) return { error: SONG_OFF };
  if (!res.ok) return { error: apiError(res, 'Could not check the song.') };
  return {
    songs: Array.isArray(res.body.songs) ? (res.body.songs as SongPayload[]) : [],
  };
}

export const SONG_TOOLS: ChappiTool[] = [
  {
    name: 'get_song',
    kind: 'read',
    description:
      "Check whether a release has its song (the audio master) uploaded, and what the file is.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string', description: 'The release id.' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');

      const result = await loadSongs(ctx, releaseId);
      if ('error' in result) return fail(result.error);

      const songs = result.songs.slice(0, MAX_LISTED_SONGS).map((song) => ({
        fileName: String(song.fileName ?? ''),
        fileSize: Number(song.fileSize) || 0,
        uploadedAt: String(song.uploadedAt ?? ''),
      }));

      if (songs.length === 0) {
        return {
          ok: true,
          summary: 'No song has been uploaded to this release yet.',
          data: { hasSong: false, songs },
        };
      }

      return {
        ok: true,
        summary:
          songs.length === 1
            ? `The song is uploaded: ${songs[0].fileName}.`
            : `${songs.length} audio files are uploaded; the current one is ${songs[0].fileName}.`,
        data: { hasSong: true, songs },
      };
    },
  },
  {
    name: 'upload_song',
    kind: 'mutate',
    description:
      "Start uploading the song (the audio master) for a release. Use this whenever the user wants to add, send, attach or replace a release's audio. It opens a file picker right here in the conversation — it does NOT upload anything by itself, and you cannot be given the file. Tell the user to choose their file in the card that appears.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: {
          type: 'string',
          description:
            'The release to upload the song for. Resolve the name to an id first; never guess.',
        },
      },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');

      // Reads the song list first, which does double duty: it is the ownership
      // and flag check (the route 404s for a release that is not the user's, so
      // a bad id can never produce a card), and it is how the reply can say
      // what is already attached instead of pretending the release is empty.
      const result = await loadSongs(ctx, releaseId);
      if ('error' in result) return fail(result.error);

      const existing = result.songs.length;
      const currentName = existing ? String(result.songs[0]?.fileName ?? '') : '';

      const clientAction: ChappiClientAction = { type: 'open_song_upload', releaseId };

      return {
        ok: true,
        summary: existing
          ? `Ready — choose the file in the card below. This release already has ${currentName}; uploading another adds a version rather than replacing it.`
          : 'Ready — choose the file in the card below.',
        data: { awaitingFile: true, existingSongCount: existing },
        clientAction,
      };
    },
  },
];
