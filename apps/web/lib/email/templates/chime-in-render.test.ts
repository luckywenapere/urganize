import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { ChimeInEmail, chimeInSubject } from './ChimeInEmail';
import { getEmailTemplateMeta, isUnsubscribableCategory } from '../registry';

const base = {
  recipientName: 'Ada Obi',
  authorLabel: 'Oyin',
  releaseTitle: 'Ohema',
  rolloutUrl: 'https://app.urganize.app/dashboard?release=r1',
};

describe('ChimeInEmail', () => {
  it('asks someone to chime in, with the rollout link', async () => {
    const { html, text } = await renderEmail(
      ChimeInEmail({ ...base, kind: 'ask', unsubscribeUrl: 'https://app.urganize.app/unsubscribe?t=x' })
    );
    expect(text).toContain('Hey Ada,');
    expect(text).toContain('Oyin wants you to chime in on Ohema');
    expect(html).toContain('release=r1');
    expect(html).toContain('/unsubscribe?t=x');
    expect(html).not.toContain('var(--');
  });

  it('carries the note when someone chimed in', async () => {
    const { text } = await renderEmail(
      ChimeInEmail({ ...base, kind: 'note', message: 'Tease the hook first.\n\nThen the video.' })
    );
    expect(text).toContain('Oyin chimed in on Ohema');
    expect(text).toContain('Tease the hook first.');
    expect(text).toContain('Then the video.');
  });

  it('has subjects for both kinds', () => {
    expect(chimeInSubject('Oyin', 'Ohema', 'ask')).toBe('Oyin wants you to chime in on Ohema');
    expect(chimeInSubject('', '', 'note')).toBe('Your teammate chimed in on your rollout');
  });

  it('sits in the chat category, so it can be turned off', () => {
    const meta = getEmailTemplateMeta('chime_in');
    expect(meta.category).toBe('chat');
    expect(isUnsubscribableCategory(meta.category)).toBe(true);
  });
});
