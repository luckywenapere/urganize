import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A structural guard on the transcribe route, modelled on
// lib/issue-reports-route-guard.test.ts and lib/press-kit-public-guard.test.ts.
//
// It defends three properties a comment cannot:
//  1. The flag is checked BEFORE auth, so the surface is fully dark when off.
//  2. Speaking is NEVER metered — the route must never touch the monthly UrgAns
//     action ceiling, or a user who re-records a misheard name pays twice for
//     one message.
//  3. The audio is NEVER stored — no storage write, no insert beyond the one
//     billing event that powers the daily abuse cap.

const routePath = join(process.cwd(), 'app/api/urgans/transcribe/route.ts');
const raw = readFileSync(routePath, 'utf8');

// Comments stripped: the header prose names the very functions the route
// avoids, so a raw grep would fail on the explanation of the rule.
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the transcribe route is dark when the flag is off', () => {
  it('checks both flags before touching auth', () => {
    const flagAt = source.search(/isUrgansVoiceEnabled\s*\(/);
    const authAt = source.search(/requireUrgansAccess\s*\(/);
    expect(flagAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(-1);
    expect(flagAt).toBeLessThan(authAt);
  });

  it('404s with the exact isFlagGateOff body', () => {
    expect(source).toMatch(/error:\s*'Not found\.'/);
  });
});

describe('speaking is never metered', () => {
  it('never records an AI action or checks the chat allowance', () => {
    expect(source).not.toMatch(/recordUrgansAction/);
    expect(source).not.toMatch(/checkUrgansAllowance/);
    expect(source).not.toMatch(/'urgans_action'/);
  });

  it('only ever logs the voice-transcription event', () => {
    // The one billing event this route may write is the daily-cap counter.
    const logged = [...source.matchAll(/type:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    for (const type of logged) {
      expect(type).toBe('urgans_voice_transcription');
    }
  });
});

describe('the audio is never stored', () => {
  it('never touches Supabase Storage', () => {
    expect(source).not.toMatch(/\.storage\b/);
    expect(source).not.toMatch(/from\(\s*['"]/); // no .from('some_table')
  });

  it('never inserts a row directly (only logBillingEvent may write)', () => {
    expect(source).not.toMatch(/\.insert\(/);
  });
});

describe('a dictation says which model ran (2026-10-11)', () => {
  it('writes the model and the audio size onto its billing event', () => {
    expect(source).toMatch(/metadata:\s*transcriptionMetadata\(\{\s*model:\s*config\.model/);
    expect(source).toMatch(/bytes:\s*file\.size/);
  });
});
