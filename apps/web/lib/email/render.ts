import { render, toPlainText } from 'react-email';
import type { ReactElement } from 'react';
import { STILL_LINK_CLASS } from './render-constants';

export type RenderedEmail = { html: string; text: string };

// Render an email component to the { html, text } pair Resend needs.
//
// pretty: false on purpose — prettier formatting is a dev nicety that adds
// nothing to a sent message, and calling it is the one thing that would pull
// prettier into this path. A text/plain alternative measurably lowers spam
// scoring, so both parts are always produced from the same component.
//
// THIS MODULE STATICALLY IMPORTS react-email (and so react-dom/server). It must
// only ever be reached through `await import('./render')` from sendEmail — see
// lib/email/index.ts. Reaching it with a static import would drag
// react-dom/server (and prettier) into every one of the ~55 files that pull in
// tasks-server, which imports @/lib/email. That is the cold-start weight the
// hand-rolled transport was built to avoid in the first place.
export async function renderEmail(element: ReactElement): Promise<RenderedEmail> {
  const html = await render(element, { pretty: false });
  // A picture's link has no words, so html-to-text would print its bare URL as
  // a stray line. Drop it: the note's own link is right beside it in the text.
  const text = await toPlainText(html, { selectors: [{ selector: `a.${STILL_LINK_CLASS}`, format: 'skip' }] });
  return { html, text };
}
