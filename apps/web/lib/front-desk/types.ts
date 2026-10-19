// UrgAns front desk (URG-381, Oyin approved the mocks Oct 18, 2026).
//
// A curator teaches UrgAns their terms once; artists then ask UrgAns about a
// pitch and get an answer built ONLY from facts, each one cited. Anything the
// facts do not cover becomes one clean question for the curator.
//
// These are the shapes every part of the feature passes around. They are
// deliberately small and structured: the answer engine (answer.ts) composes
// sentences from these fields and nothing else, which is what makes "never
// invents a date, price or inclusion" checkable in code and in tests.

/** One thing a curator sells, as they describe it on screen 12. */
export type DeskService = {
  id: string;
  name: string;
  /** One line, e.g. "1 week on New Music Friday". */
  summary: string;
  /** What it includes, e.g. ["Placement", "1 IG story"]. Matched by the engine. */
  includes: string[];
  /** Naira, whole. null when the curator did not give a rate. */
  rateNaira: number | null;
};

/** A house rule or a learned answer. `learned` ones came from the one-tap loop. */
export type DeskRule = {
  id: string;
  text: string;
  learned?: boolean;
  /** ISO time it was added (learned rules show "New" for a week). */
  addedAt?: string | null;
};

export type DeskTiming = {
  repliesWithinDays: number | null;
  bookAheadDays: number | null;
  /** A weekday name in the plural ("Fridays") or a short phrase. */
  startsOn: string | null;
  /** A short phrase, e.g. "1 week". */
  runsFor: string | null;
};

export type DeskTerms = {
  services: DeskService[];
  timing: DeskTiming;
  /** What to send, e.g. ["Song link", "EPK", "Clean version"]. */
  send: string[];
  genres: string[];
  rules: DeskRule[];
};

/**
 * Where an answer came from. The colour on screen follows the kind:
 * green = curator terms or agreed fields, blue = thread, amber = live status.
 */
export type DeskSourceKind = 'terms' | 'agreed' | 'thread' | 'status' | 'page';

export type DeskSource = {
  kind: DeskSourceKind;
  /** Shown on the chip, e.g. "Agreed terms · Sun 18 Oct". */
  label: string;
};

export type DeskPitchStatus = 'new' | 'listened' | 'added' | 'passed' | 'accepted' | 'live';

/** A thread message the engine may read. `adds` lists inclusions it agreed. */
export type DeskThreadMessage = {
  from: 'curator' | 'artist';
  text: string;
  at: string;
  adds?: string[];
};

export type DeskAgreed = {
  service: string;
  serviceId?: string | null;
  feeNaira?: number | null;
  /** ISO date (yyyy-mm-dd). */
  startDate?: string | null;
  endDate?: string | null;
  /** ISO time the curator accepted. */
  agreedAt: string;
};

/** Everything about ONE pitch the engine may read. Never another pitch. */
export type DeskPitchFacts = {
  id: string;
  songTitle: string;
  artistName: string;
  playlistName: string;
  status: DeskPitchStatus;
  sentAt: string;
  /** When the status last moved (opened, decided). */
  statusAt: string | null;
  agreed?: DeskAgreed | null;
  thread?: DeskThreadMessage[];
};

export type DeskFacts = {
  curatorName: string;
  terms: DeskTerms;
  /** null before a pitch exists (pre-pitch questions, decision 1). */
  pitch: DeskPitchFacts | null;
};

export type DeskAnswer =
  | {
      kind: 'answer';
      intent: string;
      /** The bold first words. Every word here comes from a fact. */
      lead: string;
      rest: string;
      source: DeskSource;
    }
  | {
      kind: 'escalate';
      intent: string;
      lead: string;
      rest: string;
      /** What is agreed now, shown under a "can't confirm" so nothing feels lost. */
      agreedNow: Array<{ label: string; value: string }>;
      /** The clean, editable question for the curator. */
      draft: string;
    };

/** One open question per pitch; items are numbered for the curator. */
export type DeskQuestionItem = { text: string; norm: string; at: string };

export type DeskOpenQuestion = {
  id: string;
  pitchId: string;
  items: DeskQuestionItem[];
  status: 'open' | 'answered';
  curatorAnswer: string | null;
  proposedRule: string | null;
  ruleDecision: 'added' | 'once' | null;
  createdAt: string;
  answeredAt: string | null;
};

/** One question UrgAns answered on its own (the curator's "answered N" row). */
export type DeskAnsweredItem = {
  question: string;
  answer: string;
  source: DeskSource;
  at: string;
};
