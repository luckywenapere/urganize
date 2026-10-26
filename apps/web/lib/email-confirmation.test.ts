import { describe, expect, it } from 'vitest';
import {
  EMPTY_ONBOARDING_DRAFT,
  type OnboardingDraft,
} from './onboarding-draft';
import {
  PENDING_CONFIRMATION_TTL_MS,
  RESEND_COOLDOWN_MS,
  amrMethodsFromAccessToken,
  firstNameOf,
  formatCooldown,
  fromMetadataDraft,
  isDeadLinkError,
  isEmailLinkSignIn,
  isGmailAddress,
  markConfirmationResent,
  readAuthRedirectError,
  readPendingConfirmation,
  resendCooldownLeft,
  toMetadataDraft,
  writePendingConfirmation,
} from './email-confirmation';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const draft: OnboardingDraft = {
  ...EMPTY_ONBOARDING_DRAFT,
  persona: 'music_manager',
  releaseType: 'single',
  whereStuck: ['marketing_promo'],
  title: 'Honest',
  releaseDate: '2026-11-13',
  artistName: 'Ada',
};

describe('Gmail button', () => {
  it('shows only for Gmail addresses', () => {
    expect(isGmailAddress('ada@gmail.com')).toBe(true);
    expect(isGmailAddress(' Ada@GoogleMail.com ')).toBe(true);
    expect(isGmailAddress('ada@studiohouse.co')).toBe(false);
    expect(isGmailAddress('ada@gmail.com.evil.co')).toBe(false);
    expect(isGmailAddress('')).toBe(false);
  });
});

describe('first name', () => {
  it('takes the first word, or nothing', () => {
    expect(firstNameOf('Ada Obi')).toBe('Ada');
    expect(firstNameOf('  ')).toBe('');
    expect(firstNameOf(undefined)).toBe('');
  });
});

describe('resend cooldown', () => {
  it('counts down 60 s from the last send', () => {
    expect(resendCooldownLeft(1_000, 1_000)).toBe(RESEND_COOLDOWN_MS);
    expect(resendCooldownLeft(1_000, 19_000)).toBe(42_000);
    expect(resendCooldownLeft(1_000, 120_000)).toBe(0);
    expect(resendCooldownLeft(0, 5)).toBe(0);
    expect(formatCooldown(42_000)).toBe('0:42');
    expect(formatCooldown(60_000)).toBe('1:00');
    expect(formatCooldown(1)).toBe('0:01');
  });
});

describe('pending confirmation', () => {
  it('round-trips and expires', () => {
    const storage = memoryStorage();
    writePendingConfirmation(
      { email: ' Ada@Gmail.com', sentAt: 1_000, kind: 'onboarding', firstName: 'Ada', releaseTitle: 'Honest', onboarding: { role: 'artist-manager', draft } },
      storage
    );
    const read = readPendingConfirmation(2_000, storage);
    expect(read?.email).toBe('ada@gmail.com');
    expect(read?.onboarding?.draft.title).toBe('Honest');
    expect(readPendingConfirmation(1_000 + PENDING_CONFIRMATION_TTL_MS + 1, storage)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it('a resend keeps the record and restarts the clock', () => {
    const storage = memoryStorage();
    writePendingConfirmation({ email: 'ada@gmail.com', sentAt: 1_000, kind: 'invite', firstName: 'Ada' }, storage);
    const next = markConfirmationResent('ada@gmail.com', 50_000, storage);
    expect(next).toMatchObject({ sentAt: 50_000, kind: 'invite', firstName: 'Ada' });
    const other = markConfirmationResent('bo@x.co', 60_000, storage);
    expect(other).toMatchObject({ email: 'bo@x.co', sentAt: 60_000 });
    expect(other.firstName).toBeUndefined();
  });

  it('ignores garbage', () => {
    const storage = memoryStorage();
    storage.setItem('urganize.email_confirmation.pending', '{nope');
    expect(readPendingConfirmation(1, storage)).toBeNull();
  });
});

describe('metadata draft', () => {
  it('round-trips the answers the hand-off needs', () => {
    const packed = toMetadataDraft(draft, 'artist');
    const back = fromMetadataDraft(JSON.parse(JSON.stringify(packed)));
    expect(back?.role).toBe('artist');
    expect(back?.draft).toMatchObject({
      releaseType: 'single',
      title: 'Honest',
      releaseDate: '2026-11-13',
      artistName: 'Ada',
      whereStuck: ['marketing_promo'],
      planningPreference: 'ai_recommendations',
    });
  });

  it('round-trips "Nothing planned yet" with no rollout answers', () => {
    const packed = toMetadataDraft(
      { ...draft, releaseType: null, title: '', releaseDate: '', nothingPlanned: true },
      'artist-manager'
    );
    expect(packed.np).toBe(1);
    const back = fromMetadataDraft(JSON.parse(JSON.stringify(packed)));
    expect(back?.draft.nothingPlanned).toBe(true);
    expect(back?.draft.releaseType).toBeNull();
    // A normal draft carries no flag, and reads back false.
    expect(toMetadataDraft(draft, 'artist').np).toBeUndefined();
    expect(fromMetadataDraft(JSON.parse(JSON.stringify(toMetadataDraft(draft, 'artist'))))?.draft.nothingPlanned).toBe(false);
  });

  it('refuses an incomplete or consumed copy', () => {
    expect(fromMetadataDraft(null)).toBeNull();
    expect(fromMetadataDraft({ v: 1, t: 'Honest', d: 'soon', rt: 'single' })).toBeNull();
    expect(fromMetadataDraft({ v: 2, t: 'Honest', d: '2026-11-13', rt: 'single' })).toBeNull();
    expect(fromMetadataDraft({ v: 1, t: 'Honest', d: '2026-11-13', rt: 'mixtape' })).toBeNull();
  });
});

describe('redirect errors', () => {
  it('reads an expired confirmation link from the hash', () => {
    const error = readAuthRedirectError(
      'https://app.urganize.app/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );
    expect(error?.code).toBe('otp_expired');
    expect(isDeadLinkError(error)).toBe(true);
  });

  it('reads it from the query too', () => {
    const error = readAuthRedirectError('https://app.urganize.app/auth/callback?error=access_denied&error_code=otp_expired');
    expect(isDeadLinkError(error)).toBe(true);
  });

  it('does not treat a cancelled Google consent as an expired link', () => {
    const error = readAuthRedirectError(
      'https://app.urganize.app/auth/callback#error=access_denied&error_description=The+user+denied+access'
    );
    expect(isDeadLinkError(error)).toBe(false);
  });

  it('a clean callback has no error', () => {
    expect(readAuthRedirectError('https://app.urganize.app/auth/callback#access_token=a&type=signup')).toBeNull();
    expect(isDeadLinkError(null)).toBe(false);
  });
});

describe('email-link sign-in', () => {
  const token = (claims: object) =>
    `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;

  it('reads amr from the access token', () => {
    expect(amrMethodsFromAccessToken(token({ amr: [{ method: 'otp', timestamp: 1 }] }))).toEqual(['otp']);
    expect(amrMethodsFromAccessToken('garbage')).toEqual([]);
  });

  it('is a confirmation for type=signup or an otp email session, never Google', () => {
    expect(isEmailLinkSignIn({ hashType: 'signup', provider: 'email', amrMethods: [] })).toBe(true);
    expect(isEmailLinkSignIn({ hashType: null, provider: 'email', amrMethods: ['otp'] })).toBe(true);
    expect(isEmailLinkSignIn({ hashType: null, provider: 'google', amrMethods: ['oauth'] })).toBe(false);
    expect(isEmailLinkSignIn({ hashType: null, provider: 'email', amrMethods: ['password'] })).toBe(false);
  });
});

import { isSafeNextPath } from './email-confirmation';

describe('callback next path', () => {
  it('allows same-site paths only', () => {
    expect(isSafeNextPath('/onboarding')).toBe(true);
    expect(isSafeNextPath('/invite/accept?token=abc')).toBe(true);
    expect(isSafeNextPath('//evil.example')).toBe(false);
    expect(isSafeNextPath('/\\evil.example')).toBe(false);
    expect(isSafeNextPath('/\t/evil.example')).toBe(false);
    expect(isSafeNextPath('https://evil.example')).toBe(false);
    expect(isSafeNextPath('')).toBe(false);
    expect(isSafeNextPath(null)).toBe(false);
  });
});
