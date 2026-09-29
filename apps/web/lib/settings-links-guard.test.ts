import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SETTINGS_SEGMENTS,
  legacySettingsTarget,
  type SettingsRequest,
} from './settings-nav';

// Settings is a pop-up now (2026-09-29) and /settings is only a redirect stub.
// Nothing new should link to the old tabbed page, because each such link costs a
// redirect hop and, from a page that is not the dashboard, throws the person off
// the page they were on. Scanning the source means a NEW file doing it fails
// too, which a fixed list of known callers could not catch.

const ROOT = join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'public']);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

/** Strip comments, so prose that names the old URLs (like the stub's own header)
 *  is not mistaken for a link. Single pass: see the textile guard's note on why a
 *  regex over the whole file eats real code. */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
    } else if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      out += ch;
      i += 1;
    }
  }
  return out;
}

const ALLOWED = new Set(
  [
    // The stub itself, and the map that translates the old links.
    'app/settings/SettingsRedirect.tsx',
    'lib/settings-nav.ts',
    // Server-built links that leave the app: an email cannot open a pop-up, so it
    // links to the old URL and lets the stub translate it.
    'lib/work-requests-server.ts',
    // A producer whose only consumer is a client action the stub still handles.
    'app/api/releases/[releaseId]/route.ts',
  ].map((p) => p.split('/').join(sep))
);

describe('links to the old settings page', () => {
  it('no file builds a /settings?tab= or /settings# link outside the stub and the translator', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file);
      if (ALLOWED.has(rel) || /\.test\.tsx?$/.test(rel)) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      if (/\/settings\?tab=|\/settings#/.test(code)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe('every old link still lands somewhere real', () => {
  const OLD_LINKS: Array<[string, string]> = [
    ['', ''],
    ['?tab=account', ''],
    ['?tab=workspace', ''],
    ['?tab=team', ''],
    ['?tab=notifications', ''],
    ['?tab=workspace', '#brand-colors'],
    ['', '#teammates'],
    ['', '#team-logins'],
    ['', '#directory'],
    ['', '#connected-apps'],
    ['?tab=nonsense', '#nonsense'],
  ];

  it.each(OLD_LINKS)('%s%s resolves to a real segment or the menu', (search, hash) => {
    const { segment } = legacySettingsTarget(search, hash);
    const valid: SettingsRequest[] = ['menu', ...SETTINGS_SEGMENTS];
    expect(valid).toContain(segment);
  });
});
