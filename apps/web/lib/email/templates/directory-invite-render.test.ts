import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { DirectoryInviteEmail, directoryInviteSubject } from './DirectoryInviteEmail';
import { getEmailTemplateMeta } from '../registry';

const props = {
  recipientName: 'Tobi Ade',
  inviterName: 'Kemi',
  roleWithArticle: 'a mix engineer',
  inviteUrl: 'https://app.urganize.app/welcome/abc123',
};

describe('DirectoryInviteEmail', () => {
  it('says who, as what, that it is private, one button, and the plain text carries the link', async () => {
    const { html, text } = await renderEmail(DirectoryInviteEmail(props));
    expect(text).toContain('Hey Tobi,');
    expect(text).toContain('Kemi added you to the Urganize Directory as a mix engineer');
    expect(text).toContain('Only you can see your profile until you publish it.');
    expect(text).toContain('https://app.urganize.app/welcome/abc123');
    expect(html.match(/welcome\/abc123/g)?.length).toBe(1);
    expect(html).not.toContain('var(--');
  });
  it('has a subject, with a fallback for a missing name', () => {
    expect(directoryInviteSubject('Kemi')).toBe('Kemi invited you to Urganize');
    expect(directoryInviteSubject('  ')).toBe('Someone invited you to Urganize');
  });
  it('is transactional: the manager typed the address and pressed Send', () => {
    expect(getEmailTemplateMeta('directory_invite').category).toBe('transactional');
  });
});
