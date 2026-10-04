import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural guard for the house icon set (components/icons/).
 *
 * Every icon in the app is imported from ONE module, which merges 41
 * hand-drawn house marks with the lucide long tail. That merge is the thing
 * that can silently break: a name imported from the shim but not exported by
 * it fails at build, but the two ways it rots quietly are
 *
 *   1. a file going back to `lucide-react` directly, which reintroduces the
 *      stroke-weight mismatch the shim exists to remove, and
 *   2. a house icon being deleted or renamed while call sites still ask for
 *      it under the old name.
 *
 * A fixed list of names would only catch a rename. These scan the real source
 * instead, so a NEW file breaking the rule fails too — the approach
 * tool-registry.test.ts already uses for the Chappi/MCP tool registries.
 */

const WEB_ROOT = join(__dirname, '..');
const ICONS_DIR = join(WEB_ROOT, 'components', 'icons');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'assets', 'public']);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Comments are prose ABOUT the rules and must not satisfy them. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FILES = sourceFiles(WEB_ROOT);

function namesImportedFrom(source: string, specifier: string): string[] {
  const names: string[] = [];
  const re = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]+)\\}\\s*from\\s*['"]${specifier}['"]`, 'gs');
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  return names;
}

describe('icon registry', () => {
  it('routes every icon import through components/icons', () => {
    const offenders = FILES.filter((file) => {
      if (file.startsWith(ICONS_DIR)) return false; // the shim itself must.
      return /from\s*['"]lucide-react['"]/.test(stripComments(readFileSync(file, 'utf8')));
    }).map((file) => file.slice(WEB_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });

  it('exports every name the app imports from it', async () => {
    const shim = await import('@/components/icons');
    const missing = new Set<string>();

    for (const file of FILES) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const name of namesImportedFrom(source, '@/components/icons')) {
        // Type-only exports are erased at runtime, so they cannot be probed
        // here — `next build` is what type-checks those.
        if (name === 'LucideIcon' || name === 'LucideProps') continue;
        if (!(name in shim)) missing.add(name);
      }
    }

    expect([...missing]).toEqual([]);
  });

  it('draws every house icon as a 24-viewBox currentColor svg', async () => {
    const house = await import('@/components/icons/house');
    const source = readFileSync(join(ICONS_DIR, 'house.tsx'), 'utf8');
    const drawn = [...source.matchAll(/^export const (\w+) = icon\(/gm)].map((m) => m[1]);

    expect(drawn.length).toBe(41);
    // A forwardRef component is an OBJECT, not a function — which is the whole
    // point: it is the same shape lucide exports, so the two sets are
    // interchangeable in a typed array or prop.
    for (const name of drawn) {
      const mark = (house as Record<string, { $$typeof?: symbol; displayName?: string }>)[name];
      expect(mark).toBeDefined();
      expect(mark.displayName).toBe(name);
    }

    // The shared icon() factory is the only place these are set, so asserting
    // it once covers all 41 — and pins the contract that makes them drop-in
    // replacements for lucide, in the type system as well as at runtime.
    expect(source).toContain('viewBox="0 0 24 24"');
    expect(source).toContain("fill=\"none\"");
    expect(source).toContain("color = 'currentColor'");
  });

  it('keeps the four-element ceiling that made the marks legible at 16px', () => {
    const source = readFileSync(join(ICONS_DIR, 'house.tsx'), 'utf8');
    const bodies = [...source.matchAll(/export const (\w+) = icon\(\s*'[^']+',\s*<>([\s\S]*?)<\/>\s*\);/g)];

    expect(bodies.length).toBe(41);
    const overCrowded = bodies
      .map(([, name, body]) => [name, (body.match(/<(path|circle|rect|ellipse|line|polygon)\b/g) ?? []).length] as const)
      .filter(([, count]) => count > 4);

    // Two glyphs were rejected during design for carrying five and six shapes:
    // at 16px they turned to mud. This is that finding, enforced.
    expect(overCrowded).toEqual([]);
  });
});
