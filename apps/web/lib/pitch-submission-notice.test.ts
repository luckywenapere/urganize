import { describe, expect, it } from 'vitest';
import { latePitchLine, newPitchDedupeKey, newPitchLine } from './pitch-submission-notice';

describe('pitch submission notices', () => {
  it('names the artist, song and playlist', () => {
    expect(newPitchLine('Kola', 'Midnight Run', 'Afro Chill')).toBe(
      'Kola sent you Midnight Run for Afro Chill. Open your inbox to listen and reply.'
    );
    expect(newPitchLine('Kola', 'Midnight Run', '')).not.toContain(' for ');
  });

  it('apologizes and gives the original date in the late notice', () => {
    const line = latePitchLine('Kola', 'Midnight Run', '2026-10-05T10:00:00Z');
    expect(line).toContain('Sorry');
    expect(line).toContain('Oct 5, 2026');
    expect(latePitchLine('Kola', 'Midnight Run', null)).not.toContain(' on ');
  });

  it('uses no em dashes and one key per pitch', () => {
    expect(latePitchLine('A', 'B', null)).not.toContain('—');
    expect(newPitchDedupeKey('abc')).toBe('pitch-new-abc');
  });
});
