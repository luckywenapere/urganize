import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { teammateEmailLine } from './teammate-display';

describe('teammateEmailLine', () => {
  it('shows the email under a real name', () => {
    expect(teammateEmailLine({ name: 'Tunde', email: 'tunde@example.com' })).toBe('tunde@example.com');
  });
  it('shows nothing when the name is the email already', () => {
    expect(teammateEmailLine({ name: 'tunde@example.com', email: 'Tunde@Example.com' })).toBeNull();
  });
  it('still says No email when there is none', () => {
    expect(teammateEmailLine({ name: 'Tunde', email: null })).toBe('No email');
    expect(teammateEmailLine({ name: null, email: '  ' })).toBe('No email');
  });
  it('is used by the Team list', () => {
    const source = readFileSync(join(__dirname, '..', 'components', 'settings', 'TeammatesSection.tsx'), 'utf8');
    expect(source).toContain('teammateEmailLine(member)');
  });
});
