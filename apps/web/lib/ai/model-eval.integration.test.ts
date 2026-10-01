/**
 * The live model evaluation: asks RodiumAi the questions the model router can
 * only guess at, with a real key, and prints what it learns.
 *
 * Two things, in order:
 *
 *   1. SHAPE PROBES. Does the gateway accept, on each ladder model, the exact
 *      request UrgAns's chat will send (the token cap, reasoning_effort and tools
 *      together) and the exact requests the single-shot features send (strict
 *      json_schema, plain text, each with reasoning_effort)? The bodies come from
 *      the code that builds them in production, not from copies. A rejection here
 *      is not a test to make pass; it is a fact about the provider that decides
 *      what the ladder can hold.
 *   2. TOOL CHOICE. Every case in model-eval-cases.ts, on every model, against
 *      UrgAns's real system prompt and all 91 real tool schemas. Reports how often
 *      each model's first move is right, how long it takes, what it costs and how
 *      much of the prompt the provider serves from cache. This is what the
 *      router's classifier thresholds, the rungs' latency figures and the plan
 *      ceilings get calibrated against.
 *
 * It costs real money, a few dollars for the default run, and it is opt-in. It
 * never runs in `pnpm test`.
 *
 *   ROUTER_EVAL=1                    turn it on
 *   ROUTER_EVAL_API_KEY=rd_sk_...    the key (falls back to CHAPPI_API_KEY, then AI_API_KEY)
 *
 * Optional:
 *   ROUTER_EVAL_MODELS=a,b           models to test (default: every model on the ladder)
 *   ROUTER_EVAL_CASES=id,id          only these cases
 *   ROUTER_EVAL_MAX_CASES=8          only the first N cases (a cheap first look)
 *   ROUTER_EVAL_RUNS=3               repeat each case (1 to 5; more smooths out luck)
 *   ROUTER_EVAL_PHASES=probes,cases  which parts to run (default both)
 *   ROUTER_EVAL_MAX_USD=8            stop spending past this (default 8)
 *   ROUTER_EVAL_SEQUENTIAL=1         one model at a time (default: the models run side by side)
 *   ROUTER_EVAL_OUT=path.json        also write the results as JSON
 *   ROUTER_EVAL_BASE_URL=...         default https://api.rodiumai.io/v1
 *
 * The key is read once, sent only as an Authorization header, and never printed:
 * everything that comes back from the network is scrubbed of it before it can
 * reach a message. Set it for one process, then remove it:
 *
 *   PowerShell, from apps/web:
 *     $k = Read-Host "RodiumAi key" -AsSecureString
 *     $env:ROUTER_EVAL_API_KEY = [System.Net.NetworkCredential]::new('', $k).Password
 *     $env:ROUTER_EVAL = '1'
 *     pnpm exec vitest run lib/ai/model-eval.integration.test.ts --disableConsoleIntercept
 *     Remove-Item Env:ROUTER_EVAL_API_KEY, Env:ROUTER_EVAL
 *
 * `--disableConsoleIntercept` is not optional: without it vitest swallows the
 * report this test prints and the run ends with a bare "passed". To keep a copy,
 * add `$env:ROUTER_EVAL_OUT = 'router-eval.json'`.
 *
 * A cheap first look, well under a dollar: `$env:ROUTER_EVAL_PHASES = 'probes'`
 * (the request shapes only, a few tiny calls per model), then
 * `$env:ROUTER_EVAL_PHASES = 'cases'; $env:ROUTER_EVAL_MAX_CASES = '8'`. The full
 * run is 28 cases on 7 models, each request about 14,600 tokens of prompt; the
 * provider caches the repeated part, and the spending cap stops it either way.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildChatCompletionBody, defaultTokenParam, type TokenParam } from '@/lib/chappi/runner';
import { CHAPPI_TOOLS, getChappiToolSchemas } from '@/lib/chappi/tools';

import {
  REQUEST_FAILED,
  RODI_PER_USD,
  costOfCall,
  describeProbe,
  extractEvalUsage,
  formatCaseMatrix,
  formatSummaryTable,
  priceFromCatalogue,
  scoreAnswer,
  summarizeModel,
  type EvalRun,
  type MatrixCell,
  type ModelPrice,
  type ObservedCall,
} from './model-eval';
import { EVAL_TODAY, TOOL_CASES, buildEvalSystemPrompt } from './model-eval-cases';
import { MODEL_TIERS, readLadder, type LadderRung } from './model-ladder';
import { classifyChatTurn } from './model-router';
import { buildOpenAiRequestBody, supportsReasoningEffort } from './provider';

const enabled = process.env.ROUTER_EVAL === '1';

const apiKey = (
  process.env.ROUTER_EVAL_API_KEY ||
  process.env.CHAPPI_API_KEY ||
  process.env.AI_API_KEY ||
  ''
).trim();
const baseUrl = (process.env.ROUTER_EVAL_BASE_URL || 'https://api.rodiumai.io/v1').trim().replace(/\/+$/, '');
const phases = new Set((process.env.ROUTER_EVAL_PHASES || 'probes,cases').split(',').map((p) => p.trim()));
const runsPerCase = Math.min(5, Math.max(1, Math.floor(Number(process.env.ROUTER_EVAL_RUNS) || 1)));
const budgetUsd = Number(process.env.ROUTER_EVAL_MAX_USD) > 0 ? Number(process.env.ROUTER_EVAL_MAX_USD) : 8;
const outPath = (process.env.ROUTER_EVAL_OUT || '').trim();

const ladder = readLadder();
const listFromEnv = (name: string): string[] =>
  (process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const models: string[] = (() => {
  const chosen = listFromEnv('ROUTER_EVAL_MODELS');
  if (chosen.length > 0) return [...new Set(chosen)];
  return [...new Set(MODEL_TIERS.flatMap((tier) => ladder[tier].models))];
})();

const cases = (() => {
  const wanted = listFromEnv('ROUTER_EVAL_CASES');
  let selected = wanted.length > 0 ? TOOL_CASES.filter((testCase) => wanted.includes(testCase.id)) : [...TOOL_CASES];
  const limit = Math.floor(Number(process.env.ROUTER_EVAL_MAX_CASES) || 0);
  if (limit > 0) selected = selected.slice(0, limit);
  return selected;
})();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Everything that comes from the network goes through this before it can reach a message. */
const redact = (text: string): string => (apiKey ? text.split(apiKey).join('[key]') : text);

// ── What the router would send each model ────────────────────────────────────

function rungFor(model: string): LadderRung {
  for (const tier of MODEL_TIERS) {
    if (ladder[tier].models.includes(model)) return ladder[tier];
  }
  // A model named on the command line that is not on the ladder is judged as the middle rung would treat it.
  return ladder.standard;
}

function chatShape(model: string): { tokenParam: TokenParam; maxOutputTokens: number; effort: LadderRung['reasoningEffort'] } {
  const rung = rungFor(model);
  return {
    tokenParam: defaultTokenParam(model),
    maxOutputTokens: rung.maxOutputTokens,
    effort: supportsReasoningEffort(model) ? rung.reasoningEffort : null,
  };
}

// ── The network ──────────────────────────────────────────────────────────────

type Http = { status: number; text: string; latencyMs: number };

const DEFAULT_GAP_MS = 1_200;
const gapMs = new Map<string, number>();
const lastRequestAt = new Map<string, number>();
const prices = new Map<string, ModelPrice>();

/** Space requests to one model so a low provider limit (10 a minute on Terra and Sol) is respected, not run into. */
async function pace(model: string): Promise<void> {
  const wait = (lastRequestAt.get(model) ?? 0) + (gapMs.get(model) ?? DEFAULT_GAP_MS) - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(model, Date.now());
}

async function post(model: string, body: unknown, timeoutMs = 120_000): Promise<Http> {
  let last: Http = { status: 0, text: 'no attempt made', latencyMs: 0 };
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await pace(model);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text().catch(() => '');
      last = { status: response.status, text: redact(text), latencyMs: Date.now() - startedAt };
      if (response.status === 429 && attempt < 4) {
        const header = Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(header) && header > 0 ? Math.min(header * 1000, 60_000) : 20_000);
        continue;
      }
      if (response.status >= 500 && attempt < 2) {
        await sleep(3_000);
        continue;
      }
      return last;
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : 'request failed';
      last = { status: 0, text: redact(message), latencyMs: Date.now() - startedAt };
      if (attempt < 2) {
        await sleep(3_000);
        continue;
      }
      return last;
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

// ── Shape probes ─────────────────────────────────────────────────────────────

const PROBE_TOOLS = [
  {
    type: 'function',
    function: { name: 'get_time', description: 'Get the current time.', parameters: { type: 'object', properties: {} } },
  },
] as unknown as ReturnType<typeof getChappiToolSchemas>;

const PROBE_SCHEMA = {
  name: 'probe',
  schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
};

type Probe = { name: string; mustPass: boolean; body: Record<string, unknown> };

function probesFor(model: string): Probe[] {
  const { tokenParam, maxOutputTokens, effort } = chatShape(model);
  const say = [{ role: 'user' as const, content: 'Reply with the single word: ok' }];
  const json = [{ role: 'user' as const, content: 'Reply with a JSON object: {"ok": true}' }];
  const otherParam: TokenParam = tokenParam === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
  // Alternatives to try where the effort the rung asks for is rejected with tools
  // (the 5.6 models say: use 'none'). Informational: they decide what chat sends.
  const alternatives: Probe[] =
    effort === null
      ? []
      : [
          {
            name: "chat: tools with reasoning_effort 'none'",
            mustPass: false,
            body: buildChatCompletionBody({ model, messages: say, tools: PROBE_TOOLS, maxOutputTokens, tokenParam, reasoningEffort: 'none' }),
          },
          {
            name: 'chat: tools with no reasoning_effort',
            mustPass: false,
            body: buildChatCompletionBody({ model, messages: say, tools: PROBE_TOOLS, maxOutputTokens, tokenParam, reasoningEffort: null }),
          },
          {
            name: 'chat: tools, effort none, small cap (256)',
            mustPass: false,
            body: buildChatCompletionBody({ model, messages: say, tools: PROBE_TOOLS, maxOutputTokens: 256, tokenParam, reasoningEffort: 'none' }),
          },
        ];
  return [
    {
      name: 'chat: what UrgAns sends',
      mustPass: true,
      body: buildChatCompletionBody({ model, messages: say, tools: PROBE_TOOLS, maxOutputTokens, tokenParam, reasoningEffort: effort }),
    },
    ...alternatives,
    {
      name: 'chat: the other token cap',
      mustPass: false,
      body: buildChatCompletionBody({ model, messages: say, tools: PROBE_TOOLS, maxOutputTokens, tokenParam: otherParam, reasoningEffort: effort }),
    },
    {
      name: 'single-shot: strict json_schema',
      mustPass: true,
      body: buildOpenAiRequestBody({ model, messages: json, format: 'json', jsonSchema: PROBE_SCHEMA, reasoningEffort: effort ?? undefined }),
    },
    {
      name: 'single-shot: plain text',
      mustPass: true,
      body: buildOpenAiRequestBody({ model, messages: say, format: 'text', reasoningEffort: effort ?? undefined }),
    },
  ];
}

// ── The run ──────────────────────────────────────────────────────────────────

type ProbeResult = { model: string; probe: string; mustPass: boolean; accepted: boolean; status: number; message: string };
const probeResults: ProbeResult[] = [];
const evalRuns: EvalRun[] = [];
const skippedForBudget: string[] = [];
let spentUsd = 0;

/** What a call cost, for the spending cap. With no price known it assumes a dear model, so the cap still bites. */
function estimateUsd(model: string, usage: EvalRun['usage']): number {
  const cost = costOfCall(usage, prices.get(model) ?? null);
  if (cost) return cost.usd;
  if (!usage) return 0;
  return ((usage.promptTokens ?? 0) * 5 + (usage.completionTokens ?? 0) * 20) / 1_000_000;
}

function readAnswer(text: string): { calls: ObservedCall[]; content: string; payload: unknown } | null {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  const choice = (payload as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
  })?.choices?.[0];
  if (!choice) return null;
  const calls = (choice.message?.tool_calls ?? [])
    .map((entry) => ({ name: String(entry.function?.name ?? ''), arguments: String(entry.function?.arguments ?? '') }))
    .filter((entry) => entry.name);
  return { calls, content: String(choice.message?.content ?? ''), payload };
}

describe.skipIf(!enabled)('the live model evaluation', () => {
  beforeAll(async () => {
    if (!apiKey) {
      throw new Error(
        'ROUTER_EVAL=1 needs a RodiumAi key. Set ROUTER_EVAL_API_KEY (or CHAPPI_API_KEY / AI_API_KEY) for this process.'
      );
    }

    // The catalogue is public: it gives each model's price and its request limit.
    try {
      const response = await fetch(`${baseUrl}/models`, { headers: { Accept: 'application/json' } });
      const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
      for (const entry of payload.data ?? []) {
        const id = String(entry.id ?? '');
        if (!models.includes(id)) continue;
        const price = priceFromCatalogue(entry);
        if (price) prices.set(id, price);
        const rpm = Number((entry.rodiumai_rate_limits as { rpm?: unknown } | undefined)?.rpm);
        if (Number.isFinite(rpm) && rpm > 0) gapMs.set(id, Math.ceil(60_000 / rpm) + 300);
      }
    } catch {
      console.warn('[model-eval] could not read the public catalogue; prices and request limits fall back to defaults.');
    }

    const promptTokens = Math.round((buildEvalSystemPrompt().length + JSON.stringify(getChappiToolSchemas()).length) / 4);
    console.info(
      [
        '',
        `[model-eval] ${models.length} model(s): ${models.join(', ')}`,
        `[model-eval] phases: ${[...phases].join(', ')}; ${cases.length} case(s) x ${runsPerCase} run(s)`,
        `[model-eval] about ${promptTokens.toLocaleString('en-US')} prompt tokens a request; spending stops at $${budgetUsd}`,
        `[model-eval] today in the fixture: ${EVAL_TODAY}`,
        '',
      ].join('\n')
    );
  }, 60_000);

  it.skipIf(!phases.has('probes'))(
    'the request shapes the router will send are accepted',
    async () => {
      await Promise.all(
        models.map(async (model) => {
          for (const probe of probesFor(model)) {
            const http = await post(model, probe.body, 60_000);
            const outcome = describeProbe(http.status, http.text);
            probeResults.push({
              model,
              probe: probe.name,
              mustPass: probe.mustPass,
              accepted: outcome.accepted,
              status: outcome.status,
              message: outcome.message,
            });
          }
        })
      );
      // Concurrent models finish in any order; the report reads better grouped.
      probeResults.sort((a, b) => models.indexOf(a.model) - models.indexOf(b.model));

      const width = Math.max(...probeResults.map((row) => row.model.length));
      const lines = probeResults.map(
        (row) =>
          `${row.model.padEnd(width)}  ${row.accepted ? 'accepted' : `REJECTED ${row.status}`.padEnd(12)}  ${row.probe}` +
          (row.accepted ? '' : `  -> ${row.message}`)
      );
      console.info(`\n[model-eval] request shapes\n${lines.join('\n')}\n`);

      const mustFix = probeResults.filter((row) => row.mustPass && !row.accepted);
      expect(
        mustFix.map((row) => `${row.model}: ${row.probe} (${row.status}) ${row.message}`),
        'a shape the router sends was rejected: fix the ladder or the shape before switching the router on'
      ).toEqual([]);
    },
    20 * 60_000
  );

  it.skipIf(!phases.has('cases'))(
    'every model is asked every case',
    async () => {
      const system = buildEvalSystemPrompt();
      const tools = getChappiToolSchemas();
      const known = new Set(CHAPPI_TOOLS.map((tool) => tool.name as string));

      // One model's whole run, in order. Each model has its own request limit and
      // its own pacing, so the models are independent of each other and run side by
      // side; the cases within one model go one at a time so its limit is respected.
      const runModel = async (model: string): Promise<void> => {
        const { tokenParam, maxOutputTokens, effort } = chatShape(model);
        for (const testCase of cases) {
          for (let run = 1; run <= runsPerCase; run += 1) {
            if (spentUsd >= budgetUsd) {
              skippedForBudget.push(`${model}: ${testCase.id}`);
              continue;
            }

            const http = await post(
              model,
              buildChatCompletionBody({
                model,
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: testCase.prompt },
                ],
                tools,
                maxOutputTokens,
                tokenParam,
                reasoningEffort: effort,
              })
            );

            const answer = http.status === 200 ? readAnswer(http.text) : null;
            if (!answer) {
              evalRuns.push({
                caseId: testCase.id,
                model,
                verdict: REQUEST_FAILED,
                latencyMs: null,
                usage: null,
                firstTool: null,
                error: http.status === 200 ? 'unreadable response' : describeProbe(http.status, http.text).message,
              });
              continue;
            }

            const usage = extractEvalUsage(answer.payload);
            spentUsd += estimateUsd(model, usage);
            evalRuns.push({
              caseId: testCase.id,
              model,
              verdict: scoreAnswer(testCase.expect, { calls: answer.calls, text: answer.content }, known),
              latencyMs: http.latencyMs,
              usage,
              firstTool: answer.calls[0]?.name ?? null,
            });
          }
        }
      };

      if (process.env.ROUTER_EVAL_SEQUENTIAL === '1') {
        for (const model of models) await runModel(model);
      } else {
        await Promise.all(models.map(runModel));
      }

      const summaries = models.map((model) => summarizeModel(model, evalRuns, prices.get(model) ?? null));
      const tierOf = new Map(
        cases.map((testCase) => [testCase.id, classifyChatTurn({ lastUserText: testCase.prompt, userTurns: 1 }).tier])
      );
      const cell = (model: string, caseId: string): MatrixCell => {
        const mine = evalRuns.filter((entry) => entry.model === model && entry.caseId === caseId);
        if (mine.length === 0) return 'skipped';
        if (mine.every((entry) => entry.verdict.reason === 'request_failed')) return 'error';
        return mine.every((entry) => entry.verdict.pass || entry.verdict.reason === 'request_failed') ? 'pass' : 'fail';
      };
      const matrix = formatCaseMatrix(
        cases.map((testCase) => ({
          caseId: testCase.id,
          tier: tierOf.get(testCase.id) ?? 'quick',
          cells: Object.fromEntries(models.map((model) => [model, cell(model, testCase.id)])),
        })),
        models
      );
      const failures = summaries.flatMap((summary) =>
        summary.failures.map(
          (failure) => `${summary.model}: ${failure.caseId} -> ${failure.reason}${failure.firstTool ? ` (called ${failure.firstTool})` : ''}`
        )
      );
      const errors = evalRuns
        .filter((entry) => entry.verdict.reason === 'request_failed')
        .map((entry) => `${entry.model}: ${entry.caseId} -> ${entry.error ?? 'request failed'}`);

      console.info(
        [
          '',
          '[model-eval] results',
          formatSummaryTable(summaries),
          '',
          '[model-eval] case by model (tier = the rung the router\'s rules would start that case on)',
          matrix,
          '',
          failures.length > 0 ? `[model-eval] wrong first moves\n${failures.join('\n')}` : '[model-eval] no wrong first moves',
          errors.length > 0 ? `\n[model-eval] requests that failed\n${errors.slice(0, 40).join('\n')}` : '',
          skippedForBudget.length > 0
            ? `\n[model-eval] STOPPED at the $${budgetUsd} cap; ${skippedForBudget.length} run(s) not made`
            : '',
          `\n[model-eval] spent about $${spentUsd.toFixed(2)} (at ${RODI_PER_USD} RODI to the dollar)`,
          '',
        ].join('\n')
      );

      if (outPath) {
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(
          outPath,
          JSON.stringify(
            { finishedAt: new Date().toISOString(), models, ladder, probes: probeResults, summaries, runs: evalRuns, spentUsd },
            null,
            2
          )
        );
        console.info(`[model-eval] wrote ${outPath}`);
      }

      // Measurement, not a gate: accuracy is reported, never asserted. The one thing
      // that would make the numbers meaningless is nothing having answered at all.
      expect(evalRuns.some((entry) => entry.verdict.reason !== 'request_failed'), 'no model answered a single case').toBe(true);
    },
    120 * 60_000
  );
});
