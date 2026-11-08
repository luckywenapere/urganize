import { describe, expect, it } from 'vitest';
import {
  PROFILE_GROWTH_COPY,
  claimCompletedProperties,
  claimPageViewedProperties,
  creditLinkOpenedProperties,
  creditSubmittedProperties,
  isLikelyBot,
  isNewAccount,
  isPrefetchRequest,
  isPublishTransition,
  isSignupAttributionFresh,
  isValidProfileSlug,
  normalizeSignupAttribution,
  parseProfileCtaQuery,
  parseSignupAttribution,
  profileCtaHref,
  profileLinkSharedProperties,
  profilePublishedProperties,
  profileShareText,
  profileSignupPath,
  profileWhatsappHref,
  publicProfileCtaClickedProperties,
  publicProfileUrl,
  publicProfileViewedProperties,
  signupFromProfileProperties,
} from './profile-growth';
import { BANNED_COPY_CHARS } from './press-kits';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-11T12:00:00Z');

describe('the call to action link', () => {
  it('goes through the counting route with the slug and the kind', () => {
    expect(profileCtaHref('tobi-ade', 'collaborator')).toBe('/api/public-profile/cta?slug=tobi-ade&cta=collaborator');
    expect(profileCtaHref('tobi-ade', 'manager')).toBe('/api/public-profile/cta?slug=tobi-ade&cta=manager');
  });

  it('round-trips through the route parser', () => {
    const href = profileCtaHref('mix-by-kemi', 'manager');
    const params = new URL(href, 'https://app.urganize.app').searchParams;
    expect(parseProfileCtaQuery(params)).toEqual({ slug: 'mix-by-kemi', cta: 'manager' });
  });

  it('refuses a slug or a kind we did not make', () => {
    const q = (s: string) => parseProfileCtaQuery(new URLSearchParams(s));
    expect(q('slug=../admin&cta=manager')).toBeNull();
    expect(q('slug=tobi&cta=admin')).toBeNull();
    expect(q('cta=manager')).toBeNull();
    expect(q('slug=a&cta=manager')).toBeNull();
    expect(q(`slug=${'a'.repeat(61)}&cta=manager`)).toBeNull();
    expect(q('slug=Tobi-Ade&cta=manager')).toEqual({ slug: 'tobi-ade', cta: 'manager' });
  });
});

describe('sign-up attribution', () => {
  it('uses ?from=, never ?ref= (that is a partner referral code)', () => {
    const path = profileSignupPath({ slug: 'tobi-ade', cta: 'collaborator' });
    expect(path).toBe('/onboarding?from=profile&slug=tobi-ade&cta=collaborator');
    expect(path).not.toMatch(/[?&]ref=/);
  });

  it('drops a bad slug or kind but still sends them to sign up', () => {
    expect(profileSignupPath({ slug: '<script>', cta: null })).toBe('/onboarding?from=profile');
  });

  it('parses what the CTA route sends', () => {
    expect(parseSignupAttribution('?from=profile&slug=tobi-ade&cta=manager')).toEqual({
      source: 'profile',
      slug: 'tobi-ade',
      cta: 'manager',
    });
    expect(parseSignupAttribution('?from=claim')).toEqual({ source: 'claim', slug: null, cta: null });
  });

  it('fails toward no attribution', () => {
    expect(parseSignupAttribution('')).toBeNull();
    expect(parseSignupAttribution('?ref=PROFILE')).toBeNull();
    expect(parseSignupAttribution('?from=somewhere')).toBeNull();
    expect(parseSignupAttribution('?from=profile&slug=..%2F..&cta=boss')).toEqual({
      source: 'profile',
      slug: null,
      cta: null,
    });
  });

  it('re-validates anything posted or stored, keeping only known fields', () => {
    expect(normalizeSignupAttribution({ source: 'profile', slug: 'tobi', cta: 'manager', email: 'x@y.z' })).toEqual({
      source: 'profile',
      slug: 'tobi',
      cta: 'manager',
    });
    expect(normalizeSignupAttribution({ source: 'admin' })).toBeNull();
    expect(normalizeSignupAttribution(null)).toBeNull();
    expect(normalizeSignupAttribution('profile')).toBeNull();
  });

  it('remembers for 30 days and no longer', () => {
    expect(isSignupAttributionFresh(NOW - 29 * DAY, NOW)).toBe(true);
    expect(isSignupAttributionFresh(NOW - 31 * DAY, NOW)).toBe(false);
    expect(isSignupAttributionFresh(NOW + 1000, NOW)).toBe(false);
    expect(isSignupAttributionFresh('yesterday', NOW)).toBe(false);
  });

  it('counts only an account made in the last 7 days', () => {
    expect(isNewAccount(new Date(NOW - 2 * DAY).toISOString(), NOW)).toBe(true);
    expect(isNewAccount(new Date(NOW - 8 * DAY).toISOString(), NOW)).toBe(false);
    expect(isNewAccount(null, NOW)).toBe(false);
    expect(isNewAccount('not a date', NOW)).toBe(false);
  });
});

describe('who counts as a reader', () => {
  it('leaves out link previews, crawlers and scripts', () => {
    for (const ua of [
      'WhatsApp/2.23.20.0',
      'facebookexternalhit/1.1',
      'Twitterbot/1.0',
      'Slackbot-LinkExpanding 1.0',
      'TelegramBot (like TwitterBot)',
      'Mozilla/5.0 (compatible; Googlebot/2.1)',
      'curl/8.0',
      'node-fetch/1.0',
      '',
      null,
    ]) {
      expect(isLikelyBot(ua), String(ua)).toBe(true);
    }
  });

  it('counts a real phone and a real computer', () => {
    expect(isLikelyBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isLikelyBot('Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36')).toBe(false);
  });

  it('leaves out prefetches', () => {
    const from = (h: Record<string, string>) => (name: string) => h[name] ?? null;
    expect(isPrefetchRequest(from({ 'next-router-prefetch': '1' }))).toBe(true);
    expect(isPrefetchRequest(from({ purpose: 'prefetch' }))).toBe(true);
    expect(isPrefetchRequest(from({ 'sec-purpose': 'prefetch;prerender' }))).toBe(true);
    expect(isPrefetchRequest(from({}))).toBe(false);
  });
});

describe('event payloads carry no names, contacts or titles', () => {
  it('sends the slug only for a claimed page', () => {
    expect(publicProfileViewedProperties({ slug: 'tobi-ade', claimed: true })).toEqual({ slug: 'tobi-ade', claimed: true });
    expect(publicProfileViewedProperties({ slug: 'tobi-ade-x7k2p', claimed: false })).toEqual({ slug: null, claimed: false });
    expect(
      publicProfileCtaClickedProperties({ slug: 'tobi-ade-x7k2p', claimed: false, cta: 'collaborator' })
    ).toEqual({ slug: null, claimed: false, cta: 'collaborator' });
  });

  it('the sign-up event is exactly the three attribution fields', () => {
    expect(Object.keys(signupFromProfileProperties({ source: 'profile', slug: 'tobi', cta: 'manager' })).sort()).toEqual([
      'cta',
      'slug',
      'source',
    ]);
  });

  it('a credit is counted by roles, never by who', () => {
    const props = creditSubmittedProperties({ roles: ['producer', 'mixing_engineer'], updated: false, phone: ' 080 ' });
    expect(props).toEqual({ roles: 2, updated: false, has_phone: true });
    expect(JSON.stringify(props)).not.toMatch(/080|producer/);
  });

  it('claim payloads hold only states and booleans', () => {
    expect(claimPageViewedProperties({ ok: true, signedIn: false, credits: 3 })).toEqual({
      state: 'open',
      signed_in: false,
      credits: 3,
    });
    expect(claimPageViewedProperties({ ok: false, reason: 'expired', signedIn: true, credits: 9 })).toEqual({
      state: 'expired',
      signed_in: true,
      credits: 0,
    });
    expect(claimPageViewedProperties({ ok: false, reason: 'something new', signedIn: false }).state).toBe('unavailable');
    expect(claimCompletedProperties({ merged: true, proof: 'typed_contact' })).toEqual({ merged: true, proof: 'typed_contact' });
    expect(claimCompletedProperties({ merged: 'yes', proof: 'guess' })).toEqual({ merged: false, proof: 'unknown' });
  });

  it('publishing fires on the move to shown, and only then', () => {
    expect(isPublishTransition('private', 'public')).toBe(true);
    expect(isPublishTransition(null, 'directory')).toBe(true);
    expect(isPublishTransition('public', 'public')).toBe(false);
    expect(isPublishTransition('public', 'private')).toBe(false);
    expect(profilePublishedProperties({ visibility: 'public', hasBio: true })).toEqual({
      visibility: 'public',
      surface: 'claim',
      has_bio: true,
    });
    expect(profilePublishedProperties({ visibility: 'private', hasBio: true })).toBeNull();
  });

  it('share and link-open payloads are fixed shapes', () => {
    expect(profileLinkSharedProperties({ method: 'whatsapp', surface: 'claim_done' })).toEqual({
      method: 'whatsapp',
      surface: 'claim_done',
    });
    expect(creditLinkOpenedProperties({ closed: true })).toEqual({ state: 'closed' });
  });
});

describe('sharing your own page', () => {
  it('builds the page address and refuses a bad slug', () => {
    expect(publicProfileUrl('https://app.urganize.app/', 'tobi-ade')).toBe('https://go.urganize.app/p/tobi-ade');
    expect(publicProfileUrl('https://app.urganize.app', '../x')).toBeNull();
  });

  it('the WhatsApp link carries the text and the page address', () => {
    const href = profileWhatsappHref('https://app.urganize.app/p/tobi-ade');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1])).toBe(profileShareText('https://app.urganize.app/p/tobi-ade'));
  });

  it('accepts the database slug shape only', () => {
    expect(isValidProfileSlug('tobi-ade-x7k2p')).toBe(true);
    expect(isValidProfileSlug('-tobi')).toBe(false);
    expect(isValidProfileSlug('tobi--ade')).toBe(false);
  });
});

describe('the copy is held to the house bar', () => {
  const strings = [...Object.values(PROFILE_GROWTH_COPY), profileShareText('https://x.y/p/z')];

  it('no em dash or other banned character', () => {
    for (const text of strings) {
      for (const char of BANNED_COPY_CHARS) expect(text, text).not.toContain(char);
    }
  });

  it('short sentences a fifth grader can read (18 words at most)', () => {
    for (const text of strings) {
      for (const sentence of text.split(/[.?!]\s+/)) {
        expect(sentence.trim().split(/\s+/).length, text).toBeLessThanOrEqual(18);
      }
    }
  });

  it('says rollout, never ship or release', () => {
    for (const text of strings) {
      expect(text, text).not.toMatch(/\bship(s|ped|ping)?\b|\breleases?\b/i);
    }
    expect(PROFILE_GROWTH_COPY.managerCta).toContain('rollouts');
  });

  it('keeps the mark the other public pages carry', () => {
    expect(PROFILE_GROWTH_COPY.mark).toBe('Made with Urganize');
  });
});
