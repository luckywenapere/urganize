/**
 * The Curator Terms and the Artist Terms for curator pitching.
 *
 * ⚠️ DRAFT WORDING. These are the spec's "Draft clauses for a Nigerian fintech
 * lawyer to review before launch", taken verbatim. They are shown in the app
 * only while the feature is switched off for everyone but testers. Before
 * launch, the lawyer-reviewed wording replaces this text AND the version
 * constants in lib/pitch-payments.ts move with it, so the version stored beside
 * each acceptance always names the words that person actually agreed to.
 *
 * Pure and client-safe.
 */

import { ARTIST_PITCH_TERMS_VERSION, CURATOR_TERMS_VERSION } from './pitch-payments';

export type TermsClause = { title: string; body: string };

export const CURATOR_TERMS: { version: string; title: string; clauses: TermsClause[] } = {
  version: CURATOR_TERMS_VERSION,
  title: 'Curator Terms',
  clauses: [
    {
      title: "What you're paid for.",
      body: 'You are paid to listen to each pitch in full and give a written reply within the response window. You are not paid to add any song to any playlist.',
    },
    {
      title: 'No placement for money.',
      body: 'You will not promise, sell or accept payment for a playlist spot, on Urganize or anywhere else. You will not ask an artist to pay you outside Urganize for a pitch sent through Urganize.',
    },
    {
      title: 'How you get paid.',
      body: 'Payments are processed by Paystack, a licensed payment provider. Your share is paid straight to the bank account you verified. Urganize does not hold your earnings.',
    },
    {
      title: 'Missed windows.',
      body: "If you don't reply in time, the artist is refunded in full. Urganize pays that refund first and recovers your share from your next earnings. If you leave Urganize with an unrecovered amount, you agree to repay it.",
    },
    {
      title: 'Strikes.',
      body: 'Three missed windows in 90 days pauses your inbox until we review your account.',
    },
    {
      title: 'Honest playlists.',
      body: 'Your playlists must not use bots, fake streams or paid streams. We may remove you if a streaming service flags your playlist.',
    },
    {
      title: 'Your details.',
      body: "The bank account must be in your name or your registered business's name. You are responsible for your own taxes on what you earn.",
    },
    {
      title: 'Changes.',
      body: "We can change the Urganize fee with 30 days' notice. Pitches already paid keep the fee they were paid at.",
    },
  ],
};

export const ARTIST_PITCH_TERMS: { version: string; title: string; clauses: TermsClause[] } = {
  version: ARTIST_PITCH_TERMS_VERSION,
  title: 'Artist Terms (curator pitching)',
  clauses: [
    {
      title: "What you're paying for.",
      body: "A pitch fee pays for a curator's listen and written reply. It does not buy a playlist spot, and no curator can promise one.",
    },
    {
      title: 'Refunds.',
      body: "If a curator doesn't reply within the window, you get a full refund for that pitch automatically. Once a curator has replied, the fee is not refundable, whatever they decide.",
    },
    {
      title: 'Payments.',
      body: "Payments are processed by Paystack. Each curator's share goes straight to the curator. Urganize keeps only the Urganize fee shown on your receipt.",
    },
    {
      title: 'Your rights.',
      body: 'You confirm you have the right to share the song you pitch.',
    },
    {
      title: 'Side deals.',
      body: "If a curator asks you for money outside Urganize for a spot, report it to us. Don't pay it.",
    },
  ],
};
