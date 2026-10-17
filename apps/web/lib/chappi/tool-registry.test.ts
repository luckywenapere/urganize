import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAPPI_TOOLS, getChappiTool, isConfirmationGated } from './tools';
import { MCP_TOOLS, MCP_TOOL_NAMES_ALLOWED, isMcpToolName } from '@/lib/mcp/tools';

/**
 * Structural invariants over the whole tool registry. These exist because the
 * registry is data, not code paths — a malformed entry fails at runtime inside
 * a model turn, where nobody is watching, rather than at build time.
 */
describe('Chappi tool registry', () => {
  it('has unique, snake_case tool names', () => {
    const names = CHAPPI_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name, `${name} should be snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('gives every tool a description and an object schema', () => {
    for (const tool of CHAPPI_TOOLS) {
      expect(tool.description.trim(), `${tool.name} needs a description`).not.toBe('');
      expect(tool.inputSchema.type, `${tool.name} schema`).toBe('object');
      expect(typeof tool.inputSchema.properties, `${tool.name} properties`).toBe('object');
    }
  });

  it('lists every required property in its schema', () => {
    for (const tool of CHAPPI_TOOLS) {
      for (const required of tool.inputSchema.required ?? []) {
        expect(
          Object.keys(tool.inputSchema.properties),
          `${tool.name} requires "${required}" but does not declare it`
        ).toContain(required);
      }
    }
  });

  /**
   * The security tripwire. A confirmation-gated tool must never be reachable
   * over MCP, because MCP has no UI to show the card with — an MCP client
   * calling it would sail straight past the permission step the gate exists
   * for. Adding a gated tool without excluding it fails here.
   */
  it('never exposes a confirmation-gated tool over MCP', () => {
    const gated = CHAPPI_TOOLS.filter((tool) => tool.confirm).map((tool) => tool.name);
    expect(gated.length, 'expected at least one gated tool').toBeGreaterThan(0);
    for (const name of gated) {
      expect(isMcpToolName(name), `${name} is gated and must be excluded from MCP`).toBe(false);
    }
  });

  it('only gates mutating tools', () => {
    for (const tool of CHAPPI_TOOLS) {
      if (tool.confirm) {
        expect(tool.kind, `${tool.name} is gated so it should be a mutation`).toBe('mutate');
      }
    }
  });

  it('reports gated tools through isConfirmationGated', () => {
    expect(isConfirmationGated('delete_release')).toBe(true);
    expect(isConfirmationGated('list_releases')).toBe(false);
    expect(isConfirmationGated('nonexistent_tool')).toBe(false);
  });

  it('gates every delete tool', () => {
    const deleteTools = CHAPPI_TOOLS.filter((tool) => tool.name.startsWith('delete_'));
    expect(deleteTools.length).toBeGreaterThan(0);
    for (const tool of deleteTools) {
      expect(Boolean(tool.confirm), `${tool.name} deletes and must be gated`).toBe(true);
    }
  });
});

// ── The MCP allow-list, and the mistake it shipped once ──────────────────────
//
// create_note was advertised in tools/list from the day MCP existed and could
// never work: it proxies POST /api/notes by internal fetch, and that route used
// the plain auth helper, which rejects an MCP credential. Nothing caught it —
// not a build, not a lint, not the tool count — because an advertised tool that
// 401s looks exactly like a tool the user asked for wrongly.
//
// These tests read the actual sources rather than a fixture, the way
// lib/account-export.test.ts guards its own route: the point is to fail when the
// CODE drifts, not when someone forgets to update a list of expectations.
// ─────────────────────────────────────────────────────────────────────────────
// Shared source scanning
//
// Hoisted to module scope so the two structural guards below read the registry
// and the route tree through ONE implementation. They were inside the MCP
// describe until 2026-09-07, when the flag-gate guard needed the same path
// resolution — and a second copy of it is exactly the drift this repo keeps
// having to correct.
// ─────────────────────────────────────────────────────────────────────────────

const familyDir = path.join(__dirname, 'tool-families');
const apiDir = path.join(__dirname, '..', '..', 'app', 'api');

/** Split every family source into one chunk per tool, keyed by name. The
 *  four-space indentation on the `name:` key is load-bearing for this split. */
function readToolSources(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of fs.readdirSync(familyDir)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = fs.readFileSync(path.join(familyDir, file), 'utf8');
    const chunks = source.split(/\n\s{4}name: '/);
    for (const chunk of chunks.slice(1)) {
      const name = chunk.slice(0, chunk.indexOf("'"));
      out.set(name, chunk);
    }
  }
  return out;
}

/** Resolve an internal-fetch path to the route file that serves it. */
function resolveRouteFile(apiPath: string): string | null {
  // Drop any query string: a tool that reads `?calendarId=...` still reaches
  // the same route file, and leaving it on made three real paths unresolvable.
  const withoutQuery = apiPath.split('?')[0];
  const segments = withoutQuery.replace(/^\/api\//, '').split('/').filter(Boolean);
  let dir = apiDir;
  for (const segment of segments) {
    const interpolation = segment.indexOf('${');
    if (interpolation === 0) {
      // A whole `${...}` segment is a dynamic one: find the [param] dir.
      const dynamic = fs
        .readdirSync(dir, { withFileTypes: true })
        .find((entry) => entry.isDirectory() && entry.name.startsWith('['));
      if (!dynamic) return null;
      dir = path.join(dir, dynamic.name);
      continue;
    }
    // A literal with an interpolation stuck to the end of it — the shape a
    // conditional query builder produces, e.g. `playlists${query ? ...`.
    // The literal prefix is the real segment.
    const literal = interpolation > 0 ? segment.slice(0, interpolation) : segment;
    const next = path.join(dir, literal);
    if (!fs.existsSync(next)) return null;
    dir = next;
  }
  const route = path.join(dir, 'route.ts');
  return fs.existsSync(route) ? route : null;
}

describe('MCP allow-list integrity', () => {
  it('names only tools that exist in the registry', () => {
    for (const name of MCP_TOOL_NAMES_ALLOWED) {
      expect(getChappiTool(name), `${name} is allow-listed but not registered`).toBeTruthy();
    }
    expect(MCP_TOOLS).toHaveLength(MCP_TOOL_NAMES_ALLOWED.length);
  });

  it('exposes no confirmation-gated tool', () => {
    // The same invariant as the test above, asserted from the allow-list's side:
    // executeToolCall never reads tool.confirm, so this list IS the gate.
    for (const name of MCP_TOOL_NAMES_ALLOWED) {
      expect(getChappiTool(name)?.confirm, `${name} is gated`).toBeUndefined();
    }
  });

  it('exposes no tool whose whole effect is a clientAction', () => {
    // Narrower than "returns no clientAction", and deliberately so: several
    // exposed tools carry one as a bonus (create_release hands the app a
    // navigation target) and toolResultToMcp drops it by type, which
    // protocol.test.ts asserts. What must never be exposed is a tool that does
    // NOTHING BUT return one, because over MCP that is a tool advertising a
    // capability it silently cannot deliver.
    for (const name of ['navigate', 'upload_cover_art', 'share_release'] as const) {
      expect(getChappiTool(name), `${name} should still exist`).toBeTruthy();
      expect(
        MCP_TOOL_NAMES_ALLOWED.includes(name),
        `${name} does nothing but return a clientAction and must not be exposed`
      ).toBe(false);
    }
  });

  /**
   * Isolate one exported handler's body.
   *
   * Checking the whole file for 'OrInternal' is NOT enough, and that mistake was
   * caught by mutation-testing this very test: reverting the create_note fix
   * left the import line in place, so a whole-file match still passed. It also
   * has to be per-METHOD, because a route legitimately opts its POST in and
   * leaves its GET on the plain helper — which is exactly what /api/notes does.
   */
  function readHandlerBody(routeSource: string, method: string): string | null {
    const start = routeSource.indexOf(`export async function ${method}(`);
    if (start < 0) return null;
    const rest = routeSource.slice(start + 1);
    const nextExport = rest.indexOf('\nexport ');
    return nextExport < 0 ? rest : rest.slice(0, nextExport);
  }

  it('only proxies routes whose handler accepts the internal actor', () => {
    const sources = readToolSources();
    let checked = 0;

    for (const name of MCP_TOOL_NAMES_ALLOWED) {
      const source = sources.get(name) || '';
      for (const match of source.matchAll(
        /callInternalApi\(\s*ctx,\s*[`'"]([^`'"]+)[^)]*?method:\s*'([A-Z]+)'/g
      )) {
        const [, apiPath, method] = match;
        const routeFile = resolveRouteFile(apiPath);
        expect(routeFile, `could not resolve a route file for ${apiPath} (${name})`).toBeTruthy();

        const body = readHandlerBody(fs.readFileSync(routeFile as string, 'utf8'), method);
        expect(body, `${routeFile} exports no ${method} handler`).toBeTruthy();
        expect(
          /OrInternal\(/.test(body as string),
          `${name} proxies ${method} ${apiPath}, whose handler does not accept the internal actor — it will 401 over MCP`
        ).toBe(true);
        checked += 1;
      }
    }

    // Guards against the regex quietly matching nothing and the test passing
    // vacuously, which is how this class of check usually rots — and is what
    // the first version of it did.
    expect(checked, 'expected at least one proxied route to verify').toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flag-gate translation
//
// Most of this product is behind a NEXT_PUBLIC_FEATURE_* flag, and a
// flag-gated route answers with exactly `{ error: 'Not found.' }` — checked
// before auth, so it cannot be told apart from a route that does not exist.
// A tool that does not translate that reports "not found" to the user, who
// then reasonably concludes their release or their show is gone.
//
// isFlagGateOff (tool-families/shared.ts) is the translation, and the reason
// it happens per REQUEST rather than by filtering the registry is that
// NEXT_PUBLIC_* reads are inlined at build time — a registry-level gate would
// bake one environment's answer into the bundle.
//
// So: whether a route is flag-gated is derived from the route tree itself, not
// from a list kept here. A list would go stale the first time a flag moved.
// ─────────────────────────────────────────────────────────────────────────────
describe('flag-gate translation', () => {
  /** Source with comments removed. app/api/releases/route.ts NAMES a feature
   *  flag in its own prose while never gating on one, and a raw scan reads
   *  that as a gate — the same false positive
   *  lib/issue-reports-route-guard.test.ts had to strip for. */
  function code(file: string): string {
    return fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
  }

  /**
   * A route file plus every `_shared.ts` from its own group up to app/api,
   * concatenated.
   *
   * Read as ONE unit deliberately: the two halves of a gate routinely live in
   * DIFFERENT files. app/api/notes/_shared.ts reads the flag and
   * app/api/notes/route.ts writes the 404 body, while
   * app/api/events/_shared.ts happens to hold both. Requiring both halves in a
   * single file classified almost every gated route as ungated, which is how
   * the first version of this test passed a mutation that stripped
   * isFlagGateOff out of three tools.
   */
  function routeUnit(routeFile: string): string {
    const parts = [code(routeFile)];
    let dir = path.dirname(routeFile);
    while (dir.startsWith(apiDir)) {
      const shared = path.join(dir, '_shared.ts');
      if (fs.existsSync(shared)) parts.push(code(shared));
      if (dir === apiDir) break;
      dir = path.dirname(dir);
    }
    return parts.join('\n');
  }

  /** Both halves of the contract isFlagGateOff matches: the route group reads
   *  a feature flag AND answers with that body. Either alone is not this
   *  contract — a flag can produce a 400, and a 404 can be an ownership miss.
   *
   *  Both spellings, matching isFlagGateOff itself: newer groups write
   *  'Not found.' and thirteen older handlers write 'Not found'. */
  function isFlagGatedRoute(routeFile: string): boolean {
    const unit = routeUnit(routeFile);
    return /NEXT_PUBLIC_FEATURE_/.test(unit) && /'Not found\.?'/.test(unit);
  }

  it('translates the flag-off 404 in every tool that proxies a gated route', () => {
    const sources = readToolSources();
    const offenders: string[] = [];
    let checked = 0;

    for (const [name, chunk] of sources) {
      // Every internal path this tool reaches, quoted or interpolated.
      const paths = [...chunk.matchAll(/callInternalApi\(\s*ctx,\s*[`']([^`']+)[`']/g)].map(
        (match) => match[1]
      );
      const gated = paths
        .map((apiPath) => resolveRouteFile(apiPath))
        .filter((file): file is string => Boolean(file))
        .some(isFlagGatedRoute);
      if (!gated) continue;
      checked += 1;
      if (!/isFlagGateOff\(/.test(chunk)) offenders.push(name);
    }

    // Anti-vacuity: if the regex stops matching, this test must fail loudly
    // rather than pass by checking nothing.
    expect(checked, 'expected to find tools proxying gated routes').toBeGreaterThan(0);
    expect(
      offenders,
      `these tools reach a feature-flagged route without translating its 404: ${offenders.join(
        ', '
      )}. Use isFlagGateOff(res) so a switched-off feature says so instead of "not found".`
    ).toEqual([]);
  });
});
