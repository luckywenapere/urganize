import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMAIL_STATUS_LABELS,
  EMAIL_TEMPLATE_LABELS,
  EMAIL_TRIGGER_LABELS,
  emailKindLine,
  emailStatusLabel,
  emailTemplateLabel,
  emailTriggerLabel,
} from './kind-labels';
import { EMAIL_TEMPLATES } from './registry';

// Plain names on /admin/emails (2026-11-12, #1241).

const SEEN_IN_PRODUCTION = [
  'admin_broadcast',
  'admin_test',
  'claim_auto_invite',
  'ai_wallet_empty',
  'manually_marked_paid',
  'paywall_hit',
  'paywall_return_visit',
  'talk_to_us_clicked',
  'trial_ending_soon',
  'onboarding_completed',
  'onboarding_sequence',
  'pitch_new_late',
  'release_out_now',
  'release_payback_question',
  'task_assigned',
  'admin_comp',
  'admin_extend_trial',
  'backfill_comped',
  'backfill_trial_extended',
  'waitlist_joined',
  'work_request_answered',
  'teammate_invited',
];

describe('email kind labels', () => {
  it('names every template in the registry', () => {
    for (const id of Object.keys(EMAIL_TEMPLATES)) {
      expect(EMAIL_TEMPLATE_LABELS[id as keyof typeof EMAIL_TEMPLATE_LABELS], id).toBeTruthy();
      expect(emailTemplateLabel(id), id).not.toMatch(/_/);
    }
  });

  it('names every trigger the production log held on 12 Nov 2026', () => {
    for (const trigger of SEEN_IN_PRODUCTION) expect(EMAIL_TRIGGER_LABELS[trigger], trigger).toBeTruthy();
  });

  it('names every founder alert kind', () => {
    const source = readFileSync(path.join(__dirname, 'alert-types.ts'), 'utf8');
    const union = source.slice(
      source.indexOf('export type FounderAlertKind'),
      source.indexOf('export type FounderAlertContext')
    );
    const kinds = [...union.matchAll(/\|\s*'([a-z_]+)'/g)].map((match) => match[1]);
    expect(kinds.length).toBeGreaterThan(5);
    for (const kind of kinds) expect(EMAIL_TRIGGER_LABELS[kind], kind).toBeTruthy();
  });

  it('keeps labels short and plain: no code names, no em dashes', () => {
    const all = [
      ...Object.values(EMAIL_TEMPLATE_LABELS),
      ...Object.values(EMAIL_TRIGGER_LABELS),
      ...Object.values(EMAIL_STATUS_LABELS),
    ];
    for (const label of all) {
      expect(label).not.toMatch(/_|—/);
      expect(label).not.toMatch(/^[A-Z_]+$/);
      expect(label.length).toBeLessThanOrEqual(30);
    }
  });

  it('makes an unknown code readable rather than blank', () => {
    expect(emailTriggerLabel('some_new_thing')).toBe('Some new thing');
    expect(emailTemplateLabel('OPT_IN')).toBe('Opt in');
    expect(emailStatusLabel('complained')).toBe('Marked spam');
  });

  it('shows the trigger under the kind only when it says something more', () => {
    expect(emailKindLine({ template: 'team_admin_notice', trigger: 'admin_extend_trial' })).toEqual({
      kind: 'Trial or comp notice',
      trigger: 'Trial extended',
    });
    expect(emailKindLine({ template: 'task_assigned', trigger: 'task_assigned' })).toEqual({
      kind: 'Activity assigned',
      trigger: null,
    });
    expect(emailKindLine({ template: 'pitch_notice', trigger: '' })).toEqual({ kind: 'Pitch update', trigger: null });
  });
});
