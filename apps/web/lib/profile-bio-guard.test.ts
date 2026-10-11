import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Holds the wiring of "bios and one record" in place by reading the real
// sources, so a later change that quietly reads a bio from somewhere the rules
// do not cover fails here instead of in front of a stranger.

const APP_ROOT = path.join(__dirname, '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(APP_ROOT, ...parts), 'utf8');

/** Strip comments so prose that names a rule cannot satisfy or trip a check. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('a bio never rides on an unclaimed profile', () => {
  it('the public page loader strips and checks it', () => {
    const source = code(read('lib', 'person-public-server.ts'));
    expect(source).toContain('bioForPayload(');
    expect(source).toContain('isClaimedProfile(');
  });

  it("the person's own profile route strips it too", () => {
    expect(code(read('app', 'api', 'directory', 'profile', 'route.ts'))).toContain('bioForPayload(');
  });

  it('the directory list never selects or returns a bio at all', () => {
    const source = code(read('app', 'api', 'directory', 'route.ts'));
    expect(source).not.toMatch(/\bbio\b/);
  });

  it('no relationships read carries a bio', () => {
    const source = code(read('lib', 'relationships-server.ts'));
    expect(source).not.toMatch(/\bbio\b/);
  });
});

describe('one record: the directory reads the PUBLISHED kit', () => {
  const server = code(read('lib', 'profile-kit-server.ts'));

  it('the single-person loader goes through the public (published only) kit loader', () => {
    expect(server).toContain('loadPublicPressKit(');
    expect(server).toContain(".not('published_at', 'is', null)");
  });

  it('the batch reader filters on published kits and on visible sections', () => {
    const batch = server.slice(server.indexOf('loadKitCitiesForUsers'));
    expect(batch).toContain(".not('published_at', 'is', null)");
    expect(batch).toContain('published_content');
    expect(batch).toContain(".eq('hidden', false)");
    // The draft column must never be read for the directory.
    expect(batch).not.toMatch(/select\([^)]*\bcontent\b[^_]/);
  });

  it('the kit link is a single-artist scoped member, never a guess', () => {
    expect(server).toContain('pickArtistForMember(');
    expect(server).toContain(".eq('status', 'active')");
    expect(server).toContain(".not('artist_scope_id', 'is', null)");
  });

  it('the public page renders the resolved view, not the raw profile fields', () => {
    const page = code(read('app', 'p', '[slug]', 'page.tsx'));
    expect(page).toContain('view.bio');
    expect(page).toContain('view.links');
    expect(page).not.toContain('profile.bio');
    expect(page).not.toContain('profile.links');
  });
});

describe('Draft my bio', () => {
  const action = code(read('lib', 'urgans-actions', 'actions', 'directory-draft-bio.ts'));

  it('reads and writes only the actor own row', () => {
    // The profile read in execute, the profile read in apply, and the write
    // itself: each chain names the actor, not just the profile id.
    const profileReads = action.match(/from\(PROFILES_TABLE\)[\s\S]*?maybeSingle\(\)/g) || [];
    expect(profileReads).toHaveLength(2);
    for (const chain of profileReads) expect(chain).toContain(".eq('user_id', actor.id)");
    const write = action.slice(action.indexOf('.update({ bio: draft.bio })'));
    expect(write.slice(0, 120)).toContain(".eq('user_id', actor.id)");
  });

  it('writes the bio and nothing else', () => {
    expect(action).toContain('.update({ bio: draft.bio })');
  });

  it('refuses a stale accept before it writes', () => {
    expect(action.indexOf('decideBioApply(')).toBeGreaterThan(-1);
    expect(action.indexOf('decideBioApply(')).toBeLessThan(action.indexOf('.update('));
  });

  it('is not a one-shot: a person accepts it', () => {
    expect(action).not.toContain('oneShot');
  });

  it('the scope branch matches the profile owner before anything else', () => {
    const server = code(read('lib', 'urgans-actions', 'server.ts'));
    const branch = server.slice(server.indexOf("objectType === 'person_profile'"));
    expect(branch.indexOf('profileOwner !== user.id')).toBeGreaterThan(-1);
    expect(branch.indexOf('profileOwner !== user.id')).toBeLessThan(branch.indexOf('getTeamAccessForUser'));
  });

  it('the editor only offers it when the server says so', () => {
    const route = code(read('app', 'api', 'directory', 'profile', 'route.ts'));
    expect(route).toContain('canRunEmbeddedAction(');
    expect(route).toContain('!view.fromKit.bio');
  });
});
