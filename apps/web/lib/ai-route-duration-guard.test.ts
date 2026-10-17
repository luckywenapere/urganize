import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every route that waits on a model sets its own function ceiling
 * (2026-10-09, v1.92.8).
 *
 * `POST /api/urgans/actions` runs the rollout planner, Fill both and the two
 * draft actions, all of which wait up to 52 seconds on a model, and it never
 * set `maxDuration`. The plan's default function timeout applied, so a slow
 * draft was cut off with no answer after the provider had already billed it.
 * Every other long AI route here already sets 60, so the gap went unnoticed.
 *
 * This reads the real route sources, so a NEW route that calls a model fails
 * until it declares its ceiling (or is listed below with the reason it does
 * not need one).
 */

const APP_ROOT = process.cwd();
const API_ROOT = join(APP_ROOT, 'app', 'api');

/** Routes that call a model but finish inside the default ceiling, and why. */
const SHORT_BY_DESIGN: Record<string, string> = {
  'app/api/tasks/[id]/outcome/route.ts':
    'one 3 second model call with no retry (AI_OUTCOME_TIMEOUT_MS), then a template summary',
};

const MODEL_CALLERS =
  /\b(?:runUrgansAction|runChappiAgent|createReleasePlan|buildRolloutPlan|runOnboardingAutoPlan|generateStructuredAiOutput|generatePlainTextAiOutput|generateRoutedStructuredOutput|generateRoutedPlainText)\b/;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

/** Source with comments removed, so prose cannot satisfy or trip a check. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const modelRoutes = routeFiles(API_ROOT)
  .map((file) => ({
    path: relative(APP_ROOT, file).split('\\').join('/'),
    source: stripComments(readFileSync(file, 'utf8')),
  }))
  .filter(({ source }) => MODEL_CALLERS.test(source));

describe('routes that wait on a model', () => {
  it('finds the routes this guard is about', () => {
    const paths = modelRoutes.map((route) => route.path);
    expect(paths).toContain('app/api/urgans/route.ts');
    expect(paths).toContain('app/api/urgans/actions/route.ts');
    expect(paths).toContain('app/api/releases/[releaseId]/plan/route.ts');
    // The rollout create route builds the onboarding plan after its reply (2026-10-17).
    expect(paths).toContain('app/api/releases/route.ts');
  });

  it('declares maxDuration on each, unless it is short by design', () => {
    const missing = modelRoutes
      .filter(({ path, source }) => !/export const maxDuration\s*=\s*\d+/.test(source) && !(path in SHORT_BY_DESIGN))
      .map(({ path }) => path);
    expect(missing).toEqual([]);
  });

  it('keeps the short-by-design list honest', () => {
    const paths = new Set(modelRoutes.map((route) => route.path));
    for (const path of Object.keys(SHORT_BY_DESIGN)) {
      expect(paths.has(path), `${path} no longer calls a model`).toBe(true);
    }
  });
});
