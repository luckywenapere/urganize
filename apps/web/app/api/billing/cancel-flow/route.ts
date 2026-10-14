import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  acceptRetentionOffer,
  cancelPlan,
  claimInviteExtension,
  loadCancelFlowContext,
  pausePlan,
  recordCancelFlowStep,
  resumePlan,
  takeCancelDiscount,
  type CancelFlowActionResult,
} from '@/lib/cancel-flow-server';
import {
  isBudgetBandId,
  isCancelFlowEnabled,
  isCancelFlowEvent,
  isCancelFlowOffer,
  isCancelReasonId,
  isPauseOptionId,
} from '@/lib/cancel-flow';

// The cancel flow (2026-10-14). Rules: lib/cancel-flow.ts. I/O:
// lib/cancel-flow-server.ts. This file only parses and answers.
//
// GET  -> the flow's context for the signed-in OWNER ({ available: false } for
//         everyone else, and whenever anything cannot be read, including before
//         the migration is applied: Settings then keeps its old controls).
// POST -> { action, flowId, ... }:
//   discount | invite_extension | pause {option} | resume | retention_offer {band}
//   | cancel {reason} | event {event, offer?, reason?, band?, text?}
//
// OPEN ROUTE, on purpose (cancel-trial and change-plan beside it): a read-only
// or lapsing team must be able to cancel, pause and resume, and the paywall
// wrapper refuses read-only POSTs with a 403.

export const dynamic = 'force-dynamic';

type Body = Record<string, unknown>;

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

function answer(result: CancelFlowActionResult) {
  if (result.ok) return NextResponse.json(result);
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export async function GET(request: NextRequest) {
  if (!isCancelFlowEnabled()) return NextResponse.json({ available: false, reason: 'off' });
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return NextResponse.json({ available: false, reason: 'signed_out' });
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ available: false, reason: 'not_ready' });
  const context = await loadCancelFlowContext(admin, { id: auth.user.id, email: auth.user.email });
  return NextResponse.json(context, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!isCancelFlowEnabled()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const body = ((await request.json().catch(() => ({}))) ?? {}) as Body;
  const action = str(body.action);
  const flowId = str(body.flowId);
  const user = { id: auth.user.id, email: auth.user.email };

  try {
    switch (action) {
      case 'discount':
        return answer(await takeCancelDiscount(admin, user, flowId));
      case 'invite_extension':
        return answer(await claimInviteExtension(admin, user, flowId));
      case 'pause': {
        if (!isPauseOptionId(body.option)) return NextResponse.json({ error: 'Pick how long.' }, { status: 400 });
        return answer(await pausePlan(admin, user, flowId, body.option));
      }
      case 'resume':
        return answer(await resumePlan(admin, user, flowId));
      case 'retention_offer': {
        if (!isBudgetBandId(body.band)) return NextResponse.json({ error: 'Pick a price.' }, { status: 400 });
        return answer(await acceptRetentionOffer(admin, user, flowId, body.band));
      }
      case 'cancel':
        return answer(await cancelPlan(admin, user, flowId, isCancelReasonId(body.reason) ? body.reason : null));
      case 'event': {
        if (!isCancelFlowEvent(body.event)) return NextResponse.json({ error: 'Unknown event.' }, { status: 400 });
        // The outcomes that change money or access are recorded by their own
        // actions; the client may not write them as a bare event.
        if (body.event === 'cancelled' || body.event === 'resumed' || body.event === 'offer_accepted') {
          if (!(body.event === 'offer_accepted' && body.offer === 'budget_switch_plan')) {
            return NextResponse.json({ error: 'Unknown event.' }, { status: 400 });
          }
        }
        return answer(
          await recordCancelFlowStep(admin, user, {
            flowId,
            event: body.event,
            offer: isCancelFlowOffer(body.offer) ? body.offer : null,
            reason: isCancelReasonId(body.reason) ? body.reason : null,
            budgetBand: isBudgetBandId(body.band) ? body.band : null,
            text: typeof body.text === 'string' ? body.text : null,
            metadata: { step: str(body.step) },
          })
        );
      }
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (error) {
    console.error('[cancel-flow] action failed', action, error);
    return NextResponse.json({ error: 'Something went wrong. Nothing was changed.' }, { status: 500 });
  }
}
