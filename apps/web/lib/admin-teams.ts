// /admin/teams action parsing. Pure — no I/O, no React.
//
// The admin panel's PATCH takes a discriminated union of actions. Parsing it
// here rather than inline in the route means every rejection is unit-tested,
// which matters more than usual: these are the actions that hand out free
// access and record what a team has agreed to pay.

/** Plans an admin may set by hand. 'founding' is the lifetime price lock;
 * 'custom' is a negotiated rate. Both are in subscriptions_plan_check as of
 * 20260821120000.
 *
 * 'enterprise' is GROUP (back 2026-10-02), and "Mark paid" is the only way a team
 * gets onto it: Group is sales-led, with no checkout and no Paystack Plan. It is
 * in subscriptions_plan_check since 20260823100000. The admin may type "group";
 * it is stored as 'enterprise', the id the rest of the code reads.
 *
 * Self-serve tiers (solo, manager, label) are left out: they are bought through
 * checkout, which writes the interval and the Paystack codes this cannot. */
export const ADMIN_ASSIGNABLE_PLANS = ['monthly', 'annual', 'founding', 'custom', 'enterprise'] as const;
export type AdminAssignablePlan = (typeof ADMIN_ASSIGNABLE_PLANS)[number];

/** How often a hand-recorded deal is billed. Stored on
 * subscriptions.billing_interval so MRR divides a yearly deal by 12 instead of
 * counting it as one month's revenue. */
export type AdminBillingInterval = 'monthly' | 'six_month' | 'annual';

/** Guard rails on extend. Long enough for a real sales conversation, short
 * enough that a slipped digit cannot silently grant a decade. An indefinite
 * grant is what comp is for. */
export const MIN_EXTEND_DAYS = 1;
export const MAX_EXTEND_DAYS = 365;

export const MAX_ADMIN_NOTE_LENGTH = 2000;

export type TeamAdminAction =
  | { type: 'extend_trial'; workspaceId: string; days: number; note: string | null }
  | { type: 'comp'; workspaceId: string; note: string | null }
  | { type: 'uncomp'; workspaceId: string }
  | { type: 'assign_founding'; workspaceId: string; amountMinorUnit: number; note: string | null }
  | { type: 'set_custom_price'; workspaceId: string; amountMinorUnit: number; note: string | null }
  | {
      type: 'mark_paid';
      workspaceId: string;
      plan: AdminAssignablePlan;
      amountMinorUnit: number;
      expiresAt: string;
      /** Required for Group; optional for the legacy plans, whose name already says. */
      billingInterval: AdminBillingInterval | null;
      note: string | null;
    };

const isUuidish = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length >= 32 && value.trim().length <= 64;

const parseNote = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_ADMIN_NOTE_LENGTH);
  return trimmed || null;
};

/** Amounts are KOBO everywhere in this system, matching subscriptions.amount
 * and packages/pricing's minorUnit. A non-integer or negative value is a bug
 * in the caller, not something to coerce. */
const parseAmount = (value: unknown): number | null => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  return amount;
};

const parseFutureIso = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
};

export function isAdminAssignablePlan(value: unknown): value is AdminAssignablePlan {
  return (
    typeof value === 'string' && (ADMIN_ASSIGNABLE_PLANS as readonly string[]).includes(value)
  );
}

/** The plan an admin typed, normalised: trimmed, lower case, "group" read as
 * 'enterprise'. Null when it is not a plan an admin may set. */
export function parseAdminPlan(value: unknown): AdminAssignablePlan | null {
  if (typeof value !== 'string') return null;
  const plan = value.trim().toLowerCase();
  const id = plan === 'group' ? 'enterprise' : plan;
  return isAdminAssignablePlan(id) ? id : null;
}

/** "monthly", "six_month" (also "6 months", "6m"), or "annual" (also
 *  "yearly"). Null for anything else, including absent. */
export function parseAdminBillingInterval(value: unknown): AdminBillingInterval | null {
  if (typeof value !== 'string') return null;
  const interval = value.trim().toLowerCase();
  if (interval === 'monthly') return 'monthly';
  if (interval === 'six_month' || interval === '6 months' || interval === '6m') return 'six_month';
  if (interval === 'annual' || interval === 'yearly') return 'annual';
  return null;
}

/**
 * Parse a PATCH body into an action, or explain why not.
 *
 * Every rejection carries a message the admin panel can show verbatim: this is
 * a founder-facing tool, and "Invalid request" would just mean opening the
 * network tab.
 */
export function parseTeamAdminAction(
  body: unknown
): { action: TeamAdminAction } | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Expected a JSON body.' };
  }

  const raw = body as Record<string, unknown>;
  const workspaceId = raw.workspaceId;
  if (!isUuidish(workspaceId)) {
    return { error: 'workspaceId is required.' };
  }
  const id = workspaceId.trim();
  const note = parseNote(raw.note);

  switch (raw.action) {
    case 'extend_trial': {
      const days = typeof raw.days === 'number' ? raw.days : Number(raw.days);
      if (!Number.isInteger(days) || days < MIN_EXTEND_DAYS || days > MAX_EXTEND_DAYS) {
        return {
          error: `days must be a whole number between ${MIN_EXTEND_DAYS} and ${MAX_EXTEND_DAYS}.`,
        };
      }
      return { action: { type: 'extend_trial', workspaceId: id, days, note } };
    }

    case 'comp':
      return { action: { type: 'comp', workspaceId: id, note } };

    case 'uncomp':
      return { action: { type: 'uncomp', workspaceId: id } };

    case 'assign_founding': {
      const amountMinorUnit = parseAmount(raw.amountMinorUnit);
      if (amountMinorUnit === null) {
        return { error: 'amountMinorUnit must be a positive whole number of kobo.' };
      }
      return {
        action: { type: 'assign_founding', workspaceId: id, amountMinorUnit, note },
      };
    }

    case 'set_custom_price': {
      const amountMinorUnit = parseAmount(raw.amountMinorUnit);
      if (amountMinorUnit === null) {
        return { error: 'amountMinorUnit must be a positive whole number of kobo.' };
      }
      return {
        action: { type: 'set_custom_price', workspaceId: id, amountMinorUnit, note },
      };
    }

    case 'mark_paid': {
      const plan = parseAdminPlan(raw.plan);
      if (!plan) {
        return { error: `plan must be one of ${ADMIN_ASSIGNABLE_PLANS.join(', ')} (or group).` };
      }
      const hasInterval = raw.billingInterval !== undefined && raw.billingInterval !== null && raw.billingInterval !== '';
      const billingInterval = parseAdminBillingInterval(raw.billingInterval);
      if (hasInterval && !billingInterval) {
        return { error: 'billingInterval must be monthly, 6 months or yearly.' };
      }
      // A Group price is whatever was agreed, so nothing else can say how often
      // it is billed, and the scoreboard's MRR needs to know.
      if (plan === 'enterprise' && !billingInterval) {
        return { error: 'A Group plan needs billingInterval: monthly, 6 months or yearly.' };
      }
      const amountMinorUnit = parseAmount(raw.amountMinorUnit);
      if (amountMinorUnit === null) {
        return { error: 'amountMinorUnit must be a positive whole number of kobo.' };
      }
      const expiresAt = parseFutureIso(raw.expiresAt);
      if (!expiresAt) {
        return { error: 'expiresAt must be a valid date.' };
      }
      return {
        action: {
          type: 'mark_paid',
          workspaceId: id,
          plan,
          amountMinorUnit,
          expiresAt,
          billingInterval,
          note,
        },
      };
    }

    default:
      return { error: 'Unknown action.' };
  }
}

/** The event each action records, so the route cannot forget one. */
export const ACTION_EVENT_TYPE = {
  extend_trial: 'trial_extended',
  comp: 'comped',
  uncomp: 'uncomped',
  assign_founding: 'founding_assigned',
  set_custom_price: 'custom_price_set',
  mark_paid: 'manually_marked_paid',
} as const;
