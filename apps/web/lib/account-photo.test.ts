import { describe, expect, it } from 'vitest';
import {
  withoutSignedPhotos,
  BROKEN_PHOTO_RETRY_MS,
  mayRetryBrokenPhoto,
  ACCOUNT_PHOTO_REFRESH_MS,
  accountPhotoPathPrefix,
  googlePictureFromIdentities,
  isAllowedGooglePhotoUrl,
  isOwnAccountPhotoPath,
  normalizePhotoContentType,
  parseAccountPhotoInput,
  shouldOfferInvitePhoto,
  shouldRefreshAccountPhoto,
  upsizeGooglePhotoUrl,
} from './account-photo';

const UID = '3f1c2d4e-1111-2222-3333-444455556666';
const OTHER = '9a9a9a9a-1111-2222-3333-444455556666';
const own = `account/${UID}/photo/0b7e-photo.jpg`;

describe('accountPhotoPathPrefix', () => {
  it('keeps the account photo apart from the directory photo', () => {
    expect(accountPhotoPathPrefix(UID)).toBe(`account/${UID}/photo/`);
    expect(accountPhotoPathPrefix(UID).startsWith('person/')).toBe(false);
  });
});

describe('isOwnAccountPhotoPath', () => {
  it('accepts a file directly under your own folder', () => {
    expect(isOwnAccountPhotoPath(own, UID)).toBe(true);
  });

  it('refuses traversal out of the folder', () => {
    expect(isOwnAccountPhotoPath(`account/${UID}/photo/../../person/${UID}/avatar/x.jpg`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(`account/${UID}/photo/..`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(`account/${UID}/photo/%2e%2e/x.jpg`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(`account/${UID}/photo/a\\..\\b.jpg`, UID)).toBe(false);
  });

  it('refuses another user and other prefixes', () => {
    expect(isOwnAccountPhotoPath(`account/${OTHER}/photo/x.jpg`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(`person/${UID}/avatar/x.jpg`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(`artist/${UID}/photo/x.jpg`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(`/account/${UID}/photo/x.jpg`, UID)).toBe(false);
  });

  it('refuses a user id that is a prefix of a longer one', () => {
    expect(isOwnAccountPhotoPath(`account/${UID}x/photo/x.jpg`, UID)).toBe(false);
  });

  it('refuses nested folders, the bare folder, thumbs and junk', () => {
    expect(isOwnAccountPhotoPath(`account/${UID}/photo/sub/x.jpg`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(`account/${UID}/photo/`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(`${own}.thumb`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(`account/${UID}/photo/x y.jpg`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(`account/${UID}/photo/${'a'.repeat(300)}`, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(null, UID)).toBe(false);
    expect(isOwnAccountPhotoPath(42, UID)).toBe(false);
  });

  it('refuses everything when the user id is empty or has a slash', () => {
    expect(isOwnAccountPhotoPath('account//photo/x.jpg', '')).toBe(false);
    expect(isOwnAccountPhotoPath(`account/a/b/photo/x.jpg`, 'a/b')).toBe(false);
  });
});

describe('parseAccountPhotoInput', () => {
  it('reads set, clear, absent and refuses others', () => {
    expect(parseAccountPhotoInput({ photoPath: own }, UID)).toEqual({ kind: 'set', path: own });
    expect(parseAccountPhotoInput({ photoPath: null }, UID)).toEqual({ kind: 'clear' });
    expect(parseAccountPhotoInput({}, UID)).toEqual({ kind: 'absent' });
    expect(parseAccountPhotoInput(null, UID)).toEqual({ kind: 'absent' });
    expect(parseAccountPhotoInput({ photoPath: `account/${OTHER}/photo/x.jpg` }, UID).kind).toBe('error');
    expect(parseAccountPhotoInput({ photoPath: 7 }, UID).kind).toBe('error');
  });
});

describe('isAllowedGooglePhotoUrl', () => {
  it('allows https googleusercontent hosts', () => {
    expect(isAllowedGooglePhotoUrl('https://lh3.googleusercontent.com/a/ACg8ocJ=s96-c')).toBe(true);
  });

  it('refuses http, other hosts and look-alikes', () => {
    expect(isAllowedGooglePhotoUrl('http://lh3.googleusercontent.com/a/x')).toBe(false);
    expect(isAllowedGooglePhotoUrl('https://googleusercontent.com/a/x')).toBe(false);
    expect(isAllowedGooglePhotoUrl('https://evil.com/lh3.googleusercontent.com/x')).toBe(false);
    expect(isAllowedGooglePhotoUrl('https://lh3.googleusercontent.com.evil.com/x')).toBe(false);
    expect(isAllowedGooglePhotoUrl('https://evilgoogleusercontent.com/x')).toBe(false);
    expect(isAllowedGooglePhotoUrl('https://169.254.169.254/latest')).toBe(false);
  });

  it('refuses credentials, odd ports and junk', () => {
    expect(isAllowedGooglePhotoUrl('https://user:pw@lh3.googleusercontent.com/x')).toBe(false);
    expect(isAllowedGooglePhotoUrl('https://lh3.googleusercontent.com:8443/x')).toBe(false);
    expect(isAllowedGooglePhotoUrl('not a url')).toBe(false);
    expect(isAllowedGooglePhotoUrl(undefined)).toBe(false);
    expect(isAllowedGooglePhotoUrl('')).toBe(false);
  });
});

describe('upsizeGooglePhotoUrl', () => {
  it('asks Google for a 512px square instead of 96px', () => {
    expect(upsizeGooglePhotoUrl('https://lh3.googleusercontent.com/a/ACg8=s96-c')).toBe(
      'https://lh3.googleusercontent.com/a/ACg8=s512-c'
    );
  });
  it('leaves other shapes alone', () => {
    expect(upsizeGooglePhotoUrl('https://lh3.googleusercontent.com/a/ACg8')).toBe(
      'https://lh3.googleusercontent.com/a/ACg8'
    );
  });
});

describe('googlePictureFromIdentities', () => {
  it('reads the google identity picture, then avatar_url', () => {
    const url = 'https://lh3.googleusercontent.com/a/x=s96-c';
    expect(googlePictureFromIdentities([{ provider: 'google', identity_data: { picture: url } }])).toBe(
      'https://lh3.googleusercontent.com/a/x=s512-c'
    );
    expect(googlePictureFromIdentities([{ provider: 'google', identity_data: { avatar_url: url } }])).toBe(
      'https://lh3.googleusercontent.com/a/x=s512-c'
    );
  });

  it('ignores other providers and urls that fail the allowlist', () => {
    expect(
      googlePictureFromIdentities([{ provider: 'email', identity_data: { picture: 'https://lh3.googleusercontent.com/a' } }])
    ).toBeNull();
    expect(
      googlePictureFromIdentities([{ provider: 'google', identity_data: { picture: 'https://evil.com/x.jpg' } }])
    ).toBeNull();
    expect(googlePictureFromIdentities(undefined)).toBeNull();
    expect(googlePictureFromIdentities([{ provider: 'google', identity_data: null }])).toBeNull();
  });
});

describe('normalizePhotoContentType', () => {
  it('accepts jpeg, png and webp with parameters', () => {
    expect(normalizePhotoContentType('image/jpeg')).toBe('image/jpeg');
    expect(normalizePhotoContentType('Image/PNG; charset=binary')).toBe('image/png');
    expect(normalizePhotoContentType('image/webp')).toBe('image/webp');
  });
  it('refuses anything else', () => {
    expect(normalizePhotoContentType('image/svg+xml')).toBeNull();
    expect(normalizePhotoContentType('text/html')).toBeNull();
    expect(normalizePhotoContentType(null)).toBeNull();
  });
});

describe('shouldRefreshAccountPhoto', () => {
  it('refreshes when never fetched or older than the window', () => {
    expect(shouldRefreshAccountPhoto(null, 1000)).toBe(true);
    expect(shouldRefreshAccountPhoto(0, ACCOUNT_PHOTO_REFRESH_MS + 1)).toBe(true);
    expect(shouldRefreshAccountPhoto(1000, 1000 + ACCOUNT_PHOTO_REFRESH_MS - 1)).toBe(false);
  });
  it('the window is shorter than the one hour signed-url life', () => {
    expect(ACCOUNT_PHOTO_REFRESH_MS).toBeLessThan(60 * 60 * 1000);
  });
});

describe('shouldOfferInvitePhoto', () => {
  it('offers only when the flag is on, there is no photo and it was not seen', () => {
    expect(shouldOfferInvitePhoto({ enabled: true, hasPhoto: false, seen: false })).toBe(true);
    expect(shouldOfferInvitePhoto({ enabled: false, hasPhoto: false, seen: false })).toBe(false);
    expect(shouldOfferInvitePhoto({ enabled: true, hasPhoto: true, seen: false })).toBe(false);
    expect(shouldOfferInvitePhoto({ enabled: true, hasPhoto: false, seen: true })).toBe(false);
  });
});

describe('mayRetryBrokenPhoto', () => {
  it('allows the first retry, then waits five minutes', () => {
    expect(mayRetryBrokenPhoto(null, 1_000)).toBe(true);
    expect(mayRetryBrokenPhoto(1_000, 1_000 + 60_000)).toBe(false);
    expect(mayRetryBrokenPhoto(1_000, 1_000 + BROKEN_PHOTO_RETRY_MS - 1)).toBe(false);
    expect(mayRetryBrokenPhoto(1_000, 1_000 + BROKEN_PHOTO_RETRY_MS)).toBe(true);
  });
});

describe('withoutSignedPhotos', () => {
  it('drops the signed photo link before a list is saved to the device', () => {
    const members = [
      { userId: 'u1', name: 'A', avatarUrl: 'https://x.supabase.co/sign/a?token=t' },
      { userId: 'u2', name: 'B', avatarUrl: null },
    ];
    expect(withoutSignedPhotos(members)).toEqual([
      { userId: 'u1', name: 'A', avatarUrl: null },
      { userId: 'u2', name: 'B', avatarUrl: null },
    ]);
    expect(members[0].avatarUrl).not.toBeNull();
  });
});
