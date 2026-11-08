// Words for the claim flow, kept apart from lib/claim.ts so client components
// can import them without pulling in Node's crypto. Fifth-grade wording, no em
// dashes, "rollout" for the object, never "ship".

export const CLAIM_COPY = {
  heading: 'This is you? Claim it.',
  intro: 'A team credited you on a rollout, so a page for you already exists. Claim it to check your credits, add a bio and choose who can see it.',
  confirmHeading: 'Confirm it is you',
  confirmHint: 'Type the email or phone number you gave on the credit.',
  confirmLabel: 'Email or phone on the credit',
  confirmButton: 'Claim this page',
  creditsHeading: 'Your credits',
  creditsHint: 'Hide any credit that is not yours.',
  aboutHeading: 'About you',
  bioLabel: 'Short bio',
  openToLabel: 'Open to work?',
  publishLabel: 'Show my page to anyone with the link',
  publishButton: 'Save my page',
  nextHeading: 'Your page is saved.',
  nextText: 'Start a rollout of your own, or bring your team in.',
  startRollout: 'Start a rollout',
  inviteTeam: 'Invite your team',
  closed: {
    used: 'This page has already been claimed.',
    revoked: 'This link was turned off. Ask the team that credited you for a new one.',
    expired: 'This link has run out. Ask the team that credited you for a new one.',
    locked: 'Too many wrong tries. Ask the team that credited you for a new link.',
    unavailable: 'We could not find that page.',
  },
  wrongContact: 'That does not match the email or phone on the credit.',
} as const;

export const REMOVAL_COPY = {
  link: 'Request removal',
  heading: 'Remove this profile',
  intro: 'Tell us how to reach you. We will take the page down within 3 days.',
  contactLabel: 'Your email or phone',
  noteLabel: 'Anything we should know (optional)',
  button: 'Ask us to remove it',
  done: 'Got it. The page is hidden now, and we will confirm the removal within 3 days.',
} as const;

export const UNCLAIMED_COPY = {
  badge: 'Unclaimed',
  explain: 'A team credited this person. They have not claimed the page yet.',
  creditsHeading: 'Credits',
  noCredits: 'No credits to show yet.',
} as const;

/** The text the rollout owner pastes into WhatsApp for somebody with no email. */
export function whatsappInviteText(input: {
  firstName: string;
  ownerName: string;
  releaseTitle: string;
  claimUrl: string;
}): string {
  const hello = input.firstName.trim() ? `Hi ${input.firstName.trim()},` : 'Hi,';
  const owner = input.ownerName.trim() || 'I';
  const title = input.releaseTitle.trim() || 'our rollout';
  const who = owner === 'I' ? 'I credited you' : `This is ${owner}. I credited you`;
  return `${hello} ${who} on ${title}. Your credit has a page on Urganize that is yours to claim: ${input.claimUrl}`;
}

export function whatsappShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
