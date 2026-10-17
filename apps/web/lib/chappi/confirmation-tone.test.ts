import { describe, expect, it } from 'vitest';
import { CHAPPI_TOOLS } from './tools';
import { confirmationTone } from './confirmation-tone';

describe('confirmationTone', () => {
  it('keeps the danger look for removals', () => {
    for (const name of ['delete_release', 'delete_task', 'remove_teammate', 'remove_artist']) {
      expect(confirmationTone(name)).toBe('danger');
    }
  });

  it('does not paint outward actions red', () => {
    for (const name of [
      'publish_press_kit',
      'pitch_song',
      'send_work_request',
      'invite_teammate',
    ]) {
      expect(confirmationTone(name)).toBe('neutral');
    }
  });

  it('marks every delete_ tool in the real registry as danger', () => {
    const deletes = CHAPPI_TOOLS.map((t) => t.name).filter((n) => n.startsWith('delete_'));
    expect(deletes.length).toBeGreaterThan(0);
    for (const name of deletes) expect(confirmationTone(name)).toBe('danger');
  });
});
