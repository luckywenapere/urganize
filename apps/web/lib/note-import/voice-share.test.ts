import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVoicePreview, noteBodyFor } from './build';
import { normalizeVoiceFile } from './client';
import { parseCommitPayload } from './commit';
import { classifySharedFile, sharedText } from './share';
import { validateVoiceClip } from '@/lib/urgans-voice';

describe('voice notes', () => {
  it('renames a WhatsApp .opus to .ogg so the speech model and our own check accept it', () => {
    const opus = new File([new Uint8Array([1, 2, 3])], 'PTT-20251003-WA0012.opus', { type: 'audio/opus' });
    const fixed = normalizeVoiceFile(opus);
    expect(fixed.name).toBe('PTT-20251003-WA0012.ogg');
    expect(fixed.type).toBe('audio/ogg');
    expect(validateVoiceClip({ mimeType: fixed.type, size: fixed.size }).ok).toBe(true);
  });

  it('fills a blank type from the extension and leaves good files alone', () => {
    const blank = new File([new Uint8Array([1])], 'note.m4a', { type: '' });
    expect(normalizeVoiceFile(blank).type).toBe('audio/mp4');
    const good = new File([new Uint8Array([1])], 'note.mp3', { type: 'audio/mpeg' });
    expect(normalizeVoiceFile(good)).toBe(good);
  });

  it('keeps each transcript whole, dated by when it was recorded, newest first', () => {
    const preview = buildVoicePreview(
      [
        { text: 'I want to drop Lagos Rain before Detty December and shoot the video in Ajegunle', at: '2025-10-03T09:00:00.000Z' },
        { text: 'Send the master to Tobi by 8 Nov', at: '2025-10-05T09:00:00.000Z' },
        { text: '   ', at: null },
      ],
      [{ id: 'a', title: 'Lagos Rain' }]
    );
    expect(preview.source).toBe('voice');
    expect(preview.items).toHaveLength(2);
    expect(preview.items[0].kind).toBe('todo');
    expect(preview.items[1].releaseId).toBe('a');
    expect(noteBodyFor(preview.items[0], 'voice')).toBe('Send the master to Tobi by 8 Nov\n\nVoice note · 5 Oct 2025');
  });

  it('keeps a short spoken thought instead of dropping it', () => {
    expect(buildVoicePreview([{ text: 'Hook idea', at: null }], []).items).toHaveLength(1);
  });

  it('accepts voice as a source when saving', () => {
    const result = parseCommitPayload({ source: 'voice', items: [{ body: 'x', releaseId: null, at: null }] });
    expect(result.ok && result.value.source).toBe('voice');
  });
});

describe('share sheet', () => {
  it('sorts shared files by what they are', () => {
    expect(classifySharedFile({ name: 'WhatsApp Chat with Tobi.zip', type: 'application/zip' })).toBe('text');
    expect(classifySharedFile({ name: 'chat.txt', type: 'text/plain' })).toBe('text');
    expect(classifySharedFile({ name: 'PTT-1.opus', type: '' })).toBe('voice');
    expect(classifySharedFile({ name: 'a.m4a', type: 'audio/mp4' })).toBe('voice');
    expect(classifySharedFile({ name: 'IMG_1.jpg', type: 'image/jpeg' })).toBe('photo');
    expect(classifySharedFile({ name: 'x.exe', type: 'application/octet-stream' })).toBeNull();
  });

  it('joins title, text and link without repeating', () => {
    expect(sharedText({ text: 'Send the master' })).toBe('Send the master');
    expect(sharedText({ title: 'Send the master', text: 'Send the master' })).toBe('Send the master');
    expect(sharedText({ title: 'Note', text: 'Body', url: 'https://x.test' })).toBe('Note\nBody\nhttps://x.test');
  });

  it('is wired to both service workers and the manifest', () => {
    const root = process.cwd();
    for (const worker of ['public/sw.js', 'public/sw-offline.js']) {
      expect(readFileSync(join(root, worker), 'utf8')).toContain("importScripts('/sw-share-target.js')");
    }
    const manifest = readFileSync(join(root, 'app/manifest.ts'), 'utf8');
    expect(manifest).toContain("action: '/share-target'");
    const worker = readFileSync(join(root, 'public/sw-share-target.js'), 'utf8');
    expect(worker).toContain("url.pathname !== '/share-target'");
    // The page reads from the same cache the worker writes to.
    expect(worker).toContain("'urganize-share-v1'");
  });
});
