import { describe, expect, it } from 'vitest';
import { buildImportPreview, countImport, noteBodyFor, MAX_IMPORT_ITEMS } from './build';
import { classifyText, extractNairaAmounts, looksLikeLyrics } from './detect';
import { matchRelease } from './match';
import { isWhatsAppExport, parseWhatsApp } from './whatsapp';

const ANDROID = [
  '03/10/2025, 09:12 - Messages and calls are end-to-end encrypted.',
  '03/10/2025, 09:14 - Tobi: Send final master to the distributor by 8 Nov',
  '03/10/2025, 09:15 - Tobi: <Media omitted>',
  '05/10/2025, 18:02 - You: Video shoot, Saturday 19 Oct',
  'bring the red jacket',
  '09/10/2025, 11:30 - Tobi: ok',
].join('\n');

const IOS = [
  '[13/10/2025, 14:32:05] Tobi: ₦350,000 for the cover art',
  '[13/10/2025, 14:33:10] Kemi: ‎image omitted',
].join('\n');

describe('parseWhatsApp', () => {
  it('reads Android lines, joins continuations and skips system and media lines', () => {
    expect(isWhatsAppExport(ANDROID)).toBe(true);
    const chat = parseWhatsApp(ANDROID);
    expect(chat.messages.map((m) => m.author)).toEqual(['Tobi', 'You', 'Tobi']);
    expect(chat.messages[1].text).toBe('Video shoot, Saturday 19 Oct\nbring the red jacket');
    expect(chat.mediaSkipped).toBe(1);
    expect(chat.authors[0]).toEqual({ name: 'Tobi', count: 2 });
  });

  it('reads iPhone lines', () => {
    const chat = parseWhatsApp(IOS);
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0].at).toBe('2025-10-13T14:32:00.000Z');
    expect(chat.mediaSkipped).toBe(1);
  });

  it('defaults to day-first and flips to month-first when a month-first date proves it', () => {
    const dayFirst = parseWhatsApp('03/10/2025, 09:14 - A: hello there friend\n04/10/2025, 09:14 - A: again');
    expect(dayFirst.messages[0].at?.slice(0, 10)).toBe('2025-10-03');
    const monthFirst = parseWhatsApp('10/03/2025, 9:14 PM - A: hello there friend\n10/25/2025, 9:14 AM - A: again');
    expect(monthFirst.messages[0].at).toBe('2025-10-03T21:14:00.000Z');
  });

  it('does not treat ordinary text as an export', () => {
    expect(isWhatsAppExport('Lagos rain, we dey move\nAjegunle to the island')).toBe(false);
  });
});

describe('classifyText', () => {
  it('drops chatter and fragments', () => {
    expect(classifyText('ok')).toBeNull();
    expect(classifyText('😂😂')).toBeNull();
    expect(classifyText('lol thanks')).toBeNull();
    expect(classifyText('see you')).toBeNull();
  });

  it('labels to-dos, dates and money', () => {
    expect(classifyText('Send final master to the distributor by 8 Nov')?.kind).toBe('todo');
    expect(classifyText('Video shoot, Saturday 19 Oct')?.kind).toBe('date');
    const money = classifyText('₦350,000 for the cover art');
    expect(money?.kind).toBe('money');
    expect(money?.amounts).toEqual([350000]);
  });

  it('keeps a substantial plain thought as an idea', () => {
    expect(classifyText('A Detty December drop with visuals shot in Ajegunle')?.kind).toBe('idea');
  });

  it('finds lyrics from line shape or a marker', () => {
    const lyrics = 'Lagos rain, we dey move\nAjegunle to the island\nNo be small thing\nNa the whole city sing';
    expect(looksLikeLyrics(lyrics)).toBe(true);
    expect(classifyText(lyrics)?.kind).toBe('song');
    expect(looksLikeLyrics('[Chorus]\nOne line')).toBe(true);
    expect(looksLikeLyrics('Pay Tobi\nCall Kemi\nBook studio\nPrint flyers')).toBe(true);
  });
});

describe('extractNairaAmounts', () => {
  it('reads the ways people write naira', () => {
    expect(extractNairaAmounts('₦350,000')).toEqual([350000]);
    expect(extractNairaAmounts('N350k for cover')).toEqual([350000]);
    expect(extractNairaAmounts('2m naira budget')).toEqual([2000000]);
    expect(extractNairaAmounts('350,000 naira')).toEqual([350000]);
    expect(extractNairaAmounts('call 2 people')).toEqual([]);
  });
});

describe('matchRelease', () => {
  const releases = [
    { id: 'a', title: 'Lagos Rain' },
    { id: 'b', title: 'Detty Season EP' },
    { id: 'c', title: 'Detty Remix' },
    { id: 'd', title: 'Untitled release' },
  ];

  it('answers only when exactly one release matches', () => {
    expect(matchRelease('Master for lagos rain is ready', releases)).toEqual({ kind: 'one', release: releases[0] });
    expect(matchRelease('Nothing to see', releases)).toEqual({ kind: 'none' });
  });

  it('returns candidates when two match and never guesses', () => {
    const twins = [...releases, { id: 'e', title: 'Lagos Rain' }];
    expect(matchRelease('Master for lagos rain is ready', twins).kind).toBe('many');
    expect(matchRelease('Detty Season EP needs a cover', releases).kind).toBe('one');
    expect(matchRelease('Detty needs a cover', releases).kind).toBe('none');
  });

  it('ignores generic titles', () => {
    expect(matchRelease('this untitled release is late', releases).kind).toBe('none');
  });
});

describe('buildImportPreview', () => {
  const releases = [{ id: 'a', title: 'Lagos Rain' }];

  it('sorts a chat into items, newest first, and counts them', () => {
    const preview = buildImportPreview(ANDROID, releases);
    expect(preview.source).toBe('whatsapp');
    expect(preview.items.map((i) => i.kind)).toEqual(['date', 'todo']);
    expect(preview.mediaSkipped).toBe(1);
    const counts = countImport(preview.items);
    expect(counts.todos).toBe(1);
    expect(counts.dates).toBe(2);
  });

  it('splits pasted text into blocks and bullet lists into separate items', () => {
    const preview = buildImportPreview(
      '- Send the master to Tobi\n- Pay for cover art ₦350k\n\nLagos rain hook idea for the new single drop',
      releases
    );
    expect(preview.source).toBe('text');
    expect(preview.items).toHaveLength(3);
    expect(preview.items[2].releaseId).toBe('a');
  });

  it('keeps one-per-message lyrics together as a single song', () => {
    const chat = [
      '01/10/2025, 10:00 - You: Lagos rain, we dey move',
      '01/10/2025, 10:01 - You: Ajegunle to the island',
      '01/10/2025, 10:01 - You: No be small thing',
      '01/10/2025, 10:02 - You: Na the whole city sing',
    ].join('\n');
    const preview = buildImportPreview(chat, []);
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0].kind).toBe('song');
  });

  it('caps one import and says so', () => {
    const lines = Array.from({ length: MAX_IMPORT_ITEMS + 20 }, (_, i) => `Send file number ${i} to the studio`).join('\n\n');
    const preview = buildImportPreview(lines, []);
    expect(preview.items).toHaveLength(MAX_IMPORT_ITEMS);
    expect(preview.truncated).toBe(true);
  });

  it('writes the note with its source under the text', () => {
    const preview = buildImportPreview(ANDROID, releases);
    const body = noteBodyFor(preview.items[1], 'whatsapp');
    expect(body).toBe('Send final master to the distributor by 8 Nov\n\nTobi · WhatsApp · 3 Oct 2025');
  });
});

import { parseCommitPayload } from "./commit";

describe("parseCommitPayload", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const release = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts good items and clears a time in the future", () => {
    const result = parseCommitPayload(
      { source: "whatsapp", items: [{ body: "Send the master", releaseId: release, at: "2025-10-03T09:14:00Z" }, { body: "Later", releaseId: null, at: "2030-01-01T00:00:00Z" }] },
      now
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items[0].at).toBe("2025-10-03T09:14:00.000Z");
      expect(result.value.items[1].at).toBeNull();
    }
  });

  it("refuses empty batches, empty notes, bad ids and oversized batches", () => {
    expect(parseCommitPayload({ items: [] }, now).ok).toBe(false);
    expect(parseCommitPayload({ items: [{ body: "  " }] }, now).ok).toBe(false);
    expect(parseCommitPayload({ items: [{ body: "x", releaseId: "nope" }] }, now).ok).toBe(false);
    const many = Array.from({ length: MAX_IMPORT_ITEMS + 1 }, () => ({ body: "x" }));
    expect(parseCommitPayload({ items: many }, now).ok).toBe(false);
  });
});
