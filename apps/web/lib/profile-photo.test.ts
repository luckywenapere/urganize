import { describe, expect, it } from 'vitest';
import {
  artistPhotoPathPrefix,
  isOwnPhotoPath,
  isProfilePhotoMimeType,
  parsePhotoPathInput,
  personPhotoPathPrefix,
} from './profile-photo';

describe('profile photo paths', () => {
  const prefix = artistPhotoPathPrefix('a1');

  it('accepts a file inside the owner prefix', () => {
    expect(isOwnPhotoPath('artist/a1/photo/x-face.jpg', prefix)).toBe(true);
  });

  it('refuses another owner, traversal and bare prefixes', () => {
    expect(isOwnPhotoPath('artist/a2/photo/x.jpg', prefix)).toBe(false);
    expect(isOwnPhotoPath('artist/a1/photo/../../a2/photo/x.jpg', prefix)).toBe(false);
    expect(isOwnPhotoPath('artist/a1/photo/', prefix)).toBe(false);
    expect(isOwnPhotoPath(42, prefix)).toBe(false);
  });

  it('keeps people and artists in separate folders', () => {
    expect(isOwnPhotoPath('artist/u1/photo/x.jpg', personPhotoPathPrefix('u1'))).toBe(false);
  });

  it('parses set, clear, absent and foreign paths', () => {
    expect(parsePhotoPathInput({}, prefix)).toEqual({ kind: 'absent' });
    expect(parsePhotoPathInput({ photoPath: null }, prefix)).toEqual({ kind: 'clear' });
    expect(parsePhotoPathInput({ photoPath: 'artist/a1/photo/x.png' }, prefix)).toEqual({
      kind: 'set',
      path: 'artist/a1/photo/x.png',
    });
    expect(parsePhotoPathInput({ photoPath: 'artist/zz/photo/x.png' }, prefix).kind).toBe('error');
  });

  it('takes only image formats a browser can show', () => {
    expect(isProfilePhotoMimeType('image/webp')).toBe(true);
    expect(isProfilePhotoMimeType('image/gif')).toBe(false);
  });
});
