import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMO_LEAD_DAYS,
  PROMO_CHANNEL_KINDS,
  channelFitsGenre,
  filterPromoChannels,
  isMissingTableError,
  parsePromoSuggestion,
  promoTaskDescription,
  promoTaskDueDate,
  promoTaskTitle,
  suggestPromoChannels,
  toPromoChannel,
  type PromoChannel,
} from './promo-channels';

function channel(over: Partial<PromoChannel> & { id: string }): PromoChannel {
  return {
    name: over.id,
    kind: 'radio',
    country: 'NG',
    city: null,
    genres: [],
    howToSubmit: null,
    contact: null,
    url: null,
    leadTime: null,
    leadTimeDays: null,
    cost: null,
    ...over,
  };
}

const lagosRadio = channel({ id: 'cool', name: 'Cool FM', country: 'NG', city: 'Lagos' });
const ukRadio = channel({ id: '1xtra', name: 'BBC Radio 1Xtra', country: 'GB', genres: ['Afrobeats', 'Hip-hop'], cost: 'free' });
const online = channel({ id: 'repost', name: 'Repost Exchange', kind: 'soundcloud', country: null, cost: 'free' });
const ngBlog = channel({ id: 'njo', name: 'Notjustok', kind: 'blog', country: 'NG', genres: ['Afrobeats', 'Afropop'] });
const paidBlog = channel({ id: 'nl', name: 'Naijaloaded', kind: 'blog', country: 'NG', cost: 'paid' });
const all = [lagosRadio, ukRadio, online, ngBlog, paidBlog];

describe('toPromoChannel', () => {
  it('maps a row and drops a kind the app does not know instead of crashing', () => {
    const base = {
      id: 'x',
      name: 'X',
      country: null,
      city: null,
      genres: null,
      how_to_submit: null,
      contact: null,
      url: null,
      lead_time: null,
      lead_time_days: null,
      cost: 'maybe',
    };
    expect(toPromoChannel({ ...base, kind: 'radio' })).toMatchObject({ kind: 'radio', genres: [], cost: null });
    expect(toPromoChannel({ ...base, kind: 'tv' })).toBeNull();
  });
});

describe('filterPromoChannels', () => {
  it('filters by kind', () => {
    expect(filterPromoChannels(all, { kind: 'blog', country: '' }).map((c) => c.id)).toEqual(['njo', 'nl']);
  });

  it('keeps online channels under a country filter, and Online shows only them', () => {
    expect(filterPromoChannels(all, { kind: '', country: 'GB' }).map((c) => c.id)).toEqual(['1xtra', 'repost']);
    expect(filterPromoChannels(all, { kind: '', country: 'online' }).map((c) => c.id)).toEqual(['repost']);
  });
});

describe('channelFitsGenre', () => {
  it('takes any genre when the channel lists none', () => {
    expect(channelFitsGenre(lagosRadio, 'Gospel')).toBe(true);
    expect(channelFitsGenre(lagosRadio, null)).toBe(true);
  });

  it('matches loosely across spelling and punctuation', () => {
    expect(channelFitsGenre(ngBlog, 'afro-pop')).toBe(true);
    expect(channelFitsGenre(ngBlog, 'Afrobeats / Afropop')).toBe(true);
    expect(channelFitsGenre(ukRadio, 'hip hop')).toBe(true);
  });

  it('refuses a genre a listing channel does not take, and no genre at all', () => {
    expect(channelFitsGenre(ukRadio, 'Gospel')).toBe(false);
    expect(channelFitsGenre(ukRadio, null)).toBe(false);
  });
});

describe('suggestPromoChannels', () => {
  it('keeps the country and online channels, in-country first, free before paid', () => {
    const fits = suggestPromoChannels(all, { genre: 'Afrobeats', country: 'NG' }, 10);
    expect(fits.map((c) => c.id)).toEqual(['cool', 'njo', 'nl', 'repost']);
  });

  it('drops channels whose listed genres miss the rollout genre', () => {
    const fits = suggestPromoChannels(all, { genre: 'Gospel', country: 'NG' }, 10);
    expect(fits.map((c) => c.id)).not.toContain('njo');
  });

  it('is deterministic and capped', () => {
    const a = suggestPromoChannels(all, { genre: null, country: null }, 2);
    const b = suggestPromoChannels([...all].reverse(), { genre: null, country: null }, 2);
    expect(a).toHaveLength(2);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});

describe('promoTaskDueDate', () => {
  it('counts back the channel lead time from release day', () => {
    expect(promoTaskDueDate({ leadTimeDays: 10 }, '2026-12-01', '2026-10-11')).toBe('2026-11-21');
  });

  it('uses the default lead time when the channel does not say', () => {
    expect(DEFAULT_PROMO_LEAD_DAYS).toBe(21);
    expect(promoTaskDueDate({ leadTimeDays: null }, '2026-12-01', '2026-10-11')).toBe('2026-11-10');
  });

  it('never lands before today, and a week out with no release day', () => {
    expect(promoTaskDueDate({ leadTimeDays: 60 }, '2026-10-20', '2026-10-11')).toBe('2026-10-11');
    expect(promoTaskDueDate({ leadTimeDays: 5 }, null, '2026-10-11')).toBe('2026-10-18');
    expect(promoTaskDueDate({ leadTimeDays: 5 }, '2026-02-31', '2026-10-11')).toBe('2026-10-18');
  });
});

describe('promoTaskTitle and promoTaskDescription', () => {
  it('names the action for the kind of channel', () => {
    expect(promoTaskTitle(lagosRadio)).toBe('Submit to Cool FM');
    expect(promoTaskTitle(online)).toBe('Post on Repost Exchange');
    expect(promoTaskTitle({ name: 'A host', kind: 'x_spaces' })).toBe('Get on A host');
  });

  it('carries only the facts the channel has', () => {
    expect(promoTaskDescription(channel({ id: 'a', howToSubmit: 'Email it.', contact: 'a@b.co', cost: 'free' }))).toBe(
      'Email it.\nContact: a@b.co\nFree'
    );
    expect(promoTaskDescription(lagosRadio)).toBe('');
  });
});

describe('parsePromoSuggestion', () => {
  const ok = { name: 'Wazobia FM', kind: 'radio', country: 'ng', url: 'https://wazobiafm.com' };

  it('accepts a complete suggestion and normalises the country', () => {
    const result = parsePromoSuggestion(ok);
    expect(result).toEqual({
      ok: true,
      value: { name: 'Wazobia FM', kind: 'radio', country: 'NG', url: 'https://wazobiafm.com', howToSubmit: null, note: null },
    });
  });

  it('refuses a missing name, an unknown kind and a link that is not http(s)', () => {
    expect(parsePromoSuggestion({ ...ok, name: ' ' }).ok).toBe(false);
    expect(parsePromoSuggestion({ ...ok, kind: 'tv' }).ok).toBe(false);
    expect(parsePromoSuggestion({ ...ok, url: 'javascript:alert(1)' }).ok).toBe(false);
    expect(parsePromoSuggestion(null).ok).toBe(false);
  });

  it('refuses text over the limits', () => {
    expect(parsePromoSuggestion({ ...ok, name: 'x'.repeat(121) }).ok).toBe(false);
    expect(parsePromoSuggestion({ ...ok, howToSubmit: 'x'.repeat(401) }).ok).toBe(false);
  });
});

describe('isMissingTableError', () => {
  it('recognises Postgres and PostgREST missing-table errors only', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
    expect(isMissingTableError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

describe('the migration agrees with the code', () => {
  const sql = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261011190000_promo_channels.sql'),
    'utf8'
  );

  it('allows exactly the kinds the app knows', () => {
    const check = /kind in \(([^)]+)\)/.exec(sql)?.[1] ?? '';
    const kinds = [...check.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(kinds).toEqual([...PROMO_CHANNEL_KINDS]);
  });

  it('lets signed-in people read listed rows only, and gives nobody a write policy', () => {
    expect(sql).toMatch(/for select to authenticated\s+using \(status = 'listed'\)/);
    expect(sql).not.toMatch(/for (insert|update|delete|all)/i);
  });

  it('seeds every row as listed, each with the page it was checked against', () => {
    const seedRows = sql.split('values')[1] ?? '';
    const rows = seedRows.match(/\('[a-z0-9-]+', /g) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect((seedRows.match(/'listed'\)/g) ?? []).length).toBe(rows.length);
    expect((seedRows.match(/'https:\/\/[^']+', 'listed'\)/g) ?? []).length).toBe(rows.length);
  });
});
