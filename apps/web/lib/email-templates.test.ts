import { describe, it, expect } from 'vitest';
import {
  buildCreditSubmissionEmail,
  buildTaskAssignedEmail,
  formatDueDateForEmail,
  noteExcerptForEmail,
  priorityLabelForEmail,
  buildWelcomeEmail,
  buildWorkRequestAnswerEmail,
  buildWorkspaceInviteEmail,
} from './email-templates';

const base = {
  workspaceName: 'Wavefront Records',
  inviterLabel: 'Lucky',
  inviteUrl: 'https://app.urganize.app/invite/accept?token=abc-123',
  accessLabel: 'manager access',
};

describe('buildWorkspaceInviteEmail', () => {
  it('names the inviter and workspace in the subject', () => {
    const { subject } = buildWorkspaceInviteEmail(base);
    expect(subject).toBe('Lucky invited you to Wavefront Records on Urganize');
  });

  it('puts the invite URL in both the html and the text part', () => {
    const { html, text } = buildWorkspaceInviteEmail(base);
    expect(html).toContain(base.inviteUrl);
    expect(text).toContain(base.inviteUrl);
  });

  it('always ships a non-empty text alternative', () => {
    // A missing text/plain part measurably raises spam scoring, so this is a
    // deliverability guard rather than a formatting preference.
    const { text } = buildWorkspaceInviteEmail(base);
    expect(text.trim().length).toBeGreaterThan(80);
  });

  it('escapes a workspace name that would otherwise break the markup', () => {
    // Workspace names are free text the inviter typed. The auto-default is
    // "<handle>'s Workspace", so an apostrophe is the COMMON case here, not
    // an edge one.
    const { html } = buildWorkspaceInviteEmail({
      ...base,
      workspaceName: "Lucky's <script>alert(1)</script> Workspace",
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&#39;s');
  });

  it('escapes the inviter label too', () => {
    const { html } = buildWorkspaceInviteEmail({ ...base, inviterLabel: '<b>Lucky</b>' });
    expect(html).not.toContain('<b>Lucky</b>');
    expect(html).toContain('&lt;b&gt;Lucky&lt;/b&gt;');
  });

  it('falls back to readable copy when name fields are blank', () => {
    const { subject, text } = buildWorkspaceInviteEmail({
      ...base,
      workspaceName: '   ',
      inviterLabel: '',
      accessLabel: '',
    });
    expect(subject).toBe('A teammate invited you to a team on Urganize');
    expect(text).toContain("You'll have access.");
  });

  it('uses no CSS variables and no web fonts', () => {
    // Mail clients do not resolve var() and block @font-face; a regression
    // here renders as an unstyled or invisible email in Outlook.
    const { html } = buildWorkspaceInviteEmail(base);
    expect(html).not.toContain('var(--');
    expect(html).not.toContain('@font-face');
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('states the single-use and expiry terms', () => {
    const { html, text } = buildWorkspaceInviteEmail(base);
    expect(text).toMatch(/works once/i);
    expect(text).toMatch(/30 days/);
    expect(html).toMatch(/30 days/);
  });
});

describe('buildWelcomeEmail', () => {
  it('greets by first name when the stored name looks like one', () => {
    const { html, text } = buildWelcomeEmail({ recipientName: 'Adenaiye Miracle' });
    expect(text).toContain('Hey Adenaiye,');
    expect(html).toContain('Hey Adenaiye,');
  });

  it('degrades to a bare greeting for an email-handle name', () => {
    // ensureProfileRecord falls back to the email handle ("lucky.wenapere")
    // when no real name exists — greeting someone by their handle reads
    // worse than no name at all.
    for (const name of ['lucky.wenapere', 'a@b.com', '', '   ']) {
      const { text } = buildWelcomeEmail({ recipientName: name });
      expect(text).toContain('Hey,');
      expect(text).not.toContain('Hey lucky');
    }
  });

  it('links the founder WhatsApp and the app in both parts', () => {
    const { html, text } = buildWelcomeEmail({ recipientName: 'Lucky' });
    for (const part of [html, text]) {
      expect(part).toContain('https://wa.me/2347067367057');
      expect(part).toContain('https://app.urganize.app');
    }
  });

  it('escapes a hostile stored name', () => {
    const { html } = buildWelcomeEmail({ recipientName: '<img onerror=x>' });
    expect(html).not.toContain('<img');
  });

  it('stays plain: no banner, no button, no web fonts, no CSS variables', () => {
    // The founder-note style IS the design: plain paragraphs that read as a
    // personal email. A regression toward the invite template's branded card
    // defeats the point and hurts spam scoring.
    const { html } = buildWelcomeEmail({ recipientName: 'Lucky' });
    expect(html).not.toContain('var(--');
    expect(html).not.toContain('@font-face');
    expect(html).not.toMatch(/background-color:#0d120e/i);
    expect(html).not.toContain('display:inline-block');
  });

  it('signs off as the founder', () => {
    const { text, subject } = buildWelcomeEmail({ recipientName: 'Lucky' });
    expect(subject).toBe('Welcome to Urganize — a note from Lucky');
    expect(text).toContain('Founder, Urganize');
  });
});

describe('buildCreditSubmissionEmail', () => {
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

  it('names who sent it and which release, in the subject', () => {
    const email = buildCreditSubmissionEmail(input);
    expect(email.subject).toBe('Adaeze Okonkwo (Ada) sent credits for Midnight EP');
  });

  it('carries the actual detail in BOTH bodies', () => {
    // This is the whole reason the email exists rather than just the push: it
    // has to be forwardable to a distributor.
    const email = buildCreditSubmissionEmail(input);
    for (const body of [email.html, email.text]) {
      expect(body).toContain('Songwriter');
      expect(body).toContain('50%');
      expect(body).toContain('00123456789');
      expect(body).toContain('rel-1');
    }
  });

  it('escapes the collaborator label, which is free text they typed', () => {
    const email = buildCreditSubmissionEmail({
      ...input,
      collaboratorLabel: '<script>alert(1)</script>',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('escapes row values too', () => {
    const email = buildCreditSubmissionEmail({
      ...input,
      rows: [{ label: 'Publisher', value: 'Ada & Sons "Music"' }],
    });
    expect(email.html).toContain('&amp;');
    expect(email.html).toContain('&quot;');
  });

  it('drops rows with a blank label or value', () => {
    const email = buildCreditSubmissionEmail({
      ...input,
      rows: [
        { label: 'Roles', value: 'Producer' },
        { label: 'Phone', value: '  ' },
        { label: '  ', value: 'orphan' },
      ],
    });
    expect(email.text).toContain('Roles: Producer');
    expect(email.text).not.toContain('Phone');
    expect(email.text).not.toContain('orphan');
  });

  it('survives no rows at all', () => {
    const email = buildCreditSubmissionEmail({ ...input, rows: [] });
    expect(email.subject).toContain('Midnight EP');
    expect(email.html).toContain('Open the rollout');
  });

  it('defaults a blank name and release rather than rendering gaps', () => {
    const email = buildCreditSubmissionEmail({
      ...input,
      collaboratorLabel: '   ',
      releaseTitle: '   ',
    });
    expect(email.subject).toBe('A collaborator sent credits for your rollout');
  });

  it('uses inline styles only, no var() and no web fonts', () => {
    // Mail clients strip <style> blocks and do not resolve custom properties.
    const email = buildCreditSubmissionEmail(input);
    expect(email.html).not.toContain('var(--');
    expect(email.html).not.toContain('@font-face');
    expect(email.html).not.toContain('<style');
  });
});
describe('buildTaskAssignedEmail', () => {
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

  it('reads as a note from the assigner: subject names them and the activity', () => {
    const built = buildTaskAssignedEmail(base);
    expect(built.subject).toBe('Lucky Wenapere put "Shoot cover art" on your plate');
  });

  it('greets the assignee by first name and signs the footer with the assigner', () => {
    const built = buildTaskAssignedEmail(base);
    expect(built.text).toContain('Hey Tobi,');
    expect(built.html).toContain('Hey Tobi,');
    expect(built.html).toContain('Lucky Wenapere assigned the activity to you');
  });

  it('carries the card: title, release, due date and priority in one meta line', () => {
    const built = buildTaskAssignedEmail(base);
    expect(built.html).toContain('Shoot cover art');
    expect(built.html).toContain('Midnight EP · due Fri, Sep 4 · High priority');
    expect(built.text).toContain('Midnight EP · due Fri, Sep 4 · High priority');
  });

  it('quotes the note when present and drops the line entirely when absent', () => {
    const withNote = buildTaskAssignedEmail(base);
    expect(withNote.html).toContain('Brief for the designer is in the files.');
    const without = buildTaskAssignedEmail({ ...base, note: '' });
    expect(without.html).not.toContain('font-style:italic');
  });

  it('degrades cleanly with no release, due date or priority', () => {
    const built = buildTaskAssignedEmail({
      ...base,
      releaseTitle: '',
      dueDateLabel: '',
      priorityLabel: '',
      note: '',
    });
    expect(built.subject).toBe('Lucky Wenapere put "Shoot cover art" on your plate');
    // The lead loses its "for <release>" clause and the meta line vanishes
    // rather than rendering stray separators.
    expect(built.text).toContain('Lucky Wenapere just handed you this one:');
    expect(built.text).not.toContain(' · ');
    expect(built.html).not.toContain(' · ');
  });

  it('falls back on every missing identity without reading as broken', () => {
    const built = buildTaskAssignedEmail({
      ...base,
      recipientName: '',
      assignerLabel: '',
      taskTitle: '',
    });
    expect(built.subject).toBe('Your teammate put "An activity" on your plate');
    expect(built.text).toContain('Hey,');
  });

  it('does not greet an email handle as a first name', () => {
    const built = buildTaskAssignedEmail({ ...base, recipientName: 'tobi.adeyemi@x.com' });
    expect(built.text).toContain('Hey,');
    expect(built.text).not.toContain('Hey tobi');
  });

  it('escapes hostile titles and names in the HTML half', () => {
    const built = buildTaskAssignedEmail({
      ...base,
      taskTitle: '<script>alert(1)</script>',
      assignerLabel: 'A & B "Crew"',
    });
    expect(built.html).not.toContain('<script>');
    expect(built.html).toContain('&lt;script&gt;');
    expect(built.html).toContain('A &amp; B &quot;Crew&quot;');
    // The plain-text half is not HTML and must stay readable verbatim.
    expect(built.text).toContain('A & B "Crew"');
  });

  it('links to the activity in both halves', () => {
    const built = buildTaskAssignedEmail(base);
    expect(built.html).toContain('https://app.urganize.app/dashboard?release=rel-1');
    expect(built.text).toContain('https://app.urganize.app/dashboard?release=rel-1');
  });

  it('has no logo banner: personal register, not product mail', () => {
    // The invite/credits card templates open with an ink banner div; the
    // founder-note register (welcome, this) must not. The brief for this
    // email was explicitly "must not read as automated" — a banner is the
    // marker that flips the register, so its absence is pinned.
    const built = buildTaskAssignedEmail(base);
    expect(built.html).not.toContain('background-color:#0d120e');
  });
});
describe('formatDueDateForEmail', () => {
  it('formats a date-only value without shifting a day (UTC)', () => {
    expect(formatDueDateForEmail('2026-09-04')).toBe('Fri, Sep 4');
  });

  it('formats a full timestamp', () => {
    expect(formatDueDateForEmail('2026-09-04T15:30:00Z')).toBe('Fri, Sep 4');
  });

  it('returns empty for absent or unparseable values', () => {
    expect(formatDueDateForEmail(null)).toBe('');
    expect(formatDueDateForEmail('')).toBe('');
    expect(formatDueDateForEmail('not-a-date')).toBe('');
  });
});

describe('priorityLabelForEmail', () => {
  it('names only the two loud tiers', () => {
    expect(priorityLabelForEmail('urgent')).toBe('Urgent');
    expect(priorityLabelForEmail('high')).toBe('High priority');
    expect(priorityLabelForEmail('medium')).toBe('');
    expect(priorityLabelForEmail('low')).toBe('');
    expect(priorityLabelForEmail(null)).toBe('');
  });
});

describe('noteExcerptForEmail', () => {
  it('takes the first non-empty line', () => {
    expect(noteExcerptForEmail('\n\n  First real line.\nSecond line.')).toBe('First real line.');
  });

  it('caps long lines with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const excerpt = noteExcerptForEmail(long);
    expect(excerpt.length).toBeLessThanOrEqual(160);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('returns empty for blank descriptions', () => {
    expect(noteExcerptForEmail('')).toBe('');
    expect(noteExcerptForEmail('   \n  ')).toBe('');
    expect(noteExcerptForEmail(null)).toBe('');
  });
});

describe('buildWorkRequestAnswerEmail', () => {
  const answered = {
    recipientName: 'Lucky Wenapere',
    answererName: 'Dami Cole',
    roleLabel: 'Graphic designer',
    reply: 'Send the brief over.',
  };

  it('hands over contact when they are interested, which is the whole point', () => {
    // Before this, the answer said "yes" and gave the asker nothing to do with
    // it: our From address, no reply-to, and a link to the search page. The
    // loop ended at yes.
    const built = buildWorkRequestAnswerEmail({
      ...answered,
      interested: true,
      contactEmail: 'dami@example.com',
    });
    expect(built.text).toContain('dami@example.com');
    expect(built.html).toContain('dami@example.com');
    expect(built.html).toContain('mailto:dami@example.com');
  });

  it('hands over nothing when they passed', () => {
    // Somebody who said no consented to nothing. This is the line the whole
    // consent model rests on.
    const built = buildWorkRequestAnswerEmail({
      ...answered,
      interested: false,
      contactEmail: 'dami@example.com',
    });
    expect(built.text).not.toContain('dami@example.com');
    expect(built.html).not.toContain('dami@example.com');
  });

  it('still reads sensibly when interest comes with no contact to give', () => {
    // A profile with no reachable address is possible, and the answer must not
    // promise contact details it does not carry.
    const built = buildWorkRequestAnswerEmail({ ...answered, interested: true });
    expect(built.text).not.toMatch(/contact details are on their profile/i);
    expect(built.subject).toContain('Dami Cole');
  });

  it('carries their reply either way', () => {
    for (const interested of [true, false]) {
      const built = buildWorkRequestAnswerEmail({ ...answered, interested });
      expect(built.text).toContain('Send the brief over.');
    }
  });

  it('links a profile only when they have a public one', () => {
    const withPage = buildWorkRequestAnswerEmail({
      ...answered,
      interested: true,
      profileUrl: 'https://app.urganize.app/p/dami-cole',
    });
    expect(withPage.html).toContain('/p/dami-cole');

    const withoutPage = buildWorkRequestAnswerEmail({ ...answered, interested: true });
    expect(withoutPage.html).not.toContain('/p/');
  });
});
