import { describe, it, expect } from 'vitest';
import { buildWorkspaceInviteEmail } from './email-templates';

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
    expect(subject).toBe('A teammate invited you to a workspace on Urganize');
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
