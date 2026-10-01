import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AI_CONSENT_COPY,
  AI_CONSENT_ERROR_CODE,
  aiConsentRefusalBody,
  hasAiConsent,
  isAiConsentEnabled,
  isAiConsentRefusal,
} from './ai-consent';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hasAiConsent', () => {
  it('is true for a real timestamp', () => {
    expect(hasAiConsent('2026-10-01T09:30:00.000Z')).toBe(true);
  });

  it('is false for null, undefined, blank and junk', () => {
    expect(hasAiConsent(null)).toBe(false);
    expect(hasAiConsent(undefined)).toBe(false);
    expect(hasAiConsent('')).toBe(false);
    expect(hasAiConsent('   ')).toBe(false);
    expect(hasAiConsent('not a date')).toBe(false);
  });
});

describe('isAiConsentEnabled', () => {
  it('is off unless the flag is the literal word true', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_CONSENT', '');
    expect(isAiConsentEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_CONSENT', '1');
    expect(isAiConsentEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_CONSENT', 'true');
    expect(isAiConsentEnabled()).toBe(true);
  });
});

describe('the refusal', () => {
  it('carries the code the browser recognises', () => {
    expect(aiConsentRefusalBody().code).toBe(AI_CONSENT_ERROR_CODE);
  });

  it('is recognised only as a 403 with that code', () => {
    const body = aiConsentRefusalBody();
    expect(isAiConsentRefusal(403, body)).toBe(true);
    // 402 is the paywall, which redirects the page: never confuse the two.
    expect(isAiConsentRefusal(402, body)).toBe(false);
    expect(isAiConsentRefusal(403, { error: 'No.' })).toBe(false);
    expect(isAiConsentRefusal(403, null)).toBe(false);
    expect(isAiConsentRefusal(403, 'ai_consent_required')).toBe(false);
  });
});

describe('the copy', () => {
  it('names who receives the data, so the permission is informed', () => {
    const text = Object.values(AI_CONSENT_COPY).join(' ');
    expect(text).toMatch(/OpenAI/);
    expect(text).toMatch(/words you type or say/);
  });

  it('keeps the house rules: no em dash and never the banned words', () => {
    const text = Object.values(AI_CONSENT_COPY).join(' ');
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/workspace/i);
    expect(text).not.toMatch(/\bship/i);
  });
});

describe('every route that sends words to an AI asks first', () => {
  const root = join(__dirname, '..');
  const read = (path: string) =>
    readFileSync(join(root, path), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const REFUSING = [
    'app/api/urgans/route.ts',
    'app/api/urgans/transcribe/route.ts',
    'app/api/urgans/actions/route.ts',
    'app/api/releases/[releaseId]/generate-status/route.ts',
    'app/api/releases/[releaseId]/plan/route.ts',
  ];

  it.each(REFUSING)('%s refuses until the person has agreed', (path) => {
    expect(read(path)).toContain('await aiConsentRefusal(');
  });

  it('the task outcome route skips the AI quietly instead of refusing', () => {
    const code = read('app/api/tasks/[id]/outcome/route.ts');
    expect(code).toContain('hasUserAiConsent');
    expect(code).not.toContain('aiConsentRefusal');
  });
});
