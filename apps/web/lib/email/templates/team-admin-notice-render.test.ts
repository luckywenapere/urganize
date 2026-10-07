import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { TeamAdminNoticeEmail, teamAdminNoticeSubject } from './TeamAdminNoticeEmail';
import { getEmailTemplateMeta } from '../registry';

const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

describe('TeamAdminNoticeEmail', () => {
  it('tells a team it was given free access, with nothing to pay', async () => {
    const { text } = await renderEmail(
      TeamAdminNoticeEmail({ recipientName: 'Ada Obi', kind: 'comped', when: 'now', trialEndsAt: null })
    );
    expect(text).toContain('Hey Ada,');
    expect(text).toContain("We've given your team free access to Urganize.");
    expect(text).toContain('There is nothing to pay');
  });

  it('says "gave" for a change we are catching people up on, never a claim about today', async () => {
    const { text } = await renderEmail(
      TeamAdminNoticeEmail({ recipientName: '', kind: 'comped', when: 'earlier', trialEndsAt: null })
    );
    expect(text).toContain('We gave your team free access to Urganize.');
    expect(text).not.toContain("We've given");
  });

  it('shows the new trial end date while the trial still has time left', async () => {
    const { text } = await renderEmail(
      TeamAdminNoticeEmail({ recipientName: '', kind: 'trial_extended', when: 'now', trialEndsAt: future })
    );
    expect(text).toContain("We've extended your free trial.");
    expect(text).toContain('Your trial now runs until');
  });

  it('drops the date line when there is no trial left to date', async () => {
    const { text } = await renderEmail(
      TeamAdminNoticeEmail({ recipientName: '', kind: 'trial_extended', when: 'earlier', trialEndsAt: null })
    );
    expect(text).toContain('We extended your free trial.');
    expect(text).toContain('You have more time to try everything');
    expect(text).not.toContain('runs until');
  });

  it('never uses an em dash, and never says workspace', async () => {
    const { text } = await renderEmail(
      TeamAdminNoticeEmail({ recipientName: '', kind: 'comped', when: 'now', trialEndsAt: null })
    );
    expect(text).not.toContain('—');
    expect(text.toLowerCase()).not.toContain('workspace');
  });

  it('has a subject for each kind and each moment', () => {
    expect(teamAdminNoticeSubject('comped', 'now')).toBe('Your team has free access to Urganize');
    expect(teamAdminNoticeSubject('comped', 'earlier')).toBe('Your team was given free access to Urganize');
    expect(teamAdminNoticeSubject('trial_extended', 'now')).toBe('Your free trial has been extended');
    expect(teamAdminNoticeSubject('trial_extended', 'earlier')).toBe('Your free trial was extended');
  });

  it('is transactional, so it always sends and carries no unsubscribe link', () => {
    expect(getEmailTemplateMeta('team_admin_notice').category).toBe('transactional');
  });
});
