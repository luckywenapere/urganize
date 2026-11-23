import { describe, expect, it } from 'vitest';
import { defaultSignInPath, isMusicHost, musicHref, rootPathForHost, teamHref } from './music-host';

describe('rootPathForHost', () => {
  it('opens music on the music address and the workspace elsewhere (#1378)', () => {
    expect(rootPathForHost('music.urganize.app')).toBe('/music');
    expect(rootPathForHost('MUSIC.urganize.app:443')).toBe('/music');
    expect(rootPathForHost('team.urganize.app')).toBe('/dashboard');
    expect(rootPathForHost('localhost:3000')).toBe('/dashboard');
    expect(rootPathForHost(null)).toBe('/dashboard');
  });
  it('does not mistake a look-alike for the music address', () => {
    expect(isMusicHost('music.urganize.app.evil.com')).toBe(false);
    expect(isMusicHost('notmusic.urganize.app')).toBe(false);
  });
});

describe('defaultSignInPath', () => {
  it('follows the address the sign-in happened on', () => {
    expect(defaultSignInPath('music.urganize.app')).toBe('/music');
    expect(defaultSignInPath('team.urganize.app')).toBe('/dashboard');
  });
});

describe('musicHref', () => {
  it('points the live workspace at the music address', () => {
    expect(musicHref('team.urganize.app')).toBe('https://music.urganize.app/music');
    expect(musicHref('app.urganize.app', '/music?upload=1')).toBe('https://music.urganize.app/music?upload=1');
  });
  it('stays relative on the music address, previews and local copies', () => {
    expect(musicHref('music.urganize.app')).toBe('/music');
    expect(musicHref('urganize-git-x.vercel.app')).toBe('/music');
    expect(musicHref('localhost:3917')).toBe('/music');
    expect(musicHref(null)).toBe('/music');
  });
});

describe('teamHref', () => {
  it('points the music address at the workspace address', () => {
    expect(teamHref('music.urganize.app')).toBe('https://team.urganize.app/dashboard');
    expect(teamHref('music.urganize.app', '/curator')).toBe('https://team.urganize.app/curator');
  });
  it('stays relative everywhere else', () => {
    expect(teamHref('team.urganize.app')).toBe('/dashboard');
    expect(teamHref('localhost:3917', '/curator')).toBe('/curator');
  });
});
