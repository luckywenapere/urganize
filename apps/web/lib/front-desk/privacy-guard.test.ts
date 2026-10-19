import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Privacy and flag guard for the front desk (staff-engineer pass). A source scan,
// so a later edit cannot quietly open a route.
const root = join(__dirname, '..', '..');
const apiDir = join(root, 'app', 'api', 'front-desk');

const routeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.ts' ? [path] : [];
  });

describe('front desk routes', () => {
  const files = routeFiles(apiDir);

  it('exist', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    it(`${rel} gates every handler behind the flag and an owner check`, () => {
      const handlers = source.match(/export async function (GET|POST|PUT|PATCH|DELETE)/g) ?? [];
      expect(handlers.length).toBeGreaterThan(0);
      const gates = source.match(/await requireDesk(Person|Curator|ArtistPitch|CuratorPitch)\(/g) ?? [];
      expect(gates.length).toBe(handlers.length);
    });
    it(`${rel} never selects release, owner or team columns for a curator`, () => {
      if (!rel.includes('/inbox')) return;
      expect(source).not.toMatch(/release_id|owner_user_id|workspace/);
    });
    it(`${rel} never calls a model`, () => {
      expect(source).not.toMatch(/openai|anthropic|generateText|chat\.completions|ai-provider/i);
    });
  }

  it('the artist gate scopes to ONE visible pitch and answers 404 otherwise', () => {
    const shared = readFileSync(join(apiDir, '_shared.ts'), 'utf8');
    expect(shared).toContain('ensureReleaseVisible(auth.adminClient, pitch.releaseId, auth.user)');
    expect(shared).toContain("if ('error' in visible) return { error: notFound() }");
    expect(shared).toContain('pitch.curatorUserId !== auth.user.id');
  });

  it('the migration is additive with RLS on and no policies', () => {
    const sql = readFileSync(join(root, '..', '..', 'supabase', 'migrations', '20261018210000_curator_front_desk.sql'), 'utf8');
    const statements = sql.replace(/--.*$/gm, '');
    expect(statements).not.toMatch(/\bdrop\s+table\b|\balter\s+table\s+public\.(playlist_pitches|curator_profiles|curator_playlists)\b|\bdelete\s+from\b|\bupdate\s+public\./i);
    expect(statements).not.toMatch(/create\s+policy/i);
    for (const table of ['curator_desk_terms', 'pitch_desk_questions', 'pitch_desk_answers']) {
      expect(statements).toContain(`alter table public.${table} enable row level security`);
    }
  });
});
