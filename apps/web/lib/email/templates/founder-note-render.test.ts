import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { OnboardingStepEmail, onboardingStepSubject } from './OnboardingStepEmail';
import { AnnouncementEmail } from './AnnouncementEmail';
import { WelcomeEmail, WELCOME_SUBJECT } from './WelcomeEmail';
import { ONBOARDING_STEP_KEYS, getOnboardingStep } from '../onboarding-sequence';

function expectMailSafe(html: string) {
  expect(html).not.toContain('var(--');
  expect(html).not.toContain('@font-face');
  expect(/<style/i.test(html)).toBe(false);
}

describe('OnboardingStepEmail', () => {
  it('renders every step with a first-name greeting, the sign-off and the unsubscribe link', async () => {
    for (const step of ONBOARDING_STEP_KEYS) {
      const { html, text } = await renderEmail(
        OnboardingStepEmail({ step, recipientName: 'Ada Obi', unsubscribeUrl: 'https://team.urganize.app/unsubscribe?t=x' })
      );
      expect(text).toContain('Hey Ada,');
      expect(text).toContain('Founder, Urganize');
      expect(html).toContain('/unsubscribe?t=x');
      expect(html).toContain(getOnboardingStep(step).preview);
      expectMailSafe(html);
    }
  });

  it('keeps the founder-note register: no button', async () => {
    const { html } = await renderEmail(OnboardingStepEmail({ step: 'day2', recipientName: 'Ada' }));
    expect(html).not.toMatch(/background-color:#7fd99a/i);
    // Straight into the Settings pop-up's team section, not the old /settings page.
    expect(html).toContain('https://team.urganize.app/dashboard/team');
  });

  it('greets without a name when the stored one is only an email handle', async () => {
    const { text } = await renderEmail(OnboardingStepEmail({ step: 'day3', recipientName: 'ada.obi' }));
    expect(text).toContain('Hey,');
  });

  it('takes its subject from the sequence copy', () => {
    expect(onboardingStepSubject('day7')).toBe(getOnboardingStep('day7').subject);
  });

  // The link is the call to action in a founder note, so it has to look like
  // one, and it must wrap at a space. `word-break: break-all` split
  // "WhatsApp" across two lines on a 375px phone (measured 2026-09-30).
  it('underlines links and never lets a word inside one split across lines', async () => {
    const { html } = await renderEmail(OnboardingStepEmail({ step: 'day7', recipientName: 'Ada' }));
    const whatsapp = html.match(/<a[^>]*href="https:\/\/wa\.me\/[^"]*"[^>]*>/i)?.[0] ?? '';
    expect(whatsapp).not.toBe('');
    expect(whatsapp).toMatch(/text-decoration:underline/);
    // react-email's own default is `none`; it must not survive into the output.
    expect(whatsapp).not.toMatch(/text-decoration-line:none/);
    expect(whatsapp).toMatch(/overflow-wrap:anywhere/);
    expect(html).not.toMatch(/word-break:break-all/);
  });
});

// The founder signs as "Wena" (founder call, 2026-10-09), never with a first name
// (the old "Lucky" or the current "Oyin"). Held for every email that carries the
// founder's voice: the welcome, all five sequence steps and the admin composer's
// sign-off.
describe('the founder signs as Wena', () => {
  it('uses Wena in the welcome note, its subject and every sequence step', async () => {
    const welcome = await renderEmail(WelcomeEmail({ recipientName: 'Ada' }));
    const parts = [WELCOME_SUBJECT, welcome.html, welcome.text];
    for (const step of ONBOARDING_STEP_KEYS) {
      const { html, text } = await renderEmail(OnboardingStepEmail({ step, recipientName: 'Ada' }));
      parts.push(onboardingStepSubject(step), html, text);
    }
    for (const part of parts) {
      expect(part).not.toContain('Lucky');
      expect(part).not.toContain('Oyin');
    }
    expect(WELCOME_SUBJECT).toContain('Wena');
    expect(welcome.text).toContain('Wena here.');
    expect(welcome.text).toMatch(/Wena\s+Founder, Urganize/);
  });

  it('signs a composer announcement as Wena', async () => {
    const { text } = await renderEmail(
      AnnouncementEmail({
        subject: 'News',
        body: 'Hello there.',
        recipientName: 'Ada',
        includeGreeting: true,
        signOff: true,
      })
    );
    expect(text).toMatch(/Wena\s+Founder, Urganize/);
    expect(text).not.toContain('Lucky');
    expect(text).not.toContain('Oyin');
  });
});

describe('AnnouncementEmail', () => {
  const base = {
    subject: 'News',
    body: 'First paragraph.\n\nSee [the plan](https://team.urganize.app/dashboard).',
    recipientName: 'Ada',
    includeGreeting: true,
    signOff: true,
  };

  it('renders the paragraphs and turns the link into a link', async () => {
    const { html, text } = await renderEmail(AnnouncementEmail(base));
    expect(html).toContain('href="https://team.urganize.app/dashboard"');
    expect(text).toContain('Hey Ada,');
    expect(text).toContain('First paragraph.');
    expectMailSafe(html);
  });

  it('leaves out the greeting and sign-off when asked', async () => {
    const { text } = await renderEmail(AnnouncementEmail({ ...base, includeGreeting: false, signOff: false }));
    expect(text).not.toContain('Hey Ada');
    expect(text).not.toContain('Founder, Urganize');
  });

  it('escapes hostile text and never links a javascript: address', async () => {
    const { html } = await renderEmail(
      AnnouncementEmail({
        ...base,
        body: '<script>alert(1)</script>\n\n[click](javascript:alert(1))',
      })
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/href="javascript:/i);
  });
});
