import { describe, expect, it } from 'vitest';
import {
  applicationSummaryLine,
  detectApplicationPlatform,
  detectContactKind,
  looksLikeBot,
  normalizePlaylistUrl,
  parseCuratorApplication,
  parseFollowers,
  playlistDisplayName,
  playlistLinkLabel,
  shortAgo,
} from './curator-applications';

const good = {
  playlistUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX?si=abc',
  followers: '4,210',
  genre: 'afrobeats',
  country: '  Nigeria ',
  contact: 'Ada@Example.com',
  note: 'Mostly Lagos listeners.',
};

describe('the playlist link', () => {
  it('takes Spotify, Apple Music, Audiomack and Boomplay, subdomains included', () => {
    expect(detectApplicationPlatform('https://open.spotify.com/playlist/x')).toBe('spotify');
    expect(detectApplicationPlatform('https://music.apple.com/ng/playlist/x')).toBe('apple_music');
    expect(detectApplicationPlatform('https://audiomack.com/x/playlist/y')).toBe('audiomack');
    expect(detectApplicationPlatform('https://www.boomplay.com/playlists/123')).toBe('boomplay');
  });

  it('refuses other hosts and lookalikes', () => {
    expect(detectApplicationPlatform('https://youtube.com/playlist?list=x')).toBeNull();
    expect(detectApplicationPlatform('https://notspotify.com/playlist/x')).toBeNull();
    expect(detectApplicationPlatform('not a link')).toBeNull();
    expect(detectApplicationPlatform('javascript:alert(1)')).toBeNull();
  });

  it('adds https to a pasted link without a scheme and drops the hash', () => {
    expect(normalizePlaylistUrl('open.spotify.com/playlist/abc#top')).toBe('https://open.spotify.com/playlist/abc');
    expect(normalizePlaylistUrl('http://audiomack.com/a')).toBe('https://audiomack.com/a');
  });

  it('falls back to host and path when there is no name', () => {
    expect(playlistLinkLabel('https://www.boomplay.com/playlists/123?x=1')).toBe('boomplay.com/playlists/123');
    expect(playlistDisplayName({ playlistName: '  ', playlistUrl: 'https://audiomack.com/a/playlist/b' })).toBe(
      'audiomack.com/a/playlist/b'
    );
    expect(playlistDisplayName({ playlistName: 'Lagos Late Nights', playlistUrl: 'https://x.com' })).toBe(
      'Lagos Late Nights'
    );
  });
});

describe('contact and followers', () => {
  it('reads an email or a WhatsApp number', () => {
    expect(detectContactKind('ada@example.com')).toBe('email');
    expect(detectContactKind('+234 803 555 0142')).toBe('whatsapp');
    expect(detectContactKind('08035550142')).toBe('whatsapp');
    expect(detectContactKind('123')).toBeNull();
    expect(detectContactKind('call me')).toBeNull();
  });

  it('reads followers with commas, refuses words and negatives', () => {
    expect(parseFollowers('2,500')).toBe(2500);
    expect(parseFollowers(950)).toBe(950);
    expect(parseFollowers('-3')).toBeNull();
    expect(parseFollowers('lots')).toBeNull();
    expect(parseFollowers('')).toBeNull();
  });
});

describe('parseCuratorApplication', () => {
  it('accepts a full form and tidies it', () => {
    const parsed = parseCuratorApplication(good);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.application).toMatchObject({
      platform: 'spotify',
      followers: 4210,
      genre: 'afrobeats',
      country: 'Nigeria',
      contact: 'ada@example.com',
      contactKind: 'email',
      note: 'Mostly Lagos listeners.',
    });
  });

  it('names the first field that is wrong', () => {
    expect(parseCuratorApplication({ ...good, playlistUrl: 'https://youtube.com/x' })).toMatchObject({
      ok: false,
      field: 'playlistUrl',
    });
    expect(parseCuratorApplication({ ...good, followers: 'many' })).toMatchObject({ ok: false, field: 'followers' });
    expect(parseCuratorApplication({ ...good, genre: 'jazz' })).toMatchObject({ ok: false, field: 'genre' });
    expect(parseCuratorApplication({ ...good, country: ' ' })).toMatchObject({ ok: false, field: 'country' });
    expect(parseCuratorApplication({ ...good, contact: 'hi' })).toMatchObject({ ok: false, field: 'contact' });
    expect(parseCuratorApplication({ ...good, note: 'x'.repeat(501) })).toMatchObject({ ok: false, field: 'note' });
  });

  it('keeps an empty note as null', () => {
    const parsed = parseCuratorApplication({ ...good, note: '   ' });
    expect(parsed.ok && parsed.application.note).toBeNull();
  });
});

describe('spam guard', () => {
  it('flags a filled hidden field or a form sent too fast', () => {
    const now = 1_000_000;
    expect(looksLikeBot({ website: 'http://spam' }, now)).toBe(true);
    expect(looksLikeBot({ startedAt: now - 500 }, now)).toBe(true);
    expect(looksLikeBot({ website: '', startedAt: now - 20_000 }, now)).toBe(false);
    expect(looksLikeBot({}, now)).toBe(false);
  });
});

describe('display helpers', () => {
  it('builds the summary line', () => {
    expect(applicationSummaryLine({ genre: 'afrobeats', followers: 4210, country: 'Nigeria' })).toBe(
      'Afrobeats · 4,210 followers · Nigeria'
    );
    expect(applicationSummaryLine({ genre: 'alte', followers: 950, country: 'Ghana' })).toBe('Alté · 950 followers · Ghana');
  });

  it('says how long ago in short form', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    expect(shortAgo('2026-10-24T10:00:00Z', now)).toBe('2h');
    expect(shortAgo('2026-10-23T11:00:00Z', now)).toBe('1d');
    expect(shortAgo('2026-10-24T11:59:30Z', now)).toBe('now');
  });
});
