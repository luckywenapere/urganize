import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every small face reads its 384px copy (lib/image-thumb.ts), founder ask
 * 2026-10-18: "Same thing for profile photos" after the cover-art fix (URG-363).
 * Large views (the edit previews, the public curator and person heroes, the
 * share card) keep the original on purpose.
 */
const read = (relative: string) => readFileSync(join(__dirname, '..', relative), 'utf8');

describe('profile photos load from their thumb', () => {
  it('curator photo uploads make a thumb', () => {
    expect(read('app/api/curator/profile/photo/route.ts')).toContain('thumb_upload_url: await signThumbUploadUrl(');
    expect(read('app/curator/profile/CuratorProfilePageClient.tsx')).toContain('uploadThumb(signPayload.thumb_upload_url, upload)');
  });

  it('the Pitch screen curator faces prefer the thumb', () => {
    const source = read('app/api/pitching/_shared.ts');
    const body = source.slice(source.indexOf('export async function loadCuratorPhotoUrls'));
    expect(body).toContain('generateThumbSignedUrls(');
  });

  it('relationship faces prefer the thumb', () => {
    const source = read('lib/relationships-server.ts');
    expect(source).toContain('signPhotoPathsPreferThumb(admin, rows)');
    expect(source).not.toContain('signPhotoPath(');
  });

  it('the person page managed faces use thumbs, the share card keeps originals', () => {
    expect(read('app/p/[slug]/page.tsx')).toContain('{ thumbs: true }');
    expect(read('app/p/[slug]/card/route.tsx')).not.toContain('thumbs: true');
  });

  it('small faces fade in through ThumbImage', () => {
    for (const file of ['app/p/[slug]/page.tsx', 'app/k/[slug]/page.tsx', 'components/tasks/TaskMemberSelect.tsx']) {
      expect(read(file)).toContain('<ThumbImage');
    }
  });
});
