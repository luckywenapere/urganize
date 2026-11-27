import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { SignupNudgeEmail, signupNudgeSubject } from './SignupNudgeEmail';
import { SIGNUP_NUDGE_PREVIEW, SIGNUP_NUDGE_URL } from '../signup-nudge';

// The email as a person gets it (#1429): greeting, the approved words, the
// link, signed Oyin, with the unsubscribe link.
describe('SignupNudgeEmail', () => {
  it('renders the note with a first-name greeting, the link, the sign-off and the unsubscribe link', async () => {
    const { html, text } = await renderEmail(
      SignupNudgeEmail({ recipientName: 'Tunde Bello', unsubscribeUrl: 'https://team.urganize.app/unsubscribe?t=x' })
    );
    expect(signupNudgeSubject()).toBe('I saw you made an account yesterday');
    expect(text).toContain('Hey Tunde,');
    expect(text).toContain('You made your Urganize account yesterday but did not add what you are working on.');
    expect(text).toContain('If it is ready to come out, your plan is made at once.');
    expect(text).toContain('If something stopped you, reply and tell me. This comes straight to me.');
    expect(html).toContain(`href="${SIGNUP_NUDGE_URL}"`);
    expect(html).toContain('Add my music');
    expect(html).toContain(SIGNUP_NUDGE_PREVIEW);
    expect(html).toContain('/unsubscribe?t=x');
    // Signed by Oyin, not the old name.
    expect(text).toContain('Oyin');
    expect(text).toContain('Founder, Urganize');
    expect(text).not.toContain('Wena');
  });

  it('keeps the founder-note register: no button, safe for mail clients', async () => {
    const { html } = await renderEmail(SignupNudgeEmail({ recipientName: '' }));
    expect(html).not.toMatch(/background-color:#7fd99a/i);
    expect(html).not.toContain('var(--');
    expect(/<style/i.test(html)).toBe(false);
  });
});
