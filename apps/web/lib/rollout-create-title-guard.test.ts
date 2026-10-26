import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Naming a rollout while creating it (2026-10-09, v1.91.3).
 *
 * The type-first create screen used to make the rollout the moment Single, EP
 * or Album was tapped: no way to name it (every one was "Untitled rollout"),
 * and the cards locked as soon as one was tapped. Now the screen carries an
 * optional title, the cards are a changeable choice, and the footer button is
 * the submit ("Create" since 2026-10-24). The planner's abandoned-shell discard is told the created title
 * so a rollout that was only named is still cleaned up.
 *
 * Components are not rendered in this repo's tests, so these hold the wiring
 * in the source, the way the other guard tests do.
 */

const APP_ROOT = process.cwd();
const read = (path: string) => readFileSync(join(APP_ROOT, path), 'utf8');

function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`unterminated body for ${signature}`);
}

describe('type-first create screen', () => {
  const modal = read('components/releases/CreateReleaseModal.tsx');

  it('picking a card only chooses the type; it never creates the rollout', () => {
    const body = functionBody(modal, 'const handleTypeFirstPick');
    expect(body).not.toContain('performCreate');
    expect(body).toContain('setReleaseType');
  });

  it('the form submit creates the type-first rollout with the typed title', () => {
    const body = functionBody(modal, 'const handleSubmit');
    const typeFirst = body.slice(body.indexOf('if (TYPE_FIRST_CREATE_ENABLED)'));
    expect(typeFirst).toContain('performCreate');
    expect(typeFirst).toContain('title: title.trim()');
    expect(typeFirst).toContain('typeWasPicked: true');
  });

  it('the one form body renders a title field and the Format radios', () => {
    const start = modal.indexOf('{TYPE_FIRST_CREATE_ENABLED || plan ? (');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = modal.slice(start, modal.indexOf('{submitError ? (', start));
    expect(block).toContain('ref={titleInputRef}');
    expect(block).toContain('maxLength={140}');
    expect(block).toContain('role="radio"');
    expect(block).toContain('aria-checked={isSelected}');
  });

  // 2026-10-24: the first-rollout focus passes an initialPlan, and the modal
  // used to render the type-first body AND the plan body together (every
  // field twice). One body, one title input, one Format group, no date.
  it('renders exactly one body: one title input, one Format group, no date field', () => {
    expect(modal.split('ref={titleInputRef}').length - 1).toBe(1);
    expect(modal.split('aria-label="Format"').length - 1).toBe(1);
    expect(modal).not.toContain('type="date"');
    expect(modal).not.toContain('releaseDate: input.releaseDate');
  });

  it('the type-first submit sends the picked artist', () => {
    const body = functionBody(modal, 'const handleSubmit');
    const typeFirst = body.slice(body.indexOf('if (TYPE_FIRST_CREATE_ENABLED)'));
    expect(typeFirst.slice(0, typeFirst.indexOf('return;'))).toContain('artistId: pickedArtistId');
  });

  it('the primary button says exactly Create', () => {
    expect(modal).toMatch(/>\s*Create\s*<\/Button>/);
    expect(modal).not.toMatch(/>\s*Create rollout\s*<\/Button>/);
  });

  it('reports the saved title so the planner can vouch for it', () => {
    expect(modal).toContain('savedTitle: payload.release?.title ?? null');
  });
});

describe('the create flows hand the created title to the planner discard', () => {
  // Since v1.92.1 every create path builds its intake through the shared
  // buildCreatedRolloutIntake (which always sets discardIfAbandoned and
  // createdTitle; see lib/created-rollout-intake.test.ts), so the check here is
  // that each call hands it the saved title.
  it.each([
    'components/app/AppShell.tsx',
    'components/releases/RolloutCreateFlow.tsx',
    'components/workspace/WorkspaceView.tsx',
  ])('%s passes the saved title to every buildCreatedRolloutIntake', (path) => {
    const source = read(path);
    const builds = source.split('buildCreatedRolloutIntake({').length - 1;
    const titles = (source.match(/savedTitle: result\??\.savedTitle,/g) ?? []).length;
    expect(builds).toBeGreaterThan(0);
    expect(titles).toBe(builds);
  });

  it('the planner builds its discard request through the shared helper', () => {
    const planner = read('components/planner/PlannerIntakeModal.tsx');
    expect(planner).toContain('buildDraftDiscardPath(releaseId, createdTitle)');
    expect(planner).not.toContain('?onlyIfUntouchedDraft=1`');
  });

  it('the server reads createdTitle and gives it to the rule', () => {
    const route = read('app/api/releases/[releaseId]/route.ts');
    expect(route).toContain("searchParams.get('createdTitle')");
    expect(route).toContain('checkUntouchedDraft(adminClient!, releaseId, createdTitle)');
  });
});
