import { describe, expect, it } from 'vitest';
import {
  BRIEF_GUESTS_MAX,
  briefGuestJoinPath,
  briefGuestPagePath,
  briefGuestShareText,
  guestMayChangeTask,
  isPlaceholderGuestEmail,
  isSeatExempt,
  parseBriefGuestInvite,
  placeholderGuestEmail,
  whatsappShareUrl,
} from './brief-guests';

const task = '0b7c1d2e-aaaa-4bbb-8ccc-000000000001';

describe('parseBriefGuestInvite', () => {
  it('takes a name, an optional email and their part', () => {
    expect(parseBriefGuestInvite({ name: ' Tolu ', email: ' Tolu@Example.com ', taskIds: [task, task] })).toEqual({
      ok: true,
      value: { name: 'Tolu', email: 'tolu@example.com', taskIds: [task] },
    });
    expect(parseBriefGuestInvite({ name: 'Tolu', taskIds: [] })).toEqual({ ok: true, value: { name: 'Tolu', email: null, taskIds: [] } });
  });

  it('refuses no name, a bad email and made-up ids', () => {
    expect(parseBriefGuestInvite({ name: '  ' }).ok).toBe(false);
    expect(parseBriefGuestInvite({ name: 'x'.repeat(81) }).ok).toBe(false);
    expect(parseBriefGuestInvite({ name: 'Tolu', email: 'not-an-email' }).ok).toBe(false);
    expect(parseBriefGuestInvite({ name: 'Tolu', taskIds: ['../x'] }).ok).toBe(false);
    expect(parseBriefGuestInvite(null).ok).toBe(false);
  });
});

describe('placeholder emails', () => {
  it('marks a guest shared without an email, and never a real one', () => {
    expect(isPlaceholderGuestEmail(placeholderGuestEmail('abc'))).toBe(true);
    expect(isPlaceholderGuestEmail('tolu@example.com')).toBe(false);
  });
});

describe('isSeatExempt', () => {
  it('lets a guest invited from a brief skip the seat count, and nobody else', () => {
    expect(isSeatExempt({ role: 'guest', brief_release_id: 'r1' })).toBe(true);
    expect(isSeatExempt({ role: 'guest', brief_release_id: null })).toBe(false);
    expect(isSeatExempt({ role: 'member', brief_release_id: 'r1' })).toBe(false);
  });

  it('caps brief guests per rollout', () => {
    expect(BRIEF_GUESTS_MAX).toBe(5);
  });
});

describe('guestMayChangeTask', () => {
  it('lets a guest mark their own activity, and only its status', () => {
    expect(guestMayChangeTask({ body: { status: 'done' }, assignedTo: 'u1', userId: 'u1' })).toBe(true);
    expect(guestMayChangeTask({ body: { status: 'done' }, assignedTo: 'u2', userId: 'u1' })).toBe(false);
    expect(guestMayChangeTask({ body: { status: 'done', title: 'x' }, assignedTo: 'u1', userId: 'u1' })).toBe(false);
    expect(guestMayChangeTask({ body: { dueDate: '2026-11-01' }, assignedTo: 'u1', userId: 'u1' })).toBe(false);
    expect(guestMayChangeTask({ body: {}, assignedTo: 'u1', userId: 'u1' })).toBe(false);
    expect(guestMayChangeTask({ body: null, assignedTo: 'u1', userId: 'u1' })).toBe(false);
    expect(guestMayChangeTask({ body: { status: 'done' }, assignedTo: null, userId: 'u1' })).toBe(false);
  });
});

describe('links and words', () => {
  it('builds the page, the join link that lands on the brief, and the WhatsApp text', () => {
    expect(briefGuestPagePath('tok')).toBe('/brief/invite/tok');
    expect(briefGuestJoinPath('tok', 'rel')).toBe('/invite/accept?token=tok&next=%2Fdashboard%3Frelease%3Drel%26scene%3Dbrief');
    expect(briefGuestShareText({ senderName: 'Oyin', releaseTitle: 'First Light', link: 'https://x/y' })).toBe(
      'Oyin shared the brief for First Light with you.\nhttps://x/y'
    );
    expect(whatsappShareUrl('a b')).toBe('https://wa.me/?text=a%20b');
  });
});
