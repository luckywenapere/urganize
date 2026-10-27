import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A team can only ever read and write its OWN records. Every route gets there
// through one gate (resolveRecordsContext), which takes the team from the
// signed-in user; the server layer filters every query on that workspace id.
// A comment cannot hold that, so this reads the real sources.

const API = join(__dirname, '..', 'app', 'api');
const ROUTES = [join(API, 'records'), join(API, 'workspace', 'artists', '[artistId]', 'records')];
const SERVER = join(__dirname, 'next-records-server.ts');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.ts' ? [path] : [];
  });
}

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('next record routes', () => {
  const files = ROUTES.flatMap(routeFiles);

  it('finds the routes', () => {
    expect(files.length).toBe(7);
  });

  it.each(files)('%s resolves the team through the one gate, once per handler', (file) => {
    const source = stripComments(readFileSync(file, 'utf8'));
    const handlers = source.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? [];
    const gates = source.match(/resolveRecordsContext\(/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    expect(gates.length).toBe(handlers.length);
  });

  it.each(files)('%s never takes a workspace or artist from the body', (file) => {
    const source = stripComments(readFileSync(file, 'utf8'));
    expect(source).not.toMatch(/workspace_?[iI]d\s*[:=]\s*(body|parsed|input)\b/);
    expect(source).not.toMatch(/\.from\(/);
  });

  it('writes declare themselves writes', () => {
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const match of source.matchAll(/export async function (POST|PATCH|PUT|DELETE)[\s\S]*?resolveRecordsContext\([^)]*\{ write: (true|false) \}/g)) {
        expect(match[2], `${file} ${match[1]}`).toBe('true');
      }
    }
  });
});

describe('next record server', () => {
  const source = stripComments(readFileSync(SERVER, 'utf8'));

  it('filters every record, song and session query on the team', () => {
    const queries = source.split(/\.from\(/).slice(1);
    for (const query of queries) {
      const table = query.slice(0, query.indexOf(')'));
      // Links and people are read by session ids that were themselves read on
      // the team; contacts filter on workspace_id; artists likewise.
      if (/RECORD_SESSION_(PEOPLE|SONGS)_TABLE/.test(table) && /\.(select|insert)\(/.test(query.slice(0, 200))) continue;
      expect(query.slice(0, 400), table).toMatch(/workspace_id/);
    }
  });
});
