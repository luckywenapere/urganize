import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The component wiring for lib/chappi/turn-failure.ts. Once fetch has resolved,
// the typed-command router must never answer for a failed turn: a rename that
// ran on the server came back as "Let's plan it" (Oct 2026).
const source = readFileSync(
  path.join(__dirname, '../../components/chappi/ChappiConversation.tsx'),
  'utf8'
);

function submitPromptBody(): string {
  const start = source.indexOf('const submitPrompt = async');
  const end = source.indexOf('const handleApproveConfirmation');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('submitPrompt failure wiring', () => {
  it('marks the request as reached right after fetch resolves', () => {
    const body = submitPromptBody();
    expect(body).toMatch(/sent = true;\s*const response = await fetch\('\/api\/urgans'/);
    expect(body).toMatch(/cache: 'no-store',\s*\}\);\s*reachedServer = true;/);
  });

  it('a dropped stream goes through handleFailedTurn, not the router', () => {
    const body = submitPromptBody();
    const drop = body.slice(body.indexOf('if (!outcome.final)'), body.indexOf('data = outcome.final'));
    expect(drop).toContain('handleFailedTurn()');
    expect(drop).not.toContain('fallBackToRouter()');
  });

  it('the catch-all and unexpected shapes use handleFailedTurn', () => {
    const body = submitPromptBody();
    expect(body).toMatch(/\} catch \{\s*handleFailedTurn\(\);/);
    // The only direct router calls left: inside handleFailedTurn, the missing
    // token (nothing sent), and the server's own deterministic answer.
    expect(body.match(/fallBackToRouter\(\);/g)?.length).toBe(3);
  });

  it('a failed turn refreshes the rollout data', () => {
    const body = submitPromptBody();
    const handler = body.slice(body.indexOf('const handleFailedTurn'), body.indexOf('try {'));
    expect(handler).toContain('loadCommandCenter({ force: true })');
    expect(handler).toContain('TURN_DROPPED_NOTE');
  });
});
