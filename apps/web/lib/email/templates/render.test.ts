import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import { renderEmail } from '../render';
import { WelcomeEmail, WELCOME_SUBJECT } from './WelcomeEmail';
import { WorkspaceInviteEmail, workspaceInviteSubject } from './WorkspaceInviteEmail';
import { CreditSubmissionEmail, creditSubmissionSubject } from './CreditSubmissionEmail';
import { TaskAssignedEmail, taskAssignedSubject } from './TaskAssignedEmail';
import { WorkRequestEmail, workRequestSubject } from './WorkRequestEmail';
import { WorkRequestAnswerEmail, workRequestAnswerSubject } from './WorkRequestAnswerEmail';
import { NotifyAdminEmail, notifyAdminSubject } from './NotifyAdminEmail';
import { FounderBillingAlertEmail } from './FounderBillingAlertEmail';

// End-to-end rendering of every template, replacing the copy/escaping coverage
// the old lib/email-templates.ts + billing-alert-templates.ts tests carried.
//
// ESCAPING NOTE: react-email renders through React, which escapes <, > and & in
// text content (the real XSS vectors) but NOT " or ' — those are harmless in a
// text node. So the assertions check that raw dangerous tags never appear and
// that <, > and & are entity-encoded; the old &quot;/&#39; body assertions do
// not port and are intentionally dropped.

const render = (element: ReactElement) => renderEmail(element);

// Shared deliverability guards. Mail clients strip <style> and do not resolve
// var(); @font-face is unreliable-to-blocked. react-email inlines everything, so
// a regression here would render as an unstyled or invisible email in Outlook.
function expectMailSafe(html: string) {
  expect(html).not.toContain('var(--');
  expect(html).not.toContain('@font-face');
  expect(html).not.toContain('fonts.googleapis.com');
  expect(/<style/i.test(html)).toBe(false);
}

describe('WorkspaceInviteEmail', () => {
  const base = {
    workspaceName: 'Wavefront Records',
    inviterLabel: 'Lucky',
    inviteUrl: 'https://app.urganize.app/invite/accept?token=abc-123',
    accessLabel: 'manager access',
  };

  it('names the inviter and team in the subject', () => {
    expect(workspaceInviteSubject('Lucky', 'Wavefront Records')).toBe(
      'Lucky invited you to Wavefront Records on Urganize'
    );
    expect(workspaceInviteSubject('', '   ')).toBe('A teammate invited you to a team on Urganize');
  });

  it('puts the invite URL in both parts and states the terms', async () => {
    const { html, text } = await render(WorkspaceInviteEmail(base));
    expect(html).toContain(base.inviteUrl);
    expect(text).toContain(base.inviteUrl);
    expect(text).toMatch(/works once/i);
    expect(text).toMatch(/30 days/);
    expect(html).toMatch(/30 days/);
    expect(text.trim().length).toBeGreaterThan(80);
    expectMailSafe(html);
  });

  it('escapes hostile free-text names without emitting raw markup', async () => {
    const { html } = await render(
      WorkspaceInviteEmail({
        ...base,
        workspaceName: "Lucky's <script>alert(1)</script> Team",
        inviterLabel: '<b>Lucky</b>',
      })
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Lucky</b>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('WelcomeEmail', () => {
  it('keeps the founder-note register: no button, no dark banner', async () => {
    const { html } = await render(WelcomeEmail({ recipientName: 'Lucky' }));
    expect(WELCOME_SUBJECT).toBe('Welcome to Urganize: a note from Lucky');
    expect(/background-color:#0d120e/i.test(html)).toBe(false);
    expectMailSafe(html);
  });

  it('greets by first name and degrades to a bare greeting for a handle', async () => {
    const named = await render(WelcomeEmail({ recipientName: 'Adenaiye Miracle' }));
    expect(named.text).toContain('Hey Adenaiye,');
    expect(named.html).toContain('Hey Adenaiye,');
    for (const name of ['lucky.wenapere', 'a@b.com', '', '   ']) {
      const { text } = await render(WelcomeEmail({ recipientName: name }));
      expect(text).toContain('Hey,');
      expect(text).not.toContain('Hey lucky');
    }
  });

  it('links the founder WhatsApp and the app, and signs off as the founder', async () => {
    const { html, text } = await render(WelcomeEmail({ recipientName: 'Lucky' }));
    for (const part of [html, text]) {
      expect(part).toContain('https://wa.me/2347067367057');
      expect(part).toContain('https://app.urganize.app');
    }
    expect(text).toContain('Founder, Urganize');
  });

  it('escapes a hostile stored name', async () => {
    const { html } = await render(WelcomeEmail({ recipientName: '<img onerror=x>' }));
    expect(html).not.toContain('<img');
  });
});

describe('CreditSubmissionEmail', () => {
  const input = {
    collaboratorLabel: 'Adaeze Okonkwo (Ada)',
    releaseTitle: 'Midnight EP',
    rows: [
      { label: 'Roles', value: 'Songwriter' },
      { label: 'Writing share', value: '50%' },
      { label: 'Society ID (IPI)', value: '00123456789' },
    ],
    metadataUrl: 'https://app.urganize.app/dashboard?release=rel-1&scene=metadata',
  };

  it('names who sent it and which rollout in the subject, defaulting blanks', () => {
    expect(creditSubmissionSubject('Adaeze Okonkwo (Ada)', 'Midnight EP')).toBe(
      'Adaeze Okonkwo (Ada) sent credits for Midnight EP'
    );
    expect(creditSubmissionSubject('   ', '   ')).toBe('A collaborator sent credits for your rollout');
  });

  it('carries the detail (forwardable to a distributor) and the rollout link', async () => {
    const { html, text } = await render(CreditSubmissionEmail(input));
    for (const fragment of ['Songwriter', '50%', '00123456789']) {
      expect(html).toContain(fragment);
    }
    // rel-1 rides in the metadata URL, present in both parts.
    expect(html).toContain('rel-1');
    expect(text).toContain('rel-1');
    expectMailSafe(html);
  });

  it('drops rows with a blank label or value', async () => {
    const { text } = await render(
      CreditSubmissionEmail({
        ...input,
        rows: [
          { label: 'Roles', value: 'Producer' },
          { label: 'Phone', value: '  ' },
          { label: '  ', value: 'orphan' },
        ],
      })
    );
    expect(text).toContain('Roles');
    expect(text).toContain('Producer');
    expect(text).not.toContain('Phone');
    expect(text).not.toContain('orphan');
  });

  it('survives no rows and still offers the rollout button', async () => {
    const { html } = await render(CreditSubmissionEmail({ ...input, rows: [] }));
    expect(html).toContain('Open the rollout');
  });

  it('escapes the collaborator label and an ampersand in a row value', async () => {
    const { html } = await render(
      CreditSubmissionEmail({
        ...input,
        collaboratorLabel: '<script>alert(1)</script>',
        rows: [{ label: 'Publisher', value: 'Ada & Sons' }],
      })
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });
});

describe('TaskAssignedEmail', () => {
  const base = {
    recipientName: 'Tobi Adeyemi',
    assignerLabel: 'Lucky Wenapere',
    taskTitle: 'Shoot cover art',
    releaseTitle: 'Midnight EP',
    dueDateLabel: 'Fri, Sep 4',
    priorityLabel: 'High priority',
    note: 'Brief for the designer is in the files.',
    taskUrl: 'https://app.urganize.app/dashboard?release=rel-1',
  };

  it('reads as a note from the assigner in the subject', () => {
    expect(taskAssignedSubject('Lucky Wenapere', 'Shoot cover art')).toBe(
      'Lucky Wenapere put "Shoot cover art" on your plate'
    );
    expect(taskAssignedSubject('', '')).toBe('Your teammate put "An activity" on your plate');
  });

  it('greets the assignee, carries the card meta line, and links the activity', async () => {
    const { html, text } = await render(TaskAssignedEmail(base));
    expect(text).toContain('Hey Tobi,');
    expect(html).toContain('Hey Tobi,');
    expect(html).toContain('Midnight EP · due Fri, Sep 4 · High priority');
    expect(text).toContain('Midnight EP · due Fri, Sep 4 · High priority');
    // react-email inserts <!-- --> markers between adjacent JSX nodes, so the
    // footer sentence is split in the HTML but intact in the plain-text part.
    expect(text).toContain('Lucky Wenapere assigned the activity to you');
    expect(html).toContain('https://app.urganize.app/dashboard?release=rel-1');
    expect(text).toContain('https://app.urganize.app/dashboard?release=rel-1');
    expect(/background-color:#0d120e/i.test(html)).toBe(false);
    expectMailSafe(html);
  });

  it('quotes the note when present and drops the italic line when absent', async () => {
    const withNote = await render(TaskAssignedEmail(base));
    expect(withNote.html).toContain('Brief for the designer is in the files.');
    const without = await render(TaskAssignedEmail({ ...base, note: '' }));
    expect(without.html).not.toContain('font-style:italic');
  });

  it('degrades cleanly with no release, due date or priority', async () => {
    const { text, html } = await render(
      TaskAssignedEmail({ ...base, releaseTitle: '', dueDateLabel: '', priorityLabel: '', note: '' })
    );
    expect(text).toContain('Lucky Wenapere just handed you this one:');
    expect(text).not.toContain(' · ');
    expect(html).not.toContain(' · ');
  });

  it('escapes hostile titles and names in HTML but keeps text readable', async () => {
    const { html, text } = await render(
      TaskAssignedEmail({ ...base, taskTitle: '<script>alert(1)</script>', assignerLabel: 'A & B' })
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    // The plain-text half is not HTML and stays readable verbatim.
    expect(text).toContain('A & B');
  });
});

describe('WorkRequestEmail', () => {
  const base = {
    recipientName: 'Dami Cole',
    senderName: 'Lucky',
    roleLabel: 'Graphic designer',
    note: 'Cover art for an EP dropping in October.',
    settingsUrl: 'https://app.urganize.app/settings#directory',
  };

  it('names the sender and role in the subject', () => {
    expect(workRequestSubject('Lucky', 'Graphic designer')).toBe('Lucky is looking for a graphic designer');
    expect(workRequestSubject('', '')).toBe('Someone on Urganize is looking for a some work');
  });

  it('carries the note and the answer link', async () => {
    const { html, text } = await render(WorkRequestEmail(base));
    expect(html).toContain('Cover art for an EP dropping in October.');
    expect(text).toContain('Cover art for an EP dropping in October.');
    expect(html).toContain(base.settingsUrl);
    expectMailSafe(html);
  });
});

describe('WorkRequestAnswerEmail', () => {
  const answered = {
    recipientName: 'Lucky Wenapere',
    answererName: 'Dami Cole',
    roleLabel: 'Graphic designer',
    reply: 'Send the brief over.',
  };

  it('names who answered in the subject', () => {
    expect(workRequestAnswerSubject('Dami Cole', 'Graphic designer', true)).toContain('Dami Cole');
    expect(workRequestAnswerSubject('Dami Cole', 'Graphic designer', false)).toContain('Dami Cole');
  });

  it('hands over contact when interested — the whole point', async () => {
    const { html, text } = await render(
      WorkRequestAnswerEmail({ ...answered, interested: true, contactEmail: 'dami@example.com' })
    );
    expect(text).toContain('dami@example.com');
    expect(html).toContain('dami@example.com');
    expect(html).toContain('mailto:dami@example.com');
  });

  it('hands over nothing when they passed — the consent line', async () => {
    const { html, text } = await render(
      WorkRequestAnswerEmail({ ...answered, interested: false, contactEmail: 'dami@example.com' })
    );
    expect(text).not.toContain('dami@example.com');
    expect(html).not.toContain('dami@example.com');
  });

  it('carries the reply either way', async () => {
    for (const interested of [true, false]) {
      const { text } = await render(WorkRequestAnswerEmail({ ...answered, interested }));
      expect(text).toContain('Send the brief over.');
    }
  });

  it('links a public profile only when they have one', async () => {
    const withPage = await render(
      WorkRequestAnswerEmail({
        ...answered,
        interested: true,
        profileUrl: 'https://app.urganize.app/p/dami-cole',
      })
    );
    expect(withPage.html).toContain('/p/dami-cole');
    const withoutPage = await render(WorkRequestAnswerEmail({ ...answered, interested: true }));
    expect(withoutPage.html).not.toContain('/p/');
  });
});

describe('NotifyAdminEmail', () => {
  const input = {
    requesterLabel: 'Tolu',
    teamName: 'Midnight Records',
    activateUrl: 'https://app.urganize.app/locked',
  };

  it('names the person asking and links where they activate', async () => {
    expect(notifyAdminSubject('Tolu', 'Midnight Records')).toBe(
      'Tolu is waiting on Midnight Records in Urganize'
    );
    expect(notifyAdminSubject('', null)).toBe('A teammate is waiting on your team in Urganize');
    const { html, text } = await render(NotifyAdminEmail(input));
    expect(text).toContain('Tolu');
    expect(html).toContain('https://app.urganize.app/locked');
    // Reassures the admin nothing was lost.
    expect(text).toContain('still there');
    expect(html).toContain('still there');
    expectMailSafe(html);
  });

  it('escapes a hostile requester label', async () => {
    const { html } = await render(NotifyAdminEmail({ ...input, requesterLabel: '<b>x</b>' }));
    expect(html).not.toContain('<b>x</b>');
  });

  // The founder's copy rules for CUSTOMER mail, enforced rather than reviewed.
  it('never says workspace, uses no em dash, and applies no pressure', async () => {
    const { html, text } = await render(NotifyAdminEmail(input));
    const subject = notifyAdminSubject(input.requesterLabel, input.teamName);
    for (const body of [subject, text, html]) {
      expect(body.toLowerCase()).not.toContain('workspace');
      expect(body).not.toContain('—');
    }
    const pressureCorpus = `${subject} ${text}`.toLowerCase();
    for (const forbidden of ['immediately', 'urgent', 'will lose', 'suspended', 'failure']) {
      expect(pressureCorpus).not.toContain(forbidden);
    }
  });
});

describe('FounderBillingAlertEmail', () => {
  const context = {
    teamName: 'Midnight Records',
    ownerName: 'Ada Obi',
    ownerEmail: 'ada@midnight.example',
    daysSinceSignup: 12,
    releasesDuringTrial: 3,
    tasksDuringTrial: 64,
  };

  it('renders the headline and the facts, and escapes a hostile team name', async () => {
    const { html, text } = await render(
      FounderBillingAlertEmail({ kind: 'paywall_hit', context })
    );
    for (const fragment of ['Midnight Records', 'Ada Obi', 'ada@midnight.example']) {
      expect(html).toContain(fragment);
      expect(text).toContain(fragment);
    }
    const hostile = await render(
      FounderBillingAlertEmail({ kind: 'paywall_hit', context: { ...context, teamName: '<script>x</script>' } })
    );
    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).toContain('&lt;script&gt;');
  });
});
