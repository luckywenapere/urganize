import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { SOCIAL_LINKS } from './links';
import { renderEmail } from './render';
import { EmailLayout } from './templates/Layout';
import { WelcomeEmail } from './templates/WelcomeEmail';
import { WorkspaceInviteEmail } from './templates/WorkspaceInviteEmail';
import { TaskAssignedEmail } from './templates/TaskAssignedEmail';
import { OnboardingStepEmail } from './templates/OnboardingStepEmail';
import { AnnouncementEmail } from './templates/AnnouncementEmail';
import { CreditSubmissionEmail } from './templates/CreditSubmissionEmail';
import { ReferralRewardEmail } from './templates/ReferralRewardEmail';
import { NotifyAdminEmail } from './templates/NotifyAdminEmail';
import { FounderBillingAlertEmail } from './templates/FounderBillingAlertEmail';

// The social links in the footer of every email Urganize sends.
//
// Three promises, each held by a test rather than by review:
//  1. The footer renders all six accounts, in the HTML AND the plain-text part.
//  2. The six addresses are the marketing site's. apps/homepage cannot be
//     imported from here, so its footer is READ and compared.
//  3. "Every email" stays true: each template goes through EmailLayout, and only
//     the two internal founder alerts opt out.

const TEMPLATES_DIR = join(__dirname, 'templates');
const HOMEPAGE = join(__dirname, '..', '..', '..', 'homepage');
const MARKETING_FOOTER = join(HOMEPAGE, 'app', 'components', 'marketing', 'MarketingFooter.tsx');
// Since 2026-10-29 the footer (and the header's Community menu) map over this
// shared list instead of declaring the accounts inline.
const MARKETING_SOCIALS = join(HOMEPAGE, 'lib', 'socials.ts');

const hrefs = SOCIAL_LINKS.map((link) => link.href);

function expectAllLinks(part: string) {
  for (const href of hrefs) expect(part).toContain(href);
}

describe('SOCIAL_LINKS', () => {
  it('is the same list, in the same order, as the marketing site footer', () => {
    // The footer must still render the shared list, or comparing against
    // that list would prove nothing about the footer.
    const footer = readFileSync(MARKETING_FOOTER, 'utf8');
    expect(footer).toContain('from "@/lib/socials"');
    expect(footer).toMatch(/SOCIAL_LINKS\.map\(/);
    const source = readFileSync(MARKETING_SOCIALS, 'utf8');
    const onSite = [...source.matchAll(/href:\s*"([^"]+)",[^{}]*?label:\s*"Urganize on ([^"]+)"/g)].map(
      (match) => ({ href: match[1], label: match[2] })
    );
    // Guards the guard: a footer whose shape changed would otherwise compare
    // two empty lists and pass.
    expect(onSite.length).toBeGreaterThanOrEqual(6);
    expect(SOCIAL_LINKS.map((link) => ({ href: link.href, label: link.label }))).toEqual(onSite);
  });

  it('only ever points at https addresses that name urganize', () => {
    for (const href of hrefs) {
      expect(href.startsWith('https://')).toBe(true);
      expect(href.toLowerCase()).toContain('urganize');
    }
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe('EmailLayout footer', () => {
  const sample = EmailLayout({ preview: 'Preview', children: 'Body copy' });

  it('links every account in both the HTML and the plain-text part', async () => {
    const { html, text } = await renderEmail(sample);
    expectAllLinks(html);
    expectAllLinks(text);
    for (const { label } of SOCIAL_LINKS) {
      expect(html).toContain(`>${label}</a>`);
      expect(text).toContain(label);
    }
    expect(text).toContain('Follow us');
  });

  it('is plain text: no images and nothing a mail client would block or strip', async () => {
    const { html } = await renderEmail(sample);
    expect(/<img/i.test(html)).toBe(false);
    expect(/<svg/i.test(html)).toBe(false);
    expect(/<style/i.test(html)).toBe(false);
    expect(html).not.toContain('var(--');
  });

  it('underlines each link, because colour alone does not mark a muted link out', async () => {
    const { html } = await renderEmail(sample);
    const anchors = html.match(/<a [^>]*href="https:\/\/(?:www\.)?(?:x|linkedin|instagram|tiktok|youtube|threads)\.[^"]*"[^>]*>/gi) ?? [];
    expect(anchors).toHaveLength(SOCIAL_LINKS.length);
    for (const anchor of anchors) {
      expect(anchor).toMatch(/text-decoration:underline/);
      expect(anchor).not.toMatch(/text-decoration-line:none/);
    }
  });

  it('adds no separator character that other templates assert is absent', async () => {
    const { html, text } = await renderEmail(sample);
    expect(html).not.toContain(' · ');
    expect(text).not.toContain(' · ');
    expect(html).not.toContain('—');
  });

  it('sits under the tagline and above the unsubscribe line', async () => {
    const { html } = await renderEmail(
      EmailLayout({
        preview: 'Preview',
        children: 'Body',
        footer: createElement('span', null, 'UNSUBSCRIBE-LINE'),
      })
    );
    const tagline = html.indexOf('Plan new music. Track every task.');
    const follow = html.indexOf('Follow us');
    const unsubscribe = html.indexOf('UNSUBSCRIBE-LINE');
    expect(tagline).toBeGreaterThan(-1);
    expect(follow).toBeGreaterThan(tagline);
    expect(unsubscribe).toBeGreaterThan(follow);
  });

  it('can be switched off, and leaves nothing behind when it is', async () => {
    const { html, text } = await renderEmail(
      EmailLayout({ preview: 'Preview', children: 'Body', socials: false })
    );
    for (const href of hrefs) {
      expect(html).not.toContain(href);
      expect(text).not.toContain(href);
    }
    expect(text).not.toContain('Follow us');
  });
});

describe('every email carries the social links', () => {
  const real = {
    welcome: () => WelcomeEmail({ recipientName: 'Ada Obi' }),
    invite: () =>
      WorkspaceInviteEmail({
        workspaceName: 'Wavefront Records',
        inviterLabel: 'Oyin',
        inviteUrl: 'https://app.urganize.app/invite/accept?token=abc',
        accessLabel: 'manager access',
      }),
    assigned: () =>
      TaskAssignedEmail({
        recipientName: 'Tobi Adeyemi',
        assignerLabel: 'Oyin',
        taskTitle: 'Shoot cover art',
        releaseTitle: 'Midnight EP',
        dueDateLabel: 'Fri, Sep 4',
        priorityLabel: 'High priority',
        note: 'Brief is in the files.',
        taskUrl: 'https://app.urganize.app/dashboard?release=rel-1',
      }),
    onboarding: () => OnboardingStepEmail({ step: 'day2', recipientName: 'Ada' }),
    announcement: () =>
      AnnouncementEmail({
        subject: 'News',
        body: 'Hello there.',
        recipientName: 'Ada',
        includeGreeting: true,
        signOff: true,
      }),
    credits: () =>
      CreditSubmissionEmail({
        collaboratorLabel: 'Ada',
        releaseTitle: 'Midnight EP',
        rows: [{ label: 'Roles', value: 'Songwriter' }],
        metadataUrl: 'https://app.urganize.app/dashboard?release=rel-1&scene=metadata',
      }),
    referral: () =>
      ReferralRewardEmail({
        recipientName: 'Ada',
        credits: 100,
        creditsUrl: 'https://app.urganize.app/dashboard/credits',
      }),
    notifyAdmin: () =>
      NotifyAdminEmail({
        requesterLabel: 'Tolu',
        teamName: 'Midnight Records',
        activateUrl: 'https://app.urganize.app/locked',
      }),
  };

  for (const [name, build] of Object.entries(real)) {
    it(`${name} ends with the links in both parts`, async () => {
      const { html, text } = await renderEmail(build());
      expectAllLinks(html);
      expectAllLinks(text);
    });
  }

  it('the internal founder alert (to the founder only) does not', async () => {
    const { html, text } = await renderEmail(
      FounderBillingAlertEmail({
        kind: 'paywall_hit',
        context: {
          teamName: 'Midnight Records',
          ownerName: 'Ada Obi',
          ownerEmail: 'ada@midnight.example',
          daysSinceSignup: 12,
          releasesDuringTrial: 3,
          tasksDuringTrial: 64,
        },
      })
    );
    for (const href of hrefs) {
      expect(html).not.toContain(href);
      expect(text).not.toContain(href);
    }
  });
});

describe('no email can skip the shared layout', () => {
  const files = readdirSync(TEMPLATES_DIR).filter((file) => /Email\.tsx$/.test(file));

  it('scans the real templates (guards the guard)', () => {
    expect(files.length).toBeGreaterThanOrEqual(16);
    expect(files).toContain('WelcomeEmail.tsx');
  });

  it('every template renders through EmailLayout', () => {
    const outside = files.filter(
      (file) => !readFileSync(join(TEMPLATES_DIR, file), 'utf8').includes('<EmailLayout')
    );
    expect(outside).toEqual([]);
  });

  it('only the internal founder mail (two alerts and the help message) opts out of the social links', () => {
    const optedOut = files.filter((file) =>
      /socials=\{false\}/.test(readFileSync(join(TEMPLATES_DIR, file), 'utf8'))
    );
    expect(optedOut.sort()).toEqual(['FounderBillingAlertEmail.tsx', 'FounderOpsAlertEmail.tsx', 'HelpRequestEmail.tsx']);
  });
});
