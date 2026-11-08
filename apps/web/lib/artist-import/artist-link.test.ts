import { describe, expect, it } from 'vitest';
import { artistLinkMessage, extractLink, looksLikeLink, parseArtistLink } from './artist-link';

describe('looksLikeLink', () => {
  it('leaves names alone, even ones with dots or slashes', () => {
    for (const name of ['Dorian', 'Burna Boy', 'will.i.am', 'AC/DC', 'Mr. Eazi', 'T.I', 'deezer.com', '']) {
      expect(looksLikeLink(name)).toBe(false);
    }
  });

  it('sees a link with or without https', () => {
    expect(looksLikeLink('https://www.deezer.com/en/artist/27')).toBe(true);
    expect(looksLikeLink('  music.apple.com/ng/artist/dorian/1544  ')).toBe(true);
    expect(looksLikeLink('audiomack.com/dorian')).toBe(true);
    expect(looksLikeLink('spotify:artist:3wcj11K77LjEY1PkEazffa')).toBe(true);
  });

  it('finds a link inside shared text', () => {
    expect(looksLikeLink('Listen to Dorian on Deezer! https://link.deezer.com/s/30ZbS1Ld8c')).toBe(true);
  });
});

describe('extractLink', () => {
  it('pulls the link out of shared text and drops trailing punctuation', () => {
    expect(extractLink('Check Dorian out (https://www.deezer.com/artist/27).')).toBe('https://www.deezer.com/artist/27');
  });

  it('adds https to a bare address', () => {
    expect(extractLink('deezer.com/artist/27')).toBe('https://deezer.com/artist/27');
  });

  it('gives null for a name', () => {
    expect(extractLink('Dorian')).toBeNull();
  });
});

describe('parseArtistLink', () => {
  it('is null for a name, so the box searches by name', () => {
    expect(parseArtistLink('Dorian')).toBeNull();
    expect(parseArtistLink('will.i.am')).toBeNull();
  });

  describe('Deezer', () => {
    it('reads an artist link with or without a language', () => {
      expect(parseArtistLink('https://www.deezer.com/en/artist/27')).toEqual({ kind: 'artist', provider: 'deezer', id: '27', country: null });
      expect(parseArtistLink('https://deezer.com/artist/27?utm_source=deezer&host=0')).toEqual({
        kind: 'artist',
        provider: 'deezer',
        id: '27',
        country: null,
      });
      expect(parseArtistLink('www.deezer.com/pt-br/artist/5463/top_track')).toMatchObject({ kind: 'artist', id: '5463' });
    });

    it('says a song, album or playlist link is not the artist page', () => {
      expect(parseArtistLink('https://www.deezer.com/en/track/3135556')).toEqual({ kind: 'not-artist', what: 'song' });
      expect(parseArtistLink('https://www.deezer.com/album/302127')).toEqual({ kind: 'not-artist', what: 'album' });
      expect(parseArtistLink('https://www.deezer.com/en/playlist/908622995')).toEqual({ kind: 'not-artist', what: 'playlist' });
    });

    it('marks a share link to open first', () => {
      expect(parseArtistLink('https://link.deezer.com/s/30ZbS1Ld8cLbM2XQnQqb3')).toEqual({
        kind: 'short',
        url: 'https://link.deezer.com/s/30ZbS1Ld8cLbM2XQnQqb3',
      });
      expect(parseArtistLink('https://deezer.page.link/abc123')).toMatchObject({ kind: 'short' });
    });

    it('does not trust an id that is not plain digits', () => {
      expect(parseArtistLink('https://www.deezer.com/artist/27abc')).toEqual({ kind: 'broken' });
      expect(parseArtistLink('https://www.deezer.com/en/')).toEqual({ kind: 'broken' });
    });
  });

  describe('Apple Music', () => {
    it('reads an artist link with the store country', () => {
      expect(parseArtistLink('https://music.apple.com/ng/artist/burna-boy/1029395036')).toEqual({
        kind: 'artist',
        provider: 'itunes',
        id: '1029395036',
        country: 'ng',
      });
      expect(parseArtistLink('https://music.apple.com/us/artist/1029395036?l=es')).toMatchObject({ id: '1029395036', country: 'us' });
      expect(parseArtistLink('https://geo.music.apple.com/gb/artist/burna-boy/1029395036')).toMatchObject({ id: '1029395036', country: 'gb' });
    });

    it('reads the id when the link is to a page inside the artist', () => {
      expect(parseArtistLink('https://music.apple.com/ng/artist/burna-boy/1029395036/see-all?section=top-songs')).toMatchObject({
        kind: 'artist',
        id: '1029395036',
      });
    });

    it('is not fooled by a name that is all digits', () => {
      expect(parseArtistLink('https://music.apple.com/us/artist/112/1234567')).toMatchObject({ id: '1234567' });
      expect(parseArtistLink('https://music.apple.com/us/artist/1029395036/see-all')).toMatchObject({ id: '1029395036' });
    });

    it('reads the old iTunes artist link', () => {
      expect(parseArtistLink('https://itunes.apple.com/ng/artist/burna-boy/id1029395036?mt=1')).toEqual({
        kind: 'artist',
        provider: 'itunes',
        id: '1029395036',
        country: 'ng',
      });
    });

    it('says a song, album, playlist or video link is not the artist page', () => {
      expect(parseArtistLink('https://music.apple.com/ng/album/last-last/1621934003?i=1621934004')).toEqual({ kind: 'not-artist', what: 'song' });
      expect(parseArtistLink('https://music.apple.com/ng/song/last-last/1621934004')).toEqual({ kind: 'not-artist', what: 'song' });
      expect(parseArtistLink('https://music.apple.com/ng/album/love-damini/1621934003')).toEqual({ kind: 'not-artist', what: 'album' });
      expect(parseArtistLink('https://music.apple.com/ng/playlist/afrobeats-hits/pl.dc349df19c6f410d874c197db63ecfed')).toEqual({
        kind: 'not-artist',
        what: 'playlist',
      });
      expect(parseArtistLink('https://music.apple.com/ng/music-video/last-last/1630000000')).toEqual({ kind: 'not-artist', what: 'video' });
    });
  });

  describe('services we cannot read', () => {
    it('names the service', () => {
      expect(parseArtistLink('https://open.spotify.com/artist/3wcj11K77LjEY1PkEazffa?si=abc')).toEqual({ kind: 'unsupported', service: 'Spotify' });
      expect(parseArtistLink('https://open.spotify.com/intl-fr/track/1')).toEqual({ kind: 'unsupported', service: 'Spotify' });
      expect(parseArtistLink('spotify:artist:3wcj11K77LjEY1PkEazffa')).toEqual({ kind: 'unsupported', service: 'Spotify' });
      expect(parseArtistLink('https://spotify.link/xyz')).toEqual({ kind: 'unsupported', service: 'Spotify' });
      expect(parseArtistLink('audiomack.com/dorian')).toEqual({ kind: 'unsupported', service: 'Audiomack' });
      expect(parseArtistLink('https://www.boomplay.com/artists/123')).toEqual({ kind: 'unsupported', service: 'Boomplay' });
      expect(parseArtistLink('https://youtu.be/abc')).toEqual({ kind: 'unsupported', service: 'YouTube' });
      expect(parseArtistLink('https://music.youtube.com/channel/abc')).toEqual({ kind: 'unsupported', service: 'YouTube' });
      expect(parseArtistLink('https://soundcloud.com/dorian')).toEqual({ kind: 'unsupported', service: 'SoundCloud' });
      expect(parseArtistLink('https://www.instagram.com/dorian/')).toEqual({ kind: 'unsupported', service: 'Instagram' });
    });

    it('calls any other site unknown', () => {
      expect(parseArtistLink('https://linktr.ee/dorian')).toEqual({ kind: 'unknown' });
    });

    it('goes by the real host, not a lookalike', () => {
      expect(parseArtistLink('https://music.apple.com@evil.example/ng/artist/x/1')).toEqual({ kind: 'unknown' });
      expect(parseArtistLink('https://deezer.com.evil.example/artist/27')).toEqual({ kind: 'unknown' });
      expect(parseArtistLink('https://notdeezer.com/artist/27')).toEqual({ kind: 'unknown' });
    });

    it('refuses anything that is not a web address', () => {
      expect(parseArtistLink('javascript:alert(1)')).toBeNull();
      expect(parseArtistLink('ftp://deezer.com/artist/27')).toEqual({ kind: 'unknown' });
    });
  });
});

describe('artistLinkMessage', () => {
  it('says which links to use', () => {
    expect(artistLinkMessage({ kind: 'unsupported', service: 'Audiomack' })).toBe(
      "We can't read Audiomack links. Paste their Apple Music or Deezer link."
    );
    expect(artistLinkMessage({ kind: 'unknown' })).toBe("We can't read that link. Paste their Apple Music or Deezer link.");
  });

  it('asks for the artist page when the link is to a song or album', () => {
    expect(artistLinkMessage({ kind: 'not-artist', what: 'song' })).toBe("That's a link to a song. Paste the link to their artist page.");
    expect(artistLinkMessage({ kind: 'not-artist', what: 'album' })).toBe("That's a link to an album. Paste the link to their artist page.");
  });

  it('asks them to check a link that opened nothing', () => {
    expect(artistLinkMessage({ kind: 'broken' })).toBe("That link didn't open an artist. Check it and try again.");
  });
});
