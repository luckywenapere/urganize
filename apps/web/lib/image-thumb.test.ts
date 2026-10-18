import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { THUMB_EDGE_PX, isThumbablePath, thumbPathFor, withThumbPaths } from './image-thumb';
import { thumbGeometry, uploadThumb } from './image-thumb-client';
import { generateThumbSignedUrls } from './asset-helpers';

const read = (relative: string) => readFileSync(join(__dirname, '..', relative), 'utf8');

describe('image thumb paths', () => {
  it('puts the thumb next to the original', () => {
    expect(thumbPathFor('rel/cover_art/abc-IMG_7983.png')).toBe('rel/cover_art/abc-IMG_7983.png.thumb');
  });

  it('adds a thumb only for images, never for a thumb itself or audio', () => {
    expect(isThumbablePath('a/b.JPG')).toBe(true);
    expect(isThumbablePath('a/b.png.thumb')).toBe(false);
    expect(isThumbablePath('a/song.wav')).toBe(false);
    expect(withThumbPaths(['a/b.png', 'a/song.wav', '', 'a/b.png'])).toEqual([
      'a/b.png',
      'a/b.png.thumb',
      'a/song.wav',
    ]);
  });

  it('crops a centre square and never enlarges', () => {
    expect(thumbGeometry(3000, 2000)).toEqual({ sx: 500, sy: 0, side: 2000, out: THUMB_EDGE_PX });
    expect(thumbGeometry(200, 300)).toEqual({ sx: 0, sy: 50, side: 200, out: 200 });
    expect(thumbGeometry(0, 10)).toBeNull();
  });

  it('a thumb never blocks an upload: no url or no DOM resolves false without fetching', async () => {
    const fetchImpl = vi.fn();
    await expect(uploadThumb(null, new Blob(['x']), fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
    await expect(uploadThumb('https://x/upload', new Blob(['x']), fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('generateThumbSignedUrls', () => {
  it('signs thumbs in one batch, keyed by original path, and skips missing ones', async () => {
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) =>
        path.startsWith('has/')
          ? { path, error: null, signedUrl: `https://cdn/${path}?token=t` }
          : { path, error: 'Either the object does not exist', signedUrl: null }
      ),
      error: null,
    }));
    const client = { storage: { from: () => ({ createSignedUrls }) } } as never;

    const urls = await generateThumbSignedUrls(client, 'release-assets', ['has/a.png', 'old/b.png'], 3600);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0][0]).toEqual(['has/a.png.thumb', 'old/b.png.thumb']);
    expect(urls.get('has/a.png')).toBe('https://cdn/has/a.png.thumb?token=t');
    expect(urls.has('old/b.png')).toBe(false);

    // Cached hit and remembered miss: no second storage call.
    const again = await generateThumbSignedUrls(client, 'release-assets', ['has/a.png', 'old/b.png'], 3600);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(again.get('has/a.png')).toBe('https://cdn/has/a.png.thumb?token=t');
  });

  it('never throws when storage fails', async () => {
    const client = {
      storage: { from: () => ({ createSignedUrls: async () => { throw new Error('down'); } }) },
    } as never;
    await expect(generateThumbSignedUrls(client, 'b', ['x/c.png'], 60)).resolves.toEqual(new Map());
  });
});

describe('thumbnail surfaces (guard)', () => {
  it('small cover slots read the thumb and never paint through next/image', () => {
    const files = [
      'app/dashboard/artists/[artistId]/ArtistPageClient.tsx',
      'app/dashboard/distribute/DistributePageClient.tsx',
      'components/chappi/ChappiScopePicker.tsx',
      'components/notes/NoteReleasePicker.tsx',
      'components/notes/NotesList.tsx',
      'components/shared/ReleaseCombobox.tsx',
      'components/workspace/CatalogueView.tsx',
      'components/share/ShareSheet.tsx',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source, file).toContain('<ThumbImage');
      expect(source, file).toMatch(/coverThumbUrl/);
      expect(source, file).not.toMatch(/<Image\s+src=\{[^}]*coverArtUrl/);
    }
  });

  it('ThumbImage stays hidden until decoded, lazy, async, sized', () => {
    const source = read('components/shared/ThumbImage.tsx');
    expect(source).toContain('loading="lazy"');
    expect(source).toContain('decoding="async"');
    expect(source).toContain('.decode()');
    expect(source).toMatch(/ready \? 'opacity-100' : 'opacity-0'/);
    expect(source).toMatch(/width=\{width\}/);
  });

  it('faces read through ThumbImage and the face batches prefer thumbs', () => {
    expect(read('components/shared/ProfileFace.tsx')).toContain('<ThumbImage');
    expect(read('lib/profile-photo-server.ts')).toContain('generateThumbSignedUrls');
  });
});
