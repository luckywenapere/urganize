import { describe, expect, it, vi } from 'vitest';
import {
  MAX_SONG_VERSION_BYTES,
  SONG_VERSION_ACCEPT,
  guessVersionLabel,
  isKnownVersionLabel,
  resolveSongVersionMimeType,
  validateSongVersionUpload,
} from './song-versions';
import { uploadSongFile, type PutFile } from './song-version-upload';
import { describeSongInUse, parseSongCreate, parseSongPatch } from './song-catalog';

/**
 * Song files: whether a file is accepted, what it is called, and the three
 * step upload that finally puts a track in a DJ's hands.
 *
 * The acceptance grid is the one worth reading. Browsers disagree about what
 * to call an audio file, and Windows often says nothing at all, so every
 * extension is checked against every type a browser has been seen to send.
 */

const EXTENSIONS = ['mp3', 'MP3', 'wav', 'flac', 'aif', 'aiff', 'm4a', 'ogg', 'aac', 'mp4', 'txt', 'png', ''];
const TYPES = [
  '',
  'application/octet-stream',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/flac',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/ogg',
  'audio/aac',
  'video/mp4',
  'image/png',
  'text/plain',
];

const CANONICAL: Record<string, string> = {
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/flac': 'audio/flac',
  'audio/x-flac': 'audio/flac',
  'audio/aiff': 'audio/aiff',
  'audio/x-aiff': 'audio/aiff',
  'audio/mp4': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
};
const BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  m4a: 'audio/mp4',
};

describe('which files are accepted, and what they are stored as', () => {
  it('decides every extension against every type a browser sends', () => {
    let checked = 0;
    for (const extension of EXTENSIONS) {
      for (const type of TYPES) {
        const fileName = extension ? `Lagos Nights.${extension}` : 'Lagos Nights';
        const expected =
          CANONICAL[type] ??
          (type === '' || type === 'application/octet-stream'
            ? (BY_EXTENSION[extension.toLowerCase()] ?? null)
            : null);
        expect(resolveSongVersionMimeType(fileName, type), `${fileName} as ${type || 'nothing'}`).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBe(EXTENSIONS.length * TYPES.length);
  });

  it('reads a type written in capitals or with stray spaces', () => {
    expect(resolveSongVersionMimeType('a.mp3', ' Audio/MPEG ')).toBe('audio/mpeg');
  });

  it('offers exactly the accepted formats in the file picker', () => {
    for (const extension of ['.mp3', '.wav', '.flac', '.aif', '.aiff', '.m4a']) {
      expect(SONG_VERSION_ACCEPT.split(',')).toContain(extension);
    }
    expect(SONG_VERSION_ACCEPT).not.toContain('.ogg');
  });

  it.each([
    [{ fileName: '', mimeType: 'audio/mpeg', fileSize: 10 }, 'That file has no name.', 400],
    [{ fileName: '   ', mimeType: 'audio/mpeg', fileSize: 10 }, 'That file has no name.', 400],
    [
      { fileName: 'a.ogg', mimeType: 'audio/ogg', fileSize: 10 },
      'That is not an audio file a DJ can load. Use MP3, WAV, AIFF, FLAC or M4A.',
      400,
    ],
    [{ fileName: 'a.mp3', mimeType: 'audio/mpeg', fileSize: 0 }, 'That file looks empty.', 400],
    [{ fileName: 'a.mp3', mimeType: 'audio/mpeg', fileSize: -1 }, 'That file looks empty.', 400],
    [{ fileName: 'a.mp3', mimeType: 'audio/mpeg', fileSize: Number.NaN }, 'That file looks empty.', 400],
    [
      { fileName: 'a.wav', mimeType: 'audio/wav', fileSize: MAX_SONG_VERSION_BYTES + 1 },
      'That file is over 40 MB. Send an MP3 rather than a WAV master.',
      413,
    ],
  ])('refuses %j', (input, message, status) => {
    expect(validateSongVersionUpload(input)).toEqual({ message, status });
  });

  it.each([1, 1024, 5 * 1024 * 1024, MAX_SONG_VERSION_BYTES])('accepts a %i byte file', (fileSize) => {
    expect(validateSongVersionUpload({ fileName: 'a.flac', mimeType: '', fileSize })).toBeNull();
  });
});

describe('guessVersionLabel: naming a file from its name', () => {
  it.each([
    ['Lagos Nights.mp3', 'original'],
    ['Lagos Nights (Master).wav', 'original'],
    ['Lagos Nights - Radio Edit.mp3', 'radio_edit'],
    ['Lagos_Nights_Radio_Edit.mp3', 'radio_edit'],
    ['lagos-nights-radio.mp3', 'radio_edit'],
    ['Lagos Nights (Instrumental).wav', 'instrumental'],
    ['Lagos_Nights_Instrumental.wav', 'instrumental'],
    ['Lagos.Nights.Instr.flac', 'instrumental'],
    ['Lagos Nights Acapella.wav', 'acapella'],
    ['Lagos Nights Acappella.wav', 'acapella'],
    ['Lagos Nights (A Cappella).wav', 'acapella'],
    ['Lagos_Nights_acap.wav', 'acapella'],
    ['Lagos Nights Extended Mix.mp3', 'extended'],
    ['Lagos Nights Long Mix.mp3', 'extended'],
    ['Lagos Nights (Live at Eko).mp3', 'live'],
    ['Lagos Nights [Dirty].mp3', 'dirty'],
    ['Lagos Nights Explicit.mp3', 'dirty'],
    ['Lagos Nights {Clean}.mp3', 'clean'],
    // An instrumental that also says clean is an instrumental.
    ['Lagos Nights Clean Instrumental.wav', 'instrumental'],
    // A word that only CONTAINS a label is not one.
    ['Delivery.mp3', 'original'],
    ['Olive Tree.mp3', 'original'],
    ['Radiohead Cover.mp3', 'original'],
  ])('%s is %s', (fileName, label) => {
    expect(guessVersionLabel(fileName)).toBe(label);
  });

  it('only accepts labels the product knows', () => {
    expect(isKnownVersionLabel('radio_edit')).toBe(true);
    expect(isKnownVersionLabel('remix')).toBe(false);
    expect(isKnownVersionLabel(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The upload itself
// ─────────────────────────────────────────────────────────────────────────────

const audio = (name = 'Lagos Nights.mp3', type = 'audio/mpeg', size = 2048) =>
  new File([new Uint8Array(size)], name, { type });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const VERSION = {
  id: 'v1',
  songId: 's1',
  label: 'original',
  fileName: 'Lagos Nights.mp3',
  durationSeconds: 210,
  createdAt: '2026-09-25T10:00:00.000Z',
};

/** A fake server: answers the two POSTs in order, and records what was sent. */
function fakeServer(responses: Array<Response | Error>) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body || '{}')) });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const okPut: PutFile = async ({ onProgress }) => {
  onProgress?.(0.5);
  return { ok: true, status: 200 };
};

describe('uploadSongFile', () => {
  it('signs, uploads and records the file, and reports progress from start to finish', async () => {
    const { fetchImpl, calls } = fakeServer([
      json(200, { signedUrl: 'https://storage/upload', storagePath: 'song/s1/abc.mp3' }),
      json(201, { version: VERSION }),
    ]);
    const progress: number[] = [];
    const outcome = await uploadSongFile({
      songId: 's1',
      file: audio(),
      token: 'tok',
      durationSeconds: 209.6,
      onProgress: (fraction) => progress.push(fraction),
      fetchImpl,
      putImpl: okPut,
      retryDelayMs: 0,
    });

    expect(outcome).toEqual({ ok: true, file: VERSION });
    expect(progress).toEqual([0, 0.5, 1]);
    expect(calls[0]).toEqual({
      url: '/api/songs/s1/versions/upload-url',
      body: { fileName: 'Lagos Nights.mp3', mimeType: 'audio/mpeg', fileSize: 2048 },
    });
    expect(calls[1].url).toBe('/api/songs/s1/versions');
    expect(calls[1].body).toMatchObject({ storagePath: 'song/s1/abc.mp3', label: 'original', durationSeconds: 210 });
  });

  it('sends a FLAC that Windows gave no type as a FLAC', async () => {
    const { fetchImpl, calls } = fakeServer([
      json(200, { signedUrl: 'https://storage/upload', storagePath: 'song/s1/abc.flac' }),
      json(201, { version: VERSION }),
    ]);
    const put = vi.fn(okPut);
    await uploadSongFile({
      songId: 's1',
      file: audio('Master.flac', ''),
      token: 'tok',
      fetchImpl,
      putImpl: put,
      retryDelayMs: 0,
    });
    expect(calls[0].body.mimeType).toBe('audio/flac');
    expect(put.mock.calls[0][0].contentType).toBe('audio/flac');
  });

  it('labels the file from its name unless told otherwise', async () => {
    for (const [name, given, expected] of [
      ['Lagos_Nights_Instrumental.wav', undefined, 'instrumental'],
      ['Lagos Nights.wav', 'clean', 'clean'],
    ] as const) {
      const { fetchImpl, calls } = fakeServer([
        json(200, { signedUrl: 'u', storagePath: 'p' }),
        json(201, { version: VERSION }),
      ]);
      await uploadSongFile({
        songId: 's1',
        file: audio(name, 'audio/wav'),
        token: 'tok',
        label: given,
        fetchImpl,
        putImpl: okPut,
        retryDelayMs: 0,
      });
      expect(calls[1].body.label).toBe(expected);
    }
  });

  it('sends no length rather than zero when the browser could not read one', async () => {
    for (const durationSeconds of [null, undefined, 0, -3, Number.NaN]) {
      const { fetchImpl, calls } = fakeServer([
        json(200, { signedUrl: 'u', storagePath: 'p' }),
        json(201, { version: VERSION }),
      ]);
      await uploadSongFile({
        songId: 's1',
        file: audio(),
        token: 'tok',
        durationSeconds,
        fetchImpl,
        putImpl: okPut,
        retryDelayMs: 0,
      });
      expect(calls[1].body.durationSeconds).toBeNull();
    }
  });

  it('refuses a file it cannot take before anything leaves the device', async () => {
    const { fetchImpl } = fakeServer([]);
    const outcome = await uploadSongFile({
      songId: 's1',
      file: audio('Notes.txt', 'text/plain'),
      token: 'tok',
      fetchImpl,
      putImpl: okPut,
    });
    expect(outcome).toEqual({
      ok: false,
      step: 1,
      error: 'That is not an audio file a DJ can load. Use MP3, WAV, AIFF, FLAC or M4A.',
      retryable: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [json(413, { error: 'That file is over 40 MB. Send an MP3 rather than a WAV master.' }), false],
    [json(403, { error: 'You can only view this song.' }), false],
    [json(500, {}), true],
    [json(200, { signedUrl: 'u' }), false], // an answer with no storage path is not an answer
  ])('stops at step 1 on a refusal, and says whether trying again could help', async (response, retryable) => {
    const { fetchImpl } = fakeServer([response]);
    const put = vi.fn(okPut);
    const outcome = await uploadSongFile({ songId: 's1', file: audio(), token: 'tok', fetchImpl, putImpl: put });
    expect(outcome).toMatchObject({ ok: false, step: 1, retryable });
    expect(put).not.toHaveBeenCalled();
  });

  it('shows the server’s own sentence when it gives one', async () => {
    const { fetchImpl } = fakeServer([json(403, { error: 'You can only view this song.' })]);
    const outcome = await uploadSongFile({ songId: 's1', file: audio(), token: 'tok', fetchImpl, putImpl: okPut });
    expect(outcome).toMatchObject({ error: 'You can only view this song.' });
  });

  it('says to check the connection when the server cannot be reached', async () => {
    const { fetchImpl } = fakeServer([new TypeError('Failed to fetch')]);
    const outcome = await uploadSongFile({ songId: 's1', file: audio(), token: 'tok', fetchImpl, putImpl: okPut });
    expect(outcome).toEqual({
      ok: false,
      step: 1,
      error: 'Couldn’t reach the server. Check your connection and try again.',
      retryable: true,
    });
  });

  it.each([
    ['a failed upload', async () => ({ ok: false, status: 403 })],
    [
      'a dropped connection',
      async () => {
        throw new Error('network');
      },
    ],
  ])('stops at step 2 on %s and records nothing', async (_name, put) => {
    const { fetchImpl, calls } = fakeServer([json(200, { signedUrl: 'u', storagePath: 'p' })]);
    const outcome = await uploadSongFile({
      songId: 's1',
      file: audio(),
      token: 'tok',
      fetchImpl,
      putImpl: put as PutFile,
    });
    expect(outcome).toMatchObject({ ok: false, step: 2, retryable: true });
    expect(calls).toHaveLength(1);
  });

  it('records the file on the second try when the first save fails', async () => {
    const { fetchImpl, calls } = fakeServer([
      json(200, { signedUrl: 'u', storagePath: 'p' }),
      json(500, {}),
      json(201, { version: VERSION }),
    ]);
    const outcome = await uploadSongFile({
      songId: 's1',
      file: audio(),
      token: 'tok',
      fetchImpl,
      putImpl: okPut,
      retryDelayMs: 0,
    });
    expect(outcome).toEqual({ ok: true, file: VERSION });
    expect(calls).toHaveLength(3);
  });

  it('gives up after the second save fails, and says the file did go up', async () => {
    const { fetchImpl, calls } = fakeServer([
      json(200, { signedUrl: 'u', storagePath: 'p' }),
      json(500, {}),
      new TypeError('Failed to fetch'),
    ]);
    const outcome = await uploadSongFile({
      songId: 's1',
      file: audio(),
      token: 'tok',
      fetchImpl,
      putImpl: okPut,
      retryDelayMs: 0,
    });
    expect(outcome).toMatchObject({ ok: false, step: 3, retryable: true });
    expect(calls).toHaveLength(3);
  });

  it('shows the server’s reason when it refuses to save the file', async () => {
    const { fetchImpl } = fakeServer([
      json(200, { signedUrl: 'u', storagePath: 'p' }),
      json(400, { error: 'That upload is not this song’s.' }),
      json(400, { error: 'That upload is not this song’s.' }),
    ]);
    const outcome = await uploadSongFile({
      songId: 's1',
      file: audio(),
      token: 'tok',
      fetchImpl,
      putImpl: okPut,
      retryDelayMs: 0,
    });
    expect(outcome).toMatchObject({ ok: false, step: 3, error: 'That upload is not this song’s.' });
  });

  it('carries the token on every call to the server', async () => {
    const { fetchImpl } = fakeServer([
      json(200, { signedUrl: 'u', storagePath: 'p' }),
      json(201, { version: VERSION }),
    ]);
    await uploadSongFile({ songId: 's1', file: audio(), token: 'secret', fetchImpl, putImpl: okPut, retryDelayMs: 0 });
    for (const call of (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect((call[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer secret' });
    }
  });
});

describe('the song catalog', () => {
  it.each([
    [{}, 'What is the song called?'],
    [{ title: '   ' }, 'What is the song called?'],
    [{ title: 'x'.repeat(201) }, 'That title is too long.'],
    [{ title: 'A', durationSeconds: 0 }, 'How long is it? Give a length under twenty minutes.'],
    [{ title: 'A', durationSeconds: 1201 }, 'How long is it? Give a length under twenty minutes.'],
    [{ title: 'A', durationSeconds: 3.5 }, 'How long is it? Give a length under twenty minutes.'],
    [{ title: 'A', bpm: 0 }, 'That BPM is not a real tempo.'],
    [{ title: 'A', bpm: 400 }, 'That BPM is not a real tempo.'],
    [{ title: 'A', bpm: 120.5 }, 'That BPM is not a real tempo.'],
    [{ title: 'A', musicalKey: 7 }, 'That key is not text.'],
    [{ title: 'A', musicalKey: 'x'.repeat(17) }, 'Keep the key short, like F#m or 11B.'],
  ])('refuses %j: %s', (input, message) => {
    expect(parseSongCreate(input).errors.map((error) => error.message)).toContain(message);
  });

  it('adds a song with only a title, and trims what it keeps', () => {
    expect(parseSongCreate({ title: '  Lagos Nights  ' })).toEqual({ errors: [], columns: { title: 'Lagos Nights' } });
    expect(parseSongCreate({ title: 'A', durationSeconds: 210, bpm: 102, musicalKey: ' F#m ' }).columns).toEqual({
      title: 'A',
      duration_seconds: 210,
      bpm: 102,
      musical_key: 'F#m',
    });
  });

  it('edits only what was sent, clears with null, and refuses an empty edit', () => {
    expect(parseSongPatch({ bpm: 98 })).toEqual({ errors: [], columns: { bpm: 98 } });
    expect(parseSongPatch({ durationSeconds: null, musicalKey: '' }).columns).toEqual({
      duration_seconds: null,
      musical_key: null,
    });
    expect(parseSongPatch({}).errors).toEqual([{ field: 'body', message: 'Nothing to save.' }]);
    expect(parseSongPatch({ title: '' }).errors[0].field).toBe('title');
  });

  it.each([
    [[], 'This song is in a set. Take it out of the set first.'],
    [['   '], 'This song is in a set. Take it out of the set first.'],
    [['Flytime Fest'], 'This song is in the set for Flytime Fest. Take it out there first.'],
    [['Flytime Fest', 'Flytime Fest'], 'This song is in the set for Flytime Fest. Take it out there first.'],
    [['Flytime Fest', 'Detty December'], 'This song is in the sets for Flytime Fest and Detty December. Take it out there first.'],
    [
      ['Day 1', 'Day 2', 'Day 3'],
      'This song is in the sets for Day 1, Day 2 and 1 more. Take it out there first.',
    ],
    [
      ['Day 1', 'Day 2', 'Day 3', 'Day 4'],
      'This song is in the sets for Day 1, Day 2 and 2 more. Take it out there first.',
    ],
  ])('names where a song is used when it cannot be deleted: %j', (titles, sentence) => {
    expect(describeSongInUse(titles)).toBe(sentence);
  });
});
