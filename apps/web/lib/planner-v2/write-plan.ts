/**
 * UrgAns writes the plan (planner v2). One structured call, then code checks it:
 *
 *   1. call the model (gpt-5.4 for a first plan or another angle, gpt-5.4-mini
 *      for a tweak; AI_PLANNER_MODEL still overrides the first)
 *   2. validate; on any issue, ONE retry that sends only the issue list
 *   3. still wrong: let code repair what it can; valid after that → use it
 *   4. otherwise, or when the model is down or the wallet is empty: the quick
 *      plan from the playbook (./fallback.ts), labelled, with a Retry
 *
 * The model call is injected (`call`), so the whole loop is unit-tested with
 * fixture answers and no network (write-plan.test.ts).
 */

import type { AiMessage } from '../ai/provider';
import { classifyAiFailure, type AiFailureKind } from '../ai/gateway-error';
import type { Template } from '../release-templates/types';
import { buildFallbackPlanV2, QUICK_PLAN_NOTICE } from './fallback';
import { buildMoveMenu } from './moves';
import type { PlanV2 } from './plan';
import { buildPlanV2Messages, type PlanV2Mode } from './prompt';
import { issuesForModel, markFirstUp, repairPlanV2, validatePlanV2, type PlanV2Context } from './validate';

// Model ids live in lib/ai/planner-model.ts (the router guard allows them
// nowhere else); the server calls through the router by surface.
export { RODIUM_PLANNER_MODEL as PLAN_V2_MODEL, RODIUM_PLANNER_QUICK_MODEL as PLAN_V2_TWEAK_MODEL } from '../ai/planner-model';
import { RODIUM_PLANNER_MODEL, RODIUM_PLANNER_QUICK_MODEL } from '../ai/planner-model';

export type PlanV2Source = 'ai' | 'ai_repaired' | 'fallback';

export type PlanV2FallbackReason = 'not_configured' | 'wallet_empty' | 'unavailable' | 'invalid';

export type WrittenPlanV2 = {
  plan: PlanV2;
  source: PlanV2Source;
  /** Why the quick plan was used. Null when UrgAns wrote it. */
  fallbackReason: PlanV2FallbackReason | null;
  /** Shown on the preview when not null. */
  notice: string | null;
};

export type PlanV2ModelCall = (messages: AiMessage[], model: string | undefined) => Promise<PlanV2>;

export function pickPlanV2Model(mode: PlanV2Mode['kind'], options: { rodium: boolean; override?: string }): string | undefined {
  if (mode === 'tweak') return options.rodium ? RODIUM_PLANNER_QUICK_MODEL : undefined;
  if (options.override) return options.override;
  return options.rodium ? RODIUM_PLANNER_MODEL : undefined;
}

/** The router surface: gpt-5.4 for a first plan or another angle, the quick sibling for a tweak. */
export const planV2Surface = (mode: PlanV2Mode['kind']): 'planner' | 'planner_quick' =>
  mode === 'tweak' ? 'planner_quick' : 'planner';

const NOTICES: Record<PlanV2FallbackReason, string> = {
  not_configured: QUICK_PLAN_NOTICE,
  wallet_empty: QUICK_PLAN_NOTICE,
  unavailable: QUICK_PLAN_NOTICE,
  invalid: QUICK_PLAN_NOTICE,
};

export async function writePlanV2(params: {
  ctx: PlanV2Context;
  title: string;
  template: Template;
  mode: PlanV2Mode;
  configured: boolean;
  model: string | undefined;
  call: PlanV2ModelCall;
  /** Told once when the wallet is empty, so the caller can raise the alert. */
  onWalletEmpty?: () => void | Promise<void>;
  angleSeed?: number;
}): Promise<WrittenPlanV2> {
  const { ctx, title, template, mode, model, call } = params;
  const menu = buildMoveMenu(template, ctx.answers.channels);

  const fallback = (reason: PlanV2FallbackReason): WrittenPlanV2 => ({
    plan: buildFallbackPlanV2(template, ctx),
    source: 'fallback',
    fallbackReason: reason,
    notice: NOTICES[reason],
  });

  if (!params.configured) return fallback('not_configured');

  const failed = async (error: unknown): Promise<PlanV2FallbackReason> => {
    const kind: AiFailureKind = classifyAiFailure(error).kind;
    if (kind === 'insufficient_balance') {
      await params.onWalletEmpty?.();
      return 'wallet_empty';
    }
    if (kind === 'bad_output') return 'invalid';
    return 'unavailable';
  };

  const angleSeed = params.angleSeed ?? Math.floor(Math.random() * 1000);
  let first: PlanV2;
  try {
    first = await call(buildPlanV2Messages({ ctx, title, menu, mode, angleSeed }), model);
  } catch (error) {
    return fallback(await failed(error));
  }

  const ok = (plan: PlanV2, source: PlanV2Source): WrittenPlanV2 => ({
    plan: { ...plan, tasks: markFirstUp(plan.tasks) },
    source,
    fallbackReason: null,
    notice: null,
  });

  const firstIssues = validatePlanV2(first, ctx);
  if (firstIssues.length === 0) return ok(first, 'ai');

  let candidate: PlanV2 = first;
  try {
    const second = await call(
      buildPlanV2Messages({ ctx, title, menu, mode, angleSeed, repair: { plan: first, issues: issuesForModel(firstIssues) } }),
      model
    );
    if (validatePlanV2(second, ctx).length === 0) return ok(second, 'ai');
    candidate = second;
  } catch (error) {
    const reason = await failed(error);
    if (reason === 'wallet_empty') return fallback(reason);
    // Keep the first answer and let code try to save it.
  }

  const repaired = repairPlanV2(candidate, ctx, menu);
  if (validatePlanV2(repaired, ctx).length === 0) return ok(repaired, 'ai_repaired');
  return fallback('invalid');
}
