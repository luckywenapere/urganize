import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural rules for saved UrgAns chats that no unit test can reach,
// enforced by reading the source rather than trusting a comment:
//
//   - chats are PRIVATE: every query on the table is scoped to its owner
//   - saving a chat is never METERED against the monthly UrgAns ceiling
//   - every route answers "not found" while the feature is off, BEFORE auth
//   - the stores cannot form an import cycle with the auth store
//   - the table has row level security and dies with its owner's account

const WEB = join(__dirname, '..', '..');
const REPO = join(WEB, '..', '..');

const read = (...parts: string[]) => readFileSync(join(...parts), 'utf8');

/**
 * Comments out, strings and newlines kept, in ONE pass. Two regex passes
 * (block comments, then line comments) break on a line comment that contains
 * "/*" — a route path like app/api/urgans/* is exactly that — which is how
 * another guard in this repo once hid real code while passing.
 */
function stripComments(source: string): string {
  let out = '';
  let quote: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      out += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(index, stop).replace(/[^\n]/g, '');
      index = stop - 1;
      continue;
    }
    out += char;
  }
  return out;
}

const ROUTES = [
  join(WEB, 'app', 'api', 'urgans', 'conversations', 'route.ts'),
  join(WEB, 'app', 'api', 'urgans', 'conversations', '[conversationId]', 'route.ts'),
  // The one Assistant chat (#1207): earlier pages, and folding old sessions in.
  join(WEB, 'app', 'api', 'urgans', 'conversations', 'earlier', 'route.ts'),
  join(WEB, 'app', 'api', 'urgans', 'conversations', 'fold', 'route.ts'),
];

/** Each exported handler's body, keyed by method. */
function handlers(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g;
  const starts = [...source.matchAll(pattern)];
  starts.forEach((match, position) => {
    const from = match.index ?? 0;
    const to = starts[position + 1]?.index ?? source.length;
    found.set(match[1], source.slice(from, to));
  });
  return found;
}

describe('saved chats are private to their owner', () => {
  const server = stripComments(read(WEB, 'lib', 'chappi', 'conversations-server.ts'));

  it('scopes every query on the table to the owner', () => {
    const chains = server.split('.from(URGANS_CONVERSATIONS_TABLE)').slice(1);
    // A split that found nothing would pass every assertion below.
    expect(chains.length).toBeGreaterThanOrEqual(5);
    for (const chain of chains) {
      const statement = chain.slice(0, chain.indexOf(';'));
      expect(statement).toMatch(/owner_user_id/);
    }
  });

  it('reads no other table', () => {
    const tables = [...server.matchAll(/\.from\(([^)]+)\)/g)].map((match) => match[1]);
    expect(new Set(tables)).toEqual(new Set(['URGANS_CONVERSATIONS_TABLE']));
  });
});

describe('the chat routes', () => {
  for (const path of ROUTES) {
    const source = stripComments(read(path));
    const label = path.replace(WEB, '');

    it(`are never metered: ${label}`, () => {
      // An UrgAns action is billed where the model runs (/api/urgans). Saving
      // what the user already saw costs them nothing and must never count.
      expect(source).not.toMatch(/urgans-usage/);
      expect(source).not.toMatch(/recordUrgansAction|checkUrgansAllowance|recordBillingEvent/);
    });

    it(`check the feature flag before auth in every handler: ${label}`, () => {
      const bodies = handlers(source);
      expect(bodies.size).toBeGreaterThan(0);
      for (const [method, body] of bodies) {
        const flag = body.indexOf('isChappiHistoryEnabled()');
        const auth = body.indexOf('requireUrgansAccess(');
        expect(flag, method).toBeGreaterThanOrEqual(0);
        expect(auth, method).toBeGreaterThan(flag);
      }
    });

    it(`use the AI gate, the normal paywalled gate plus the credits-only admission: ${label}`, () => {
      // requireUrgansAccess wraps requireAuthenticatedAdmin, so curators, a bad token and every other
      // refusal behave exactly as before; only a paywall refusal for a credits-only team is admitted.
      expect(source).toMatch(/requireUrgansAccess/);
      expect(source).not.toMatch(/\bgetAuthenticatedUser\(/);
    });
  }
});

describe('import direction', () => {
  it('keeps the transcript store from importing the history store', () => {
    const chappi = stripComments(read(WEB, 'stores', 'useChappiStore.ts'));
    expect(chappi).not.toMatch(/useChappiHistoryStore/);
  });

  it('keeps the history store from importing the auth store', () => {
    // auth-store runs the history store's sign-out reset (lib/sign-out-resets.ts).
    const history = stripComments(read(WEB, 'stores', 'useChappiHistoryStore.ts'));
    expect(history).not.toMatch(/auth-store/);
  });

  it('keeps the pure module and the browser cache free of stores', () => {
    for (const file of [
      'conversation-history.ts',
      'conversation-cache.ts',
      'conversation-cache-clear.ts',
      'history-flag.ts',
      'history-warm.ts',
    ]) {
      const source = stripComments(read(WEB, 'lib', 'chappi', file));
      expect(source, file).not.toMatch(/@\/stores\//);
    }
  });
});

describe('the table', () => {
  const migration = stripComments(
    read(REPO, 'supabase', 'migrations', '20260924100000_urgans_conversations.sql').replace(
      /--.*$/gm,
      ''
    )
  ).toLowerCase();

  it('has row level security on', () => {
    expect(migration).toMatch(/alter table public\.urgans_conversations enable row level security/);
  });

  it('gives every policy to the owner and nobody else', () => {
    const policies = migration.match(/create policy/g) ?? [];
    expect(policies).toHaveLength(4);
    expect((migration.match(/owner_user_id = auth\.uid\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('dies with its owner account', () => {
    expect(migration).toMatch(/references auth\.users\s*\(id\)\s+on delete cascade/);
  });
});
