import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRM_SETTINGS,
  buildTrmReleaseInput,
  TRM_ARTIST_NOT_FOUND_TEXT,
  canSendToTrmEmail,
  chipFor,
  earliestTrmDate,
  heroForInFlight,
  isArtistNotFoundReason,
  parseConnectorMessage,
  receivedByTrm,
  rejectionTitle,
  resolveTrmStores,
  progressFor,
  readTrmSettings,
  royaltySplits,
  shouldApply,
  trmChecklist,
  type TrmFacts,
} from './release';

const TODAY = new Date('2026-10-19T10:00:00Z');
const ready: TrmFacts = {
  releaseId: 'r1',
  title: 'Iyawo Mi',
  primaryArtist: 'Hadiza Moon',
  releaseType: 'single',
  releaseDate: '2026-11-07',
  genre: 'Afropop',
  language: 'English',
  explicit: false,
  isrc: null,
  upc: null,
  labelName: null,
  featuredArtists: null,
  lyrics: null,
  artwork: { mimeType: 'image/jpeg', width: 3000, height: 3000, sizeBytes: 4_300_000 },
  credits: [
    { name: 'Hadiza Moon', roles: ['songwriter'], songwriterSplit: 50, masterSplit: null },
    { name: 'Tedum', roles: ['songwriter'], songwriterSplit: 50, masterSplit: null },
    { name: 'DJ K', roles: ['producer'], songwriterSplit: null, masterSplit: null },
  ],
  tracks: [],
};

describe('trmChecklist', () => {
  it('a complete single has nothing blocking', () => {
    const c = trmChecklist(ready, DEFAULT_TRM_SETTINGS, TODAY);
    expect(c.blocking).toEqual([]);
    expect(c.ready.map((r) => r.key)).toEqual(['cover_art', 'details', 'credits', 'rights']);
    expect(c.ready.find((r) => r.key === 'details')?.detail).toBe('Afropop · English · Clean · Independent');
    expect(c.ready.find((r) => r.key === 'credits')?.detail).toBe('2 writers · 1 producer · 100% to Hadiza Moon');
    expect(c.ready.find((r) => r.key === 'cover_art')?.detail).toBe('3000 × 3000 · JPG · 4.1 MB');
  });
  it('a date under 14 days, small art, no credits and no genre block', () => {
    const c = trmChecklist(
      { ...ready, releaseDate: '2026-10-24', genre: null, credits: [], artwork: { mimeType: 'image/jpeg', width: 1400, height: 1400, sizeBytes: 1 } },
      DEFAULT_TRM_SETTINGS,
      TODAY
    );
    expect(c.blocking.map((r) => [r.key, r.detail])).toEqual([
      ['release_date', '5 days out · TRM needs 14'],
      ['cover_art', '1400 × 1400 · needs 3000 × 3000'],
      ['credits', 'No writers or producers yet'],
      ['genre', 'Not set'],
    ]);
    expect(c.earliestDate).toBe('2026-11-02');
  });
  it('master splits that do not reach 100 block', () => {
    const credits = [
      { name: 'A', roles: ['songwriter', 'producer'], songwriterSplit: 100, masterSplit: 60 },
      { name: 'B', roles: ['vocalist'], songwriterSplit: null, masterSplit: 20 },
    ];
    const c = trmChecklist({ ...ready, credits }, DEFAULT_TRM_SETTINGS, TODAY);
    expect(c.blocking.map((r) => r.detail)).toEqual(['Splits add up to 80% · need 100%']);
  });
  it('a rollout planned as an EP with one song asks for the rest', () => {
    const c = trmChecklist({ ...ready, releaseType: 'ep' }, DEFAULT_TRM_SETTINGS, TODAY);
    expect(c.kind).toBe('ep');
    expect(c.blocking.map((r) => [r.key, r.detail])).toEqual([['songs', 'Only 1 song · an EP needs more']]);
  });
});

describe('buildTrmReleaseInput', () => {
  it('fills every field TRM requires with safe defaults', () => {
    const input = buildTrmReleaseInput(ready, DEFAULT_TRM_SETTINGS, ' Hadiza.Moon@Gmail.com ', ['Spotify', 'Apple Music']);
    expect(input).toMatchObject({
      external_release_id: 'r1',
      artist_email: 'hadiza.moon@gmail.com',
      release_type: 'Single',
      label: 'Independent',
      copyright_name: 'Hadiza Moon',
      copyright_year: 2026,
      stores: ['Spotify', 'Apple Music'],
      explicit: false,
    });
    const track = input.tracks[0];
    expect(track.writers).toEqual([
      { name: 'Hadiza Moon', role: 'Songwriter' },
      { name: 'Tedum', role: 'Songwriter' },
    ]);
    expect(track.producers).toEqual([{ name: 'DJ K', role: 'Producer' }]);
    expect(track.royalty_splits).toEqual([{ name: 'Hadiza Moon', percentage: 100 }]);
    expect(track).toMatchObject({ youtube_policy: 'Monetize', soundexchange_policy: 'Claim from Inception', sound_recording_territories: ['Worldwide'] });
  });
  it('uses master splits when filled', () => {
    const facts = { ...ready, credits: [...ready.credits.slice(0, 2), { name: 'DJ K', roles: ['producer'], songwriterSplit: null, masterSplit: 30 }, { name: 'Hadiza Moon', roles: ['vocalist'], songwriterSplit: null, masterSplit: 70 }] };
    expect(royaltySplits(facts).splits).toEqual([
      { name: 'DJ K', percentage: 30 },
      { name: 'Hadiza Moon', percentage: 70 },
    ]);
  });
});

describe('helpers', () => {
  it('earliest date is today + 14 (UTC days)', () => expect(earliestTrmDate(TODAY)).toBe('2026-11-02'));
  it('settings read defensively', () => {
    expect(readTrmSettings({ youtubePolicy: 'Block', stores: [] })).toMatchObject({ youtubePolicy: 'Block', stores: [], countryOfRecording: 'Nigeria' });
    // v1.160.0 saved ["all"], which TRM refuses: read as "every store".
    expect(readTrmSettings({ stores: ['all'] }).stores).toEqual([]);
    expect(readTrmSettings({ youtubePolicy: 'nope' }).youtubePolicy).toBe('Monetize');
  });
  it('sending is open to every signed-in account unless the env narrows it', () => {
    expect(canSendToTrmEmail('someone@else.com', undefined)).toBe(true);
    expect(canSendToTrmEmail('someone@else.com', 'a@b.co')).toBe(false);
    expect(canSendToTrmEmail('a@b.co', ' a@b.co , c@d.co')).toBe(true);
    expect(canSendToTrmEmail(null, undefined)).toBe(false);
  });
  it('orders events by time only', () => {
    expect(shouldApply('2026-10-19T10:00:00Z', '2026-10-19T09:00:00Z')).toBe(false);
    expect(shouldApply('2026-10-19T10:00:00Z', '2026-10-19T10:00:01Z')).toBe(true);
    expect(shouldApply(null, null)).toBe(true);
  });
  it('progress: Submitted, then Received by TRM only once TRM says so', () => {
    const sent = progressFor('validating', [{ status: 'submitted', at: 'a' }, { status: 'validating', at: 'b' }], '2027-01-15');
    expect(sent.map((s) => [s.label, s.done, s.current, s.at])).toEqual([
      ['Submitted', true, true, 'a'],
      ['Received by TRM', false, false, null],
      ['Delivering', false, false, null],
      ['In stores', false, false, '2027-01-15'],
    ]);
    const got = progressFor('validating', [{ status: 'submitted', at: 'a' }, { status: 'received', at: 'c' }], null);
    expect(got.map((s) => [s.label, s.done, s.current, s.at])).toEqual([
      ['Submitted', true, false, 'a'],
      ['Received by TRM', true, true, 'c'],
      ['Delivering', false, false, null],
      ['In stores', false, false, null],
    ]);
  });
});

describe('Submitted vs Received by TRM', () => {
  it('received needs a receipt after the latest submit, or a status past review', () => {
    expect(receivedByTrm('submitted', [{ status: 'submitted', at: 'a' }])).toBe(false);
    expect(receivedByTrm('submitted', [{ status: 'submitted', at: 'a' }, { status: 'received', at: 'b' }])).toBe(true);
    // A resubmit starts over.
    expect(receivedByTrm('submitted', [{ status: 'received', at: 'a' }, { status: 'submitted', at: 'b' }])).toBe(false);
    expect(receivedByTrm('accepted', [])).toBe(true);
    expect(receivedByTrm('rejected', [{ status: 'received', at: 'a' }])).toBe(false);
  });
  it('one chip, named for where it is', () => {
    expect(chipFor('submitted')).toEqual({ label: 'Submitted', tone: 'live' });
    expect(chipFor('validating', true)).toEqual({ label: 'Received by TRM', tone: 'live' });
    expect(chipFor('accepted')).toEqual({ label: 'Received by TRM', tone: 'live' });
    expect(chipFor('processing')?.label).toBe('Delivering');
    expect(chipFor('published')?.label).toBe('Delivered');
    expect(chipFor('needs_account')).toEqual({ label: 'Not received', tone: 'error' });
    expect(heroForInFlight('submitted')).toBe('Submitted to TRM.');
    expect(heroForInFlight('validating', true)).toBe('Received by TRM.');
  });
});

describe('TRM stores and failure messages', () => {
  it('stores: a narrowed choice keeps only names TRM offers; none means all', () => {
    const all = ['Spotify', 'Apple Music', 'Boomplay'];
    expect(resolveTrmStores([], all)).toEqual(all);
    expect(resolveTrmStores(['Boomplay', 'Myspace'], all)).toEqual(['Boomplay']);
    expect(resolveTrmStores(['all'], all)).toEqual(all);
  });
  it('reads the connector JSON string, a double-encoded one, and plain text', () => {
    const msg = '{"error":{"code":"artist_not_found","message":"The target TRM artist was not found."}}';
    expect(parseConnectorMessage(msg)).toEqual({ code: 'artist_not_found', text: 'The target TRM artist was not found.' });
    expect(parseConnectorMessage(JSON.stringify(msg))).toEqual({ code: 'artist_not_found', text: 'The target TRM artist was not found.' });
    expect(parseConnectorMessage('Store feed timed out')).toEqual({ code: null, text: 'Store feed timed out' });
    expect(parseConnectorMessage('{not json')).toEqual({ code: null, text: '{not json' });
    expect(parseConnectorMessage('')).toBeNull();
    expect(parseConnectorMessage(null)).toBeNull();
  });
  it('knows artist_not_found by code or TRM’s sentence', () => {
    expect(isArtistNotFoundReason({ code: 'artist_not_found', text: 'x' })).toBe(true);
    expect(isArtistNotFoundReason({ code: null, text: 'The target TRM artist was not found.' })).toBe(true);
    expect(isArtistNotFoundReason({ code: null, text: 'Artwork contains a URL.' })).toBe(false);
    expect(rejectionTitle('artist_not_found', 'x')).toBe('TRM account');
    expect(TRM_ARTIST_NOT_FOUND_TEXT).toBe('Create your TRM account, or correct the email to match your existing TRM account, then resubmit.');
  });
});
