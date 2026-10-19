// The sample the front desk shows while it is behind its flag and the account
// has no real curator pitches (Oyin's call, Oct 18, 2026: keep the approved
// mock data — Kultured Nativs, "Honest" by Kemi Ade inside a rollout, and
// "Owambe Season" by Ayo Kalu on the public status link — until a real curator
// gives permission to use theirs). Placeholder prices, as in the mocks.
//
// It is DATA, run through the same answer engine as a real pitch, so the sample
// proves the engine rather than faking its output.

import type { DeskAnsweredItem, DeskFacts, DeskOpenQuestion, DeskTerms } from './types';
import { normaliseQuestion } from './text';

export const SAMPLE_PITCH_ID = 'sample';
export const SAMPLE_STATUS_TOKEN = 'sample';
export const SAMPLE_CURATOR = 'Kultured Nativs';

export const SAMPLE_TERMS: DeskTerms = {
  services: [
    { id: 'svc-placement', name: 'Playlist placement', summary: '1 week on New Music Friday', includes: ['Placement'], rateNaira: 25000 },
    { id: 'svc-spotlight', name: 'Spotlight', summary: 'Placement + 1 IG story', includes: ['Placement', '1 IG story'], rateNaira: 50000 },
    { id: 'svc-interview', name: 'Interview', summary: 'Written or video Q&A', includes: ['Written or video Q&A'], rateNaira: 75000 },
  ],
  timing: { repliesWithinDays: 3, bookAheadDays: 7, startsOn: 'Fridays', runsFor: '1 week' },
  send: ['Song link', 'EPK', 'Clean version'],
  genres: ['Afrobeats', 'Afro-soul', 'Alté', 'Amapiano'],
  rules: [
    { id: 'rule-pay', text: 'Pay before the start date, directly to me' },
    { id: 'rule-streams', text: 'No stream guarantees' },
  ],
};

/** "Honest" by Kemi Ade, pitched from its rollout (screens 13, 15, 16). */
export const SAMPLE_ROLLOUT_FACTS: DeskFacts = {
  curatorName: SAMPLE_CURATOR,
  terms: SAMPLE_TERMS,
  pitch: {
    id: SAMPLE_PITCH_ID,
    songTitle: 'Honest',
    artistName: 'Kemi Ade',
    playlistName: 'New Music Friday',
    status: 'accepted',
    sentAt: '2026-10-17T10:00:00+01:00',
    statusAt: '2026-10-18T09:30:00+01:00',
    agreed: {
      service: 'Playlist placement',
      serviceId: 'svc-placement',
      feeNaira: 25000,
      startDate: '2026-10-30',
      endDate: '2026-11-05',
      agreedAt: '2026-10-18T09:30:00+01:00',
    },
    thread: [
      { from: 'artist', text: 'Could you add an IG story on drop day?', at: '2026-10-19T18:00:00+01:00' },
      {
        from: 'curator',
        text: "Sure, I'll do one story on drop day, Fri 6 Nov.",
        at: '2026-10-20T11:00:00+01:00',
        adds: ['one story on drop day, Fri 6 Nov'],
      },
    ],
  },
};

/** "Owambe Season" by Ayo Kalu, the standalone pitch on the status link (screen 14). */
export const SAMPLE_STATUS_FACTS: DeskFacts = {
  curatorName: SAMPLE_CURATOR,
  terms: SAMPLE_TERMS,
  pitch: {
    id: 'sample-status',
    songTitle: 'Owambe Season',
    artistName: 'Ayo Kalu',
    playlistName: 'New Music Friday',
    status: 'accepted',
    sentAt: '2026-10-18T08:00:00+01:00',
    statusAt: '2026-10-19T10:00:00+01:00',
    agreed: {
      service: 'Playlist placement',
      serviceId: 'svc-placement',
      feeNaira: 25000,
      startDate: '2026-10-23',
      endDate: '2026-10-29',
      agreedAt: '2026-10-19T10:00:00+01:00',
    },
    thread: [],
  },
};

export const SAMPLE_STATUS_LATEST = {
  from: SAMPLE_CURATOR,
  text: "Love the record. Send the clean version before Thursday and it's in for the 23rd.",
  ago: '2h',
};

/** What UrgAns answered on its own for Kemi (the curator's quiet row, screen 16). */
export const SAMPLE_ANSWERED: DeskAnsweredItem[] = [
  { question: 'When does it start?', answer: 'Fri 30 Oct, for one week', source: { kind: 'agreed', label: 'Agreed terms' }, at: '2026-10-18T12:00:00+01:00' },
  { question: 'Is the IG story included?', answer: 'Yes, one on drop day', source: { kind: 'thread', label: 'Your thread · Tue' }, at: '2026-10-20T12:00:00+01:00' },
  { question: 'Did you get my song?', answer: 'Yes, opened Sun 18 Oct', source: { kind: 'status', label: 'Pitch status' }, at: '2026-10-18T13:00:00+01:00' },
  { question: 'What should I send?', answer: 'Clean version, song link and EPK', source: { kind: 'terms', label: 'Your terms' }, at: '2026-10-18T14:00:00+01:00' },
  { question: 'Do I pay before it starts?', answer: 'Yes, directly to you', source: { kind: 'terms', label: 'Your terms' }, at: '2026-10-19T09:00:00+01:00' },
  { question: 'Will it get 10k streams?', answer: 'No stream guarantees', source: { kind: 'terms', label: 'Your terms' }, at: '2026-10-19T10:00:00+01:00' },
];

const SAMPLE_Q = "Can the placement move from Fri 30 Oct to Fri 6 Nov, Honest's drop day?";

export const SAMPLE_OPEN_QUESTION: DeskOpenQuestion = {
  id: 'sample-question',
  pitchId: SAMPLE_PITCH_ID,
  items: [{ text: SAMPLE_Q, norm: normaliseQuestion(SAMPLE_Q), at: '2026-10-20T15:00:00+01:00' }],
  status: 'open',
  curatorAnswer: null,
  proposedRule: null,
  ruleDecision: null,
  createdAt: '2026-10-20T15:00:00+01:00',
  answeredAt: null,
};

/** Other pitches in the sample curator inbox (screen 16 inbox). */
export const SAMPLE_INBOX = [
  { id: SAMPLE_PITCH_ID, songTitle: 'Honest', artistName: 'Kemi Ade', service: 'Playlist placement', openItems: 1, answered: 6 },
  { id: 'sample-2', songTitle: 'Owambe Season', artistName: 'Ayo Kalu', service: 'Playlist placement', openItems: 0, answered: 3 },
  { id: 'sample-3', songTitle: 'Lagos Rain', artistName: 'Tobi Wav', service: 'Spotlight', openItems: 0, answered: 2 },
];
