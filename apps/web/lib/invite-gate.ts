// The invite gate (founder request, 2026-10-11).
//
// Once a manager starts scrolling through their FIRST generated rollout plan,
// the app stops and asks them to invite one teammate. Nothing else works until
// an invite has gone out: Urganize is a team product, and a plan nobody else
// can see is the moment the second-release rate is lost.
//
// What this file holds is the pure half, so it can be unit-tested:
//   - whether the gate is switched on at all,
//   - who it applies to (`shouldRequireInvite`), decided from facts the server
//     reads fresh every time; the client never re-derives it,
//   - which scroll counts as "scrolling through the plan".
//
// Discipline, all load-bearing:
//  - ON BY DEFAULT, with an off switch. This breaks the usual "flag starts off"
//    rule on purpose, by founder call: he asked for it live, and the kill
//    switch is NEXT_PUBLIC_FEATURE_INVITE_GATE=false in Vercel Web.
//  - FAILS OPEN. Any fact the server cannot read means no gate. Freezing the
//    app because a count query blipped would be far worse than letting one
//    person through.
//  - NEVER A WALL NOBODY CAN CLIMB. Only owners and admins can invite, so only
//    they are gated, and a team whose plan has no free seat (paid Solo) is
//    never gated, because the invite would be refused.
//  - FIRST PLAN ONLY. A team that already has two or more rollouts was using
//    Urganize before the gate existed and is left alone. Since a gated team
//    cannot get past the plan to create a second rollout, "exactly one rollout"
//    describes every new team that reaches it.
//  - THE INVITE ITSELF IS THE KEY. A pending invite occupies a seat, so the
//    moment one is sent the seat count passes 1 and the gate never asks again,
//    on any device. Nothing new is stored server-side.

export const isInviteGateEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_INVITE_GATE !== 'false';

export type InviteGateFacts = {
  /** The caller's role in their primary team. */
  role: string | null;
  /** Seats in use, owner included (invited + active). null = unreadable. */
  seats: number | null;
  /** Would the team's plan allow one more seat? */
  seatAvailable: boolean;
  /** Rollouts the team owner has. null = unreadable. */
  rollouts: number | null;
  /** Activities on the team's plan(s). null = unreadable. */
  activities: number | null;
};

export function shouldRequireInvite(facts: InviteGateFacts): boolean {
  if (facts.role !== 'owner' && facts.role !== 'admin') return false;
  if (facts.seats === null || facts.rollouts === null || facts.activities === null) return false;
  if (facts.seats > 1) return false;
  if (!facts.seatAvailable) return false;
  if (facts.rollouts !== 1) return false;
  return facts.activities > 0;
}

/** Remembers, per team, that the gate has fired in this browser, so a reload
 * or a jump to another page cannot slip past it. Cleared once an invite is
 * sent. */
export const inviteGateStorageKey = (workspaceId: string): string =>
  `urganize:invite-gate:${workspaceId}`;

/** Fired on window by any invite form outside the gate (the first-win
 * reveal's invite step, Settings) the moment an invite succeeds, so a gate
 * holding an earlier "invite needed" answer drops it at once. */
export const TEAMMATE_INVITED_EVENT = 'urganize:teammate-invited';

/** The plan is the scoped rollout view: /dashboard?release=<id>. */
export function isPlanView(pathname: string | null | undefined, releaseParam: string | null): boolean {
  return pathname === '/dashboard' && Boolean(releaseParam);
}

/** A scroll inside a dialog (the first-win reveal, the share sheet, the
 * team-login step) is not scrolling the plan. */
export function isScrollInsideDialog(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  return Boolean((target as Element).closest('[role="dialog"],[aria-modal="true"]'));
}

export type InviteGateAnswer = {
  required: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
};

export const INVITE_GATE_OFF: InviteGateAnswer = {
  required: false,
  workspaceId: null,
  workspaceName: null,
};

/**
 * Panels that can be open over the plan when the gate fires: the Settings
 * pop-up (`settings` + `section`), a rollout scene (`scene`, plus the content
 * calendar's `month`), an activity drawer (`task`) and the new-rollout guide
 * (`new`). "Continue to my plan" closes all of them (2026-10-11): a browser
 * test sent its invite from Settings, pressed Continue, and was left looking
 * at Settings instead of the plan the button named.
 */
export const INVITE_GATE_PANEL_PARAMS = ['settings', 'section', 'scene', 'month', 'task', 'new'] as const;

/** Where "Continue to my plan" goes: the same page with every panel param removed. */
export function inviteGateContinueUrl(pathname: string, search: string): string {
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  for (const key of INVITE_GATE_PANEL_PARAMS) params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
