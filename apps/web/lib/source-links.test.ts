import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SOURCE_LINKS,
  buildSourceLinkEventRow,
  resolveSourceLink,
  sourceLinkCookieDomain,
  sourceLinkDestination,
  sourceLinkProperties,
} from './source-links';

const require_ = createRequire(import.meta.url);
const config = require_(join(process.cwd(), 'next.config.js'));

describe('source links', () => {
  it('has the links the founder asked for', () => {
    expect(SOURCE_LINKS.map((link) => link.slug)).toEqual([
      'x', 'ig', 'fb', 'yt', 'ow', 'cn', 'sws', 'trm', 'stmz',
      'tt', 'tr', 'sc', 'wa', 'u',
    ]);
  });

  it('keeps slugs and values to plain lowercase words', () => {
    for (const link of SOURCE_LINKS) {
      expect(link.slug).toMatch(/^[a-z0-9]{1,12}$/);
      expect(link.source).toMatch(/^[a-z0-9_]{1,40}$/);
      expect(link.medium).toMatch(/^[a-z0-9_]{1,40}$/);
    }
  });

  it('names every link for the admin page, and keeps the name out of what leaves', () => {
    for (const link of SOURCE_LINKS) expect(link.label.trim().length, link.slug).toBeGreaterThan(0);
    expect(resolveSourceLink('tt')?.label).toBe('TikTok');
    expect(resolveSourceLink('ig')?.label).toBe('Instagram');
    expect(resolveSourceLink('ow')?.label).toBe('Oyin Wenapere');
    expect(Object.keys(sourceLinkProperties(resolveSourceLink('tt')!)).sort()).toEqual(['medium', 'slug', 'source']);
    expect(sourceLinkDestination(resolveSourceLink('tt')!)).not.toContain('TikTok');
  });

  it('keeps one row for a tap and one for a sign-up, and nothing for a link not on the list', () => {
    expect(buildSourceLinkEventRow({ kind: 'tap', slug: ' TT ' })).toEqual({ kind: 'tap', slug: 'tt', user_id: null });
    // A tap never names an account, even when one is handed in.
    expect(buildSourceLinkEventRow({ kind: 'tap', slug: 'ig', userId: 'user-1' })).toEqual({
      kind: 'tap',
      slug: 'ig',
      user_id: null,
    });
    expect(buildSourceLinkEventRow({ kind: 'signup', slug: 'x', userId: ' user-1 ' })).toEqual({
      kind: 'signup',
      slug: 'x',
      user_id: 'user-1',
    });
    // A sign-up with no account is not a sign-up.
    expect(buildSourceLinkEventRow({ kind: 'signup', slug: 'x' })).toBeNull();
    expect(buildSourceLinkEventRow({ kind: 'signup', slug: 'x', userId: '  ' })).toBeNull();
    expect(buildSourceLinkEventRow({ kind: 'tap', slug: 'nope' })).toBeNull();
    expect(buildSourceLinkEventRow({ kind: 'tap', slug: undefined })).toBeNull();
  });

  it('the table takes every slug on the list', () => {
    // The migration's check on source_link_events.slug.
    for (const link of SOURCE_LINKS) expect(link.slug).toMatch(/^[a-z0-9]{1,12}$/);
  });

  it('looks a slug up and never passes an unknown one on', () => {
    expect(resolveSourceLink(' IG ')?.source).toBe('instagram');
    expect(resolveSourceLink('nope')).toBeNull();
    expect(resolveSourceLink('x"><script>')).toBeNull();
    expect(resolveSourceLink(undefined)).toBeNull();
  });

  it('sends the visitor to the marketing site with utm tags', () => {
    expect(sourceLinkDestination(resolveSourceLink('x')!)).toBe(
      'https://urganize.app/?utm_source=x&utm_medium=social&utm_campaign=go_link'
    );
  });

  it('shares the cookie across urganize.app hosts only', () => {
    expect(sourceLinkCookieDomain('team.urganize.app')).toBe('.urganize.app');
    expect(sourceLinkCookieDomain('urganize.app')).toBe('.urganize.app');
    expect(sourceLinkCookieDomain('localhost:3100')).toBeUndefined();
    expect(sourceLinkCookieDomain('evilurganize.app')).toBeUndefined();
    expect(sourceLinkCookieDomain(null)).toBeUndefined();
  });
});

describe('source link routing', () => {
  it('rewrites every slug to the counting route', async () => {
    const rewrites = (await config.rewrites()) as Array<{ source: string; destination: string }>;
    for (const link of SOURCE_LINKS) {
      expect(rewrites).toContainEqual({ source: `/${link.slug}`, destination: `/api/go/${link.slug}` });
    }
  });

  it('no slug is the name of a real page or an existing redirect', async () => {
    const pages = readdirSync(join(process.cwd(), 'app'));
    const redirects = (await config.redirects()) as Array<{ source: string }>;
    for (const link of SOURCE_LINKS) {
      expect(pages, link.slug).not.toContain(link.slug);
      expect(existsSync(join(process.cwd(), 'public', link.slug)), link.slug).toBe(false);
      expect(redirects.map((entry) => entry.source), link.slug).not.toContain(`/${link.slug}`);
    }
  });
});
