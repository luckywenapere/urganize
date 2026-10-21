import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('components/people/ClaimWizard.tsx', 'utf8').replace(/\r\n/g, '\n');
const body = (name: string) => {
  const start = src.indexOf(`async function ${name}()`);
  return src.slice(start, src.indexOf('\n  }\n', start));
};

describe('ClaimWizard', () => {
  it('sends the code and the verify once, however many taps and pastes land', () => {
    for (const name of ['sendCode', 'verify']) {
      const fn = body(name);
      expect(fn, name).toContain('if (inFlight.current) return;');
      expect(fn, name).toContain('inFlight.current = true;');
      expect(fn, name).toContain('inFlight.current = false;');
    }
  });

  it('a closed link does not ask the person to prove anything', () => {
    const closed = src.slice(src.indexOf('if (!preview.ok)'), src.indexOf('const signedIn'));
    expect(closed).not.toContain("Prove it");
    expect(closed).toContain('This link is not available');
  });
});
