import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { CuratorApplicationApprovedEmail, CURATOR_APPLICATION_APPROVED_SUBJECT } from './CuratorApplicationApprovedEmail';
import { getEmailTemplateMeta } from '../registry';

const props = {
  playlistName: 'Lagos Late Nights',
  inviteUrl: 'https://app.urganize.app/curator/join/abcDEF234',
  expiresInDays: 14,
};

describe('CuratorApplicationApprovedEmail', () => {
  it('names the playlist, carries the one link once, and says how long it works', async () => {
    const { html, text } = await renderEmail(CuratorApplicationApprovedEmail(props));
    expect(text).toContain('Lagos Late Nights');
    expect(text).toContain('https://app.urganize.app/curator/join/abcDEF234');
    expect(text).toContain('14 days');
    expect(html.match(/curator\/join\/abcDEF234/g)?.length).toBe(1);
    expect(html).not.toContain('var(--');
  });
  it('has a plain subject and is transactional', () => {
    expect(CURATOR_APPLICATION_APPROVED_SUBJECT).toBe("You're in: curate for Urganize");
    expect(getEmailTemplateMeta('curator_application_approved').category).toBe('transactional');
  });
});
