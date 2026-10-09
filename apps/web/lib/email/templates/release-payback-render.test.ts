import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { ReleasePaybackQuestionEmail, releasePaybackQuestionSubject } from './ReleasePaybackQuestionEmail';
import { getEmailTemplateMeta, isUnsubscribableCategory } from '../registry';
import { unsubscribeScopeFor } from '../unsubscribe';

const base = {
  recipientName: 'Ada Obi',
  releaseTitle: 'Ohema',
  spendUrl: 'https://app.urganize.app/dashboard?release=r1&scene=spend',
};

describe('ReleasePaybackQuestionEmail', () => {
  it('asks the brief\'s question and links to the Spend section', async () => {
    const { html, text } = await renderEmail(ReleasePaybackQuestionEmail(base));
    expect(text).toContain('Hey Ada,');
    expect(text).toContain('What did Ohema pay back?');
    expect(html).toContain('scene=spend');
    expect(html).not.toContain('var(--');
    expect(/<style/i.test(html)).toBe(false);
  });

  it('carries the unsubscribe link when it is given one', async () => {
    const { html } = await renderEmail(
      ReleasePaybackQuestionEmail({ ...base, unsubscribeUrl: 'https://app.urganize.app/unsubscribe?t=x' })
    );
    expect(html).toContain('/unsubscribe?t=x');
  });

  it('still reads properly with no name or no title', async () => {
    const { text } = await renderEmail(ReleasePaybackQuestionEmail({ ...base, recipientName: '', releaseTitle: '' }));
    expect(text).toContain('Hey,');
    expect(text).toContain('What did this rollout pay back?');
  });

  it('has the question as its subject', () => {
    expect(releasePaybackQuestionSubject('Ohema')).toBe('What did Ohema pay back?');
    expect(releasePaybackQuestionSubject('  ')).toBe('What did this rollout pay back?');
  });

  it('is a reminder, so it can be turned off', () => {
    expect(getEmailTemplateMeta('release_payback_question').category).toBe('reminders');
    expect(isUnsubscribableCategory('reminders')).toBe(true);
    expect(unsubscribeScopeFor('reminders')).not.toBeNull();
  });
});
