import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { ClaimPageEmail, claimPageSubject } from './ClaimPageEmail';
import { getEmailTemplateMeta, isUnsubscribableCategory } from '../registry';
import { UNSUBSCRIBE_SCOPE_LABELS, unsubscribeScopeFor } from '../unsubscribe';

const base = {
  recipientName: 'Ada Obi',
  artistName: 'Tems',
  releaseTitle: 'Free Mind',
  roles: ['producer'],
  claimUrl: 'https://app.urganize.app/claim/abc123',
};

describe('ClaimPageEmail', () => {
  it('the first email: the credit, the page, one button and a plain-text part that says the same', async () => {
    const { html, text } = await renderEmail(
      ClaimPageEmail({ ...base, kind: 'invite', unsubscribeUrl: 'https://app.urganize.app/unsubscribe?t=x' })
    );
    expect(text).toContain('Hey Ada,');
    expect(text).toContain("Tems' team credited you as producer on Free Mind.");
    expect(text).toContain('Your page is ready.');
    expect(text).toContain('Claim your page');
    // The plain-text fallback carries the link itself, not only the button label.
    expect(text).toContain('https://app.urganize.app/claim/abc123');
    expect(html).toContain('href="https://app.urganize.app/claim/abc123"');
    expect(html).toContain('/unsubscribe?t=x');
    expect(html.match(/claim\/abc123/g)?.length).toBe(1);
    expect(html).not.toContain('var(--');
  });

  it('the reminder says the link is new and it is the only one', async () => {
    const { text } = await renderEmail(ClaimPageEmail({ ...base, kind: 'reminder' }));
    expect(text).toContain('Your page is still waiting for you.');
    expect(text).toContain('We made you a new link, so use this one.');
    expect(text).toContain('This is the only reminder we will send.');
  });

  it('has a subject for each kind', () => {
    expect(claimPageSubject('invite', base)).toBe("Tems' team credited you on Free Mind");
    expect(claimPageSubject('reminder', base)).toBe('Your page for Free Mind is still waiting');
  });

  it('both are their own unsubscribable category; the owner email stays transactional', () => {
    expect(getEmailTemplateMeta('claim_auto_invite').category).toBe('claim');
    expect(getEmailTemplateMeta('claim_reminder').category).toBe('claim');
    expect(getEmailTemplateMeta('claim_invite').category).toBe('transactional');
    expect(isUnsubscribableCategory('claim')).toBe(true);
    expect(unsubscribeScopeFor('claim')).toBe('claim');
    expect(UNSUBSCRIBE_SCOPE_LABELS.claim).toBe('emails about claiming your Urganize page');
  });
});
