// /admin/teams action parsing. Pure — no I/O, no React.
//
// The admin panel's PATCH takes a discriminated union of actions. Parsing it
// here rather than inline in the route means every rejection is unit-tested,
// which matters more than usual: these are the actions that hand out free
// access and record what a team has agreed to pay.

/** Plans an admin may set by hand. 'founding' is the lifetime price lock;
 * 'custom' is a negotiated rate. Both are in subscriptions_plan_check as of
 * 20260821120000. 'label' is excluded on purpose: it is contactSales, so a
 * label deal is recorded as 'custom' with the agreed amount. */
export const ADMIN_ASSIGNABLE_PLANS = ['monthly', 'annual', 'founding', 'custom'] as const;
export type AdminAssignablePlan = (typeof ADMIN_ASSIGNABLE_PLANS)[number];

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
      if (!isAdminAssignablePlan(raw.plan)) {
        return { error: `plan must be one of ${ADMIN_ASSIGNABLE_PLANS.join(', ')}.` };
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
          plan: raw.plan,
          amountMinorUnit,
          expiresAt,
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
