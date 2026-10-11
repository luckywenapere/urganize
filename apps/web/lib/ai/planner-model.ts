import { isRodiumGateway, REASONING_EFFORTS, type ReasoningEffort } from './provider';

/**
 * The one place the rollout planner's model is decided.
 *
 * The planner asks for a structured delta against a list of up to ~110
 * template tasks and has to honour instructions like "no marketing" against
 * that list, which is a reasoning task a small chat model gets wrong in ways
 * that look plausible. On RodiumAi the default is therefore the strong OpenAI
 * model rather than the gateway's cheap default, and it is a DEFAULT, not a
 * pin: `AI_PLANNER_MODEL` still overrides it, which is the env-only lever if
 * plans ever run past the route's ceiling (a smaller sibling of the same
 * family keeps structured outputs and reasoning effort).
 *
 * Anywhere else the answer is `undefined`, meaning "the gateway's own default":
 * the other two gateways serve different catalogues, and naming a model they
 * do not carry would turn every plan into a 4xx.
 */
// GPT-6.1 Sol since 2026-10-11 (founder call: plans on the Sol tier). It was
// gpt-5.4; 6.1 Sol is priced lower (1,507.1 / 7,535.4 RODI per 1M against
// 1,883.9 / 11,303.1) and takes structured outputs with reasoning effort.
export const RODIUM_PLANNER_MODEL = 'openai/gpt-6.1-sol';

export function resolvePlannerModel(): string | undefined {
  const override = String(process.env.AI_PLANNER_MODEL || '').trim();
  if (override) return override;
  return isRodiumGateway() ? RODIUM_PLANNER_MODEL : undefined;
}

const DEFAULT_PLANNER_REASONING_EFFORT: ReasoningEffort = 'low';

/**
 * How hard the planner's model thinks. `low` is the default on purpose: it is
 * enough to hold the delta contract and read the manager's notes, and it
 * keeps a plan comfortably inside the route's 60s ceiling. A value the models
 * would reject falls back to the default rather than failing every plan on a
 * typo in Vercel.
 */
export function resolvePlannerReasoningEffort(): ReasoningEffort {
  const raw = String(process.env.AI_PLANNER_REASONING_EFFORT || '').trim().toLowerCase();
  return (REASONING_EFFORTS as readonly string[]).includes(raw)
    ? (raw as ReasoningEffort)
    : DEFAULT_PLANNER_REASONING_EFFORT;
}
