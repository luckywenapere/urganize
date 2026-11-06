import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// `.hit-44` draws its tap area with an absolutely positioned ::before sized to
// 100% of the nearest positioned ancestor. On an unpositioned element that
// ancestor is something much bigger, and the invisible area covers it: on Nov
// 6, 2026 the smart link's Share button swallowed every click in the rollout
// header and copied the link. Every class list carrying hit-44 must position
// the element itself.

const ROOT = join(__dirname, '..');
const DIRS = ['components', 'app'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('hit-44 elements are positioned', () => {
  it('pairs every hit-44 with relative, absolute, fixed or sticky', () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/(["'`])([^"'`]*\bhit-44\b[^"'`]*)\1/g)) {
          if (!/(^|\s)(relative|absolute|fixed|sticky)(\s|$)/.test(match[2])) {
            offenders.push(`${relative(ROOT, file)}: ${match[2]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
