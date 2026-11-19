import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { OnboardingStepEmail, onboardingStepSubject } from './OnboardingStepEmail';
import { AnnouncementEmail } from './AnnouncementEmail';
import { WelcomeEmail, WELCOME_SUBJECT } from './WelcomeEmail';
import { ONBOARDING_STEP_KEYS, getOnboardingStep } from '../onboarding-sequence';
import { parseNoteText } from '../note-text';

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

  // #974: day 2 and day 5 carry one picture of the screen the note is about.
  it('shows the day 2 and day 5 pictures, hosted on the app, linked and with alt text', async () => {
    for (const step of ['day2', 'day5'] as const) {
      const still = getOnboardingStep(step).still!;
      const { html } = await renderEmail(OnboardingStepEmail({ step, recipientName: 'Ada' }));
      const imgs = html.match(/<img[^>]*>/gi) ?? [];
      expect(imgs).toHaveLength(1);
      expect(imgs[0]).toContain(`src="${still.src}"`);
      expect(still.src).toMatch(/^https:\/\/team\.urganize\.app\/images\/email\/[a-z0-9-]+\.png$/);
      expect(imgs[0]).toMatch(/alt="[^"]{20,}"/);
      expect(imgs[0]).toContain('width="468"');
      expect(imgs[0]).toMatch(/max-width:468px/);
      // Wrapped in a link to the same place the note's own link goes.
      const anchor = html.slice(0, html.indexOf('<img')).match(/<a[^>]*href="([^"]*)"[^>]*>\s*$/);
      expect(anchor?.[1]).toBe(still.href);
    }
  });

  // A copy edit that drops a paragraph, or a renamed file, would otherwise lose
  // the picture without a sound: the still is skipped, or the email shows a
  // broken image.
  it('places every picture after a paragraph that exists, from a file the app serves', () => {
    for (const step of ONBOARDING_STEP_KEYS) {
      const { still, body } = getOnboardingStep(step);
      if (!still) continue;
      expect(still.afterParagraph).toBeGreaterThanOrEqual(0);
      expect(still.afterParagraph).toBeLessThan(parseNoteText(body).length);
      const path = new URL(still.src).pathname;
      expect(existsSync(join(process.cwd(), 'public', path))).toBe(true);
    }
  });

  it('leaves the picture out of the plain-text part instead of printing a bare link', async () => {
    const { text } = await renderEmail(OnboardingStepEmail({ step: 'day5', recipientName: 'Ada' }));
    expect(text).toContain('Try AI https://team.urganize.app/dashboard/urgans');
    expect(text.split('https://team.urganize.app/dashboard/urgans')).toHaveLength(2);
  });

  it('puts the picture after the paragraph it belongs to', async () => {
    const { html } = await renderEmail(OnboardingStepEmail({ step: 'day5', recipientName: 'Ada' }));
    const img = html.indexOf('<img');
    expect(html.indexOf('checks with you first')).toBeLessThan(img);
    expect(html.indexOf('Try AI')).toBeGreaterThan(img);
  });

  it('keeps the other steps as plain text, with no picture', async () => {
    for (const step of ['day1', 'day3', 'day7'] as const) {
      const { html } = await renderEmail(OnboardingStepEmail({ step, recipientName: 'Ada' }));
      expect(/<img/i.test(html)).toBe(false);
    }
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

  it('signs a composer announcement as Oyin', async () => {
    const { text } = await renderEmail(
      AnnouncementEmail({
        subject: 'News',
        body: 'Hello there.',
        recipientName: 'Ada',
        includeGreeting: true,
        signOff: true,
      })
    );
    expect(text).toMatch(/Oyin\s+Founder, Urganize/);
    expect(text).not.toContain('Lucky');
    expect(text).not.toContain('Wena');
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
