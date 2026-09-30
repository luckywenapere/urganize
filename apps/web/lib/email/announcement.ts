// The rules for an email written in the admin composer. Pure and React-free, so
// the API routes can check a draft without loading the email renderer.

import { noteTextToPlain } from './note-text';

export const ANNOUNCEMENT_SUBJECT_MAX = 150;
export const ANNOUNCEMENT_BODY_MAX = 10_000;

export type AnnouncementDraft = {
  subject: string;
  body: string;
  includeGreeting: boolean;
  signOff: boolean;
};

export type ParsedAnnouncementDraft = { ok: true; draft: AnnouncementDraft } | { ok: false; error: string };

export function parseAnnouncementDraft(raw: unknown): ParsedAnnouncementDraft {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Write a subject and a message.' };
  const input = raw as Record<string, unknown>;
  const subject = announcementSubject(String(input.subject ?? ''));
  const body = String(input.body ?? '').replace(/\r\n?/g, '\n').trim();

  if (!subject) return { ok: false, error: 'Write a subject.' };
  if (String(input.subject ?? '').trim().length > ANNOUNCEMENT_SUBJECT_MAX) {
    return { ok: false, error: `Keep the subject under ${ANNOUNCEMENT_SUBJECT_MAX} characters.` };
  }
  if (!body) return { ok: false, error: 'Write a message.' };
  if (body.length > ANNOUNCEMENT_BODY_MAX) {
    return { ok: false, error: `Keep the message under ${ANNOUNCEMENT_BODY_MAX.toLocaleString('en')} characters.` };
  }

  return {
    ok: true,
    draft: {
      subject,
      body,
      includeGreeting: input.includeGreeting !== false,
      signOff: input.signOff !== false,
    },
  };
}

export function announcementSubject(subject: string): string {
  return subject.replace(/\s+/g, ' ').trim().slice(0, ANNOUNCEMENT_SUBJECT_MAX);
}

/** The inbox preheader: the start of the message, on one line. */
export function announcementPreview(body: string): string {
  const plain = noteTextToPlain(body).replace(/\s+/g, ' ').trim();
  return plain.length <= 110 ? plain : `${plain.slice(0, 109).trimEnd()}…`;
}
