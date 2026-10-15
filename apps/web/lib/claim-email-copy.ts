import { RELEASE_CREDIT_ROLE_LABELS, type ReleaseCreditRole } from '@/types/credits';

// Words for the automatic claim email and its one reminder (2026-10-11), and
// the line the rollout owner reads about them in the credits panel. Pure and
// client-safe, so the email template, the server and the panel all read the
// same sentences, and the tests pin them.
//
// The reader is the credited collaborator, who has never heard of Urganize.
// The email has one job: they should finish it thinking "I love this". So it
// is specific (the artist, the rollout, their role), it is about them, and it
// says in one line what the page does for them: it shows the work they have
// done, and they can send it to get the next job.
//
// House rules: fifth-grade words, no em dashes, no Oxford comma, "rollout" for
// the object when there is no title to name.

export type ClaimEmailFacts = {
  recipientName: string;
  artistName: string;
  releaseTitle: string;
  /** Role ids from the credit (release_credit_submissions.roles). */
  roles: readonly string[];
};

/** "Ada Obi" -> "Ada". Kept local so this file stays client-safe. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** "Tems" -> "Tems'", "Wizkid" -> "Wizkid's". */
export function possessive(name: string): string {
  const clean = name.trim();
  if (!clean) return '';
  return /s$/i.test(clean) ? `${clean}'` : `${clean}'s`;
}

/** The artist's team, or "A team" when the rollout names no artist. */
export function creditedBy(artistName: string): string {
  const owner = possessive(artistName);
  return owner ? `${owner} team` : 'A team';
}

/** "a, b and c". No Oxford comma (house style). */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * The roles as a reader says them: "producer and songwriter". Unknown ids and
 * "other" are dropped, since "credited you as other" reads as a mistake; with
 * nothing left the sentence simply leaves the role out.
 */
export function roleWords(roles: readonly string[]): string {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const role of roles) {
    if (role === 'other' || !(role in RELEASE_CREDIT_ROLE_LABELS) || seen.has(role)) continue;
    seen.add(role);
    words.push(RELEASE_CREDIT_ROLE_LABELS[role as ReleaseCreditRole].toLowerCase());
  }
  return joinWords(words);
}

const title = (releaseTitle: string) => releaseTitle.trim() || 'a rollout';

/** "Tems' team credited you as producer on Free Mind." */
export function creditSentence(facts: Pick<ClaimEmailFacts, 'artistName' | 'releaseTitle' | 'roles'>): string {
  const roles = roleWords(facts.roles);
  const as = roles ? ` as ${roles}` : '';
  return `${creditedBy(facts.artistName)} credited you${as} on ${title(facts.releaseTitle)}.`;
}

export const CLAIM_EMAIL_COPY = {
  button: 'Claim your page',
  ready: 'Your page is ready.',
  stillWaiting: 'Your page is still waiting for you.',
  value: 'It shows the work you have delivered, all in one link. Send it when you go for your next job.',
  free: 'It is free. Check your credits, add a short bio and choose who can see it.',
  freshLink: 'We made you a new link, so use this one.',
  onlyReminder: 'This is the only reminder we will send.',
} as const;

export type ClaimEmailKind = 'invite' | 'reminder';

export type ClaimEmailContent = {
  subject: string;
  preview: string;
  greeting: string;
  /** The opening lines, in order. */
  lead: string[];
  value: string;
  button: string;
  /** Short lines under the button. */
  after: string[];
  footnote: string;
};

/**
 * Everything the email says, for the first email and the reminder. The template
 * lays these out and adds the button and the unsubscribe line; the plain-text
 * part is rendered from the same template, so both say the same thing.
 */
export function claimEmailContent(kind: ClaimEmailKind, facts: ClaimEmailFacts): ClaimEmailContent {
  const name = firstName(facts.recipientName);
  const greeting = name ? `Hey ${name},` : 'Hey,';
  const release = title(facts.releaseTitle);
  const by = creditedBy(facts.artistName);
  const footnote = `You are getting this because ${by} put this email on the credits for ${release}. Not you? You can ignore this. To take the page down, use Request removal on it.`;

  if (kind === 'reminder') {
    return {
      subject: `Your page for ${release} is still waiting`,
      preview: 'Your credits are on it, and it is free to claim.',
      greeting,
      lead: [creditSentence(facts), CLAIM_EMAIL_COPY.stillWaiting],
      value: CLAIM_EMAIL_COPY.value,
      button: CLAIM_EMAIL_COPY.button,
      after: [CLAIM_EMAIL_COPY.freshLink, CLAIM_EMAIL_COPY.onlyReminder],
      footnote,
    };
  }

  const artist = facts.artistName.trim();
  return {
    subject: artist ? `${possessive(artist)} team credited you on ${release}` : `You were credited on ${release}`,
    preview: 'Your page is ready. It shows the work you have done.',
    greeting,
    lead: [creditSentence(facts), CLAIM_EMAIL_COPY.ready],
    value: CLAIM_EMAIL_COPY.value,
    button: CLAIM_EMAIL_COPY.button,
    after: [CLAIM_EMAIL_COPY.free],
    footnote,
  };
}

// ---- What the owner reads in the credits panel --------------------------------

/**
 * The status line under a credited person when Urganize emailed them on its own:
 * "We emailed Ada on 3 Oct" and, once the reminder went, "We emailed Ada on
 * 3 Oct and reminded them on 10 Oct". Dates come in already formatted, so this
 * stays pure.
 */
export function autoEmailStatusLine(input: {
  name: string;
  invitedOn: string;
  remindedOn: string | null;
}): string {
  const who = firstName(input.name) || 'them';
  const first = `We emailed ${who} their link on ${input.invitedOn}`;
  return input.remindedOn ? `${first} and reminded them on ${input.remindedOn}` : first;
}

/** The hint after the first email, so the owner does not send a second one. */
export const AUTO_EMAIL_HINT = 'No need to send it yourself. If they do not claim it, we send one reminder a week later.';

/** The owner's own email button, once Urganize already sent the link. */
export function emailAgainLabel(name: string): string {
  const who = firstName(name) || name.trim();
  return `Email ${who} again`;
}
