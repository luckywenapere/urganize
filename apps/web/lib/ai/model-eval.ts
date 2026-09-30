/**
 * The arithmetic behind the model evaluation (model-eval.integration.test.ts).
 *
 * PURE. Nothing here touches the network, the clock or the environment, so all
 * of it is tested offline. The live run sends the requests; this file decides
 * what a model's answer means, and what a run cost.
 *
 * Why an evaluation at all: the router's thresholds, latency figures and plan
 * ceilings are starting values (see model-router.ts), and two facts about the
 * provider can only be learned by asking it (does it accept these request
 * shapes on the GPT-5 models; how often does each rung pick the right tool).
 * This is how those get measured instead of guessed.
 */

// ── Cases ────────────────────────────────────────────────────────────────────

export type ToolExpectation = {
  /** Tool names that are a right first move. */
  tools: readonly string[];
  /**
   * Answering in words, with no tool call at all, is also right. With an empty
   * `tools` this is the whole expectation: the case is checking restraint.
   */
  allowNone?: boolean;
  /**
   * If the first call is this tool, its arguments must carry these keys. Only
   * the keys are checked, never the values: the point is that the model filled
   * in what the tool needs, not that it agreed with us about the wording.
   */
  requireArgs?: { tool: string; keys: readonly string[] };
};

export type ToolCase = {
  id: string;
  /** What the person says. */
  prompt: string;
  expect: ToolExpectation;
  /** What the case is probing, for the report. */
  note: string;
};

export type ObservedCall = { name: string; arguments: string };

export type VerdictReason =
  | 'ok'
  | 'wrong_tool'
  | 'unknown_tool'
  | 'no_tool'
  | 'unexpected_tool'
  | 'bad_arguments'
  | 'missing_args'
  | 'empty_answer'
  | 'request_failed';

export type CaseVerdict = { pass: boolean; reason: VerdictReason };

const PASS: CaseVerdict = { pass: true, reason: 'ok' };

/** The verdict for a request that never got an answer. Not the model's fault, so it is counted apart. */
export const REQUEST_FAILED: CaseVerdict = { pass: false, reason: 'request_failed' };

/**
 * Whether the FIRST thing a model did was right. Only the first move counts: a
 * turn is a loop, and what matters for routing is whether the model starts
 * down the right road, not whether it eventually recovers.
 *
 * A tool name the registry has never heard of is its own verdict, because it is
 * the failure that costs the most (a hallucinated tool is a wasted round trip
 * and a confused reply) and the one that most clearly separates a small model
 * from a large one.
 */
export function scoreToolChoice(
  expectation: ToolExpectation,
  calls: readonly ObservedCall[],
  knownTools: ReadonlySet<string>
): CaseVerdict {
  const first = calls[0];

  if (!first) {
    if (expectation.allowNone) return PASS;
    return { pass: false, reason: 'no_tool' };
  }

  if (!knownTools.has(first.name)) return { pass: false, reason: 'unknown_tool' };

  if (!expectation.tools.includes(first.name)) {
    return { pass: false, reason: expectation.tools.length === 0 ? 'unexpected_tool' : 'wrong_tool' };
  }

  const required = expectation.requireArgs;
  if (required && required.tool === first.name) {
    let parsed: unknown;
    try {
      parsed = first.arguments.trim() ? JSON.parse(first.arguments) : {};
    } catch {
      return { pass: false, reason: 'bad_arguments' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { pass: false, reason: 'bad_arguments' };
    }
    const args = parsed as Record<string, unknown>;
    const missing = required.keys.some((key) => args[key] === undefined || args[key] === null || args[key] === '');
    if (missing) return { pass: false, reason: 'missing_args' };
  }

  return PASS;
}

/**
 * A whole answer, judged. A turn with no tool call AND no words is a failure
 * whatever the case allowed: "no tool" is only a right answer when the model said
 * something. This is the shape a reasoning model gives when its hidden thinking
 * has used up the output cap, which is exactly what the router treats as a reason
 * to try a stronger rung, so the evaluation has to be able to see it.
 */
export function scoreAnswer(
  expectation: ToolExpectation,
  answer: { calls: readonly ObservedCall[]; text: string },
  knownTools: ReadonlySet<string>
): CaseVerdict {
  if (answer.calls.length === 0 && !answer.text.trim()) return { pass: false, reason: 'empty_answer' };
  return scoreToolChoice(expectation, answer.calls, knownTools);
}

// ── Latency ──────────────────────────────────────────────────────────────────

/** Nearest-rank percentile of a list, or null for an empty one. Order does not matter. */
export function percentile(values: readonly number[], p: number): number | null {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const rank = Math.ceil((p / 100) * clean.length);
  return clean[Math.min(clean.length - 1, Math.max(0, rank - 1))];
}

export type LatencySummary = {
  count: number;
  p50: number | null;
  p90: number | null;
  max: number | null;
  mean: number | null;
};

export function summarizeLatency(values: readonly number[]): LatencySummary {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return { count: 0, p50: null, p90: null, max: null, mean: null };
  return {
    count: clean.length,
    p50: percentile(clean, 50),
    p90: percentile(clean, 90),
    max: Math.max(...clean),
    mean: clean.reduce((sum, value) => sum + value, 0) / clean.length,
  };
}

// ── Usage and cost ───────────────────────────────────────────────────────────

/**
 * What a call reported using. Each field is null when the gateway did not say,
 * which is not the same as zero (the AiUsage rule, kept here). `cachedTokens` is
 * the part of the prompt served from the provider's cache, which is billed at a
 * fraction of the input price and is why a turn stays on one model.
 */
export type EvalUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
};

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Read usage out of a chat-completions response body, or null when it carries none. */
export function extractEvalUsage(payload: unknown): EvalUsage | null {
  if (!payload || typeof payload !== 'object') return null;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return null;
  const record = usage as Record<string, unknown>;

  const promptTokens = finiteNumber(record.prompt_tokens);
  const completionTokens = finiteNumber(record.completion_tokens);
  if (promptTokens === null && completionTokens === null) return null;

  const details = record.prompt_tokens_details;
  const cachedTokens =
    details && typeof details === 'object' ? finiteNumber((details as Record<string, unknown>).cached_tokens) : null;

  return { promptTokens, completionTokens, cachedTokens };
}

/**
 * RODI per US dollar. The provider prices in RODI; this is the rate its own
 * dollar-listed models imply (gpt-4o-mini, gpt-5.4, gpt-5.5 and Luna all land
 * within a rounding error of it). Approximate by nature: it is for comparing
 * rungs against each other, not for an invoice.
 */
export const RODI_PER_USD = 743;

export type ModelPrice = {
  /** RODI per one million tokens. */
  inputPer1M: number;
  outputPer1M: number;
  /** Null when the catalogue lists no cached price, in which case cached tokens cost the full input price. */
  cachedInputPer1M: number | null;
};

const priceNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/** A model's price from its catalogue entry (`rodiumai_pricing`), or null when it lists none we can use. */
export function priceFromCatalogue(entry: unknown): ModelPrice | null {
  if (!entry || typeof entry !== 'object') return null;
  const pricing = (entry as { rodiumai_pricing?: unknown }).rodiumai_pricing;
  if (!pricing || typeof pricing !== 'object') return null;
  const record = pricing as Record<string, unknown>;
  const inputPer1M = priceNumber(record.input_per_1m);
  const outputPer1M = priceNumber(record.output_per_1m);
  if (inputPer1M === null || outputPer1M === null) return null;
  return { inputPer1M, outputPer1M, cachedInputPer1M: priceNumber(record.cached_input_per_1m) };
}

/**
 * What one call cost, or null when it cannot be told: no usage, no price, or a
 * usage missing either half. A guess would read as a fact in the report.
 */
export function costOfCall(
  usage: EvalUsage | null,
  price: ModelPrice | null
): { rodi: number; usd: number } | null {
  if (!usage || !price) return null;
  if (usage.promptTokens === null || usage.completionTokens === null) return null;
  const cached = Math.min(Math.max(usage.cachedTokens ?? 0, 0), usage.promptTokens);
  const fresh = usage.promptTokens - cached;
  const rodi =
    (fresh * price.inputPer1M +
      cached * (price.cachedInputPer1M ?? price.inputPer1M) +
      usage.completionTokens * price.outputPer1M) /
    1_000_000;
  return { rodi, usd: rodi / RODI_PER_USD };
}

// ── Runs and summaries ───────────────────────────────────────────────────────

export type EvalRun = {
  caseId: string;
  model: string;
  verdict: CaseVerdict;
  /** Null when the request failed before an answer. */
  latencyMs: number | null;
  usage: EvalUsage | null;
  firstTool: string | null;
  error?: string;
};

export type ModelSummary = {
  model: string;
  runs: number;
  /** Runs that got an answer at all. A rate limit or an outage is not a wrong answer. */
  answered: number;
  passed: number;
  /** passed / answered, or null when nothing was answered. */
  accuracy: number | null;
  requestFailures: number;
  failures: Array<{ caseId: string; reason: VerdictReason; firstTool: string | null }>;
  latency: LatencySummary;
  tokensIn: number;
  tokensOut: number;
  /** Cached prompt tokens over prompt tokens, across the runs that reported both. Null if none did. */
  cachedShare: number | null;
  usdTotal: number | null;
  usdPerCall: number | null;
};

export function summarizeModel(model: string, runs: readonly EvalRun[], price: ModelPrice | null): ModelSummary {
  const mine = runs.filter((run) => run.model === model);
  const answeredRuns = mine.filter((run) => run.verdict.reason !== 'request_failed');
  const passed = answeredRuns.filter((run) => run.verdict.pass).length;

  let tokensIn = 0;
  let tokensOut = 0;
  let cachedSum = 0;
  let promptWithCache = 0;
  let usdTotal = 0;
  let costed = 0;
  for (const run of answeredRuns) {
    tokensIn += run.usage?.promptTokens ?? 0;
    tokensOut += run.usage?.completionTokens ?? 0;
    if (run.usage && run.usage.cachedTokens !== null && run.usage.promptTokens !== null) {
      cachedSum += run.usage.cachedTokens;
      promptWithCache += run.usage.promptTokens;
    }
    const cost = costOfCall(run.usage, price);
    if (cost) {
      usdTotal += cost.usd;
      costed += 1;
    }
  }

  return {
    model,
    runs: mine.length,
    answered: answeredRuns.length,
    passed,
    accuracy: answeredRuns.length > 0 ? passed / answeredRuns.length : null,
    requestFailures: mine.length - answeredRuns.length,
    failures: answeredRuns
      .filter((run) => !run.verdict.pass)
      .map((run) => ({ caseId: run.caseId, reason: run.verdict.reason, firstTool: run.firstTool })),
    latency: summarizeLatency(answeredRuns.map((run) => run.latencyMs).filter((ms): ms is number => ms !== null)),
    tokensIn,
    tokensOut,
    cachedShare: promptWithCache > 0 ? cachedSum / promptWithCache : null,
    usdTotal: costed > 0 ? usdTotal : null,
    usdPerCall: costed > 0 ? usdTotal / costed : null,
  };
}

// ── Reading a shape probe ────────────────────────────────────────────────────

export type ProbeOutcome = { accepted: boolean; status: number; message: string };

/**
 * What a request-shape probe came back with. `bodyText` is the raw response; the
 * gateway's own message is pulled out when it is JSON, and the start of the text
 * is kept when it is not. Capped, because this ends up in a report.
 */
export function describeProbe(status: number, bodyText: string): ProbeOutcome {
  if (status >= 200 && status < 300) return { accepted: true, status, message: '' };
  let message = bodyText.trim();
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: unknown } | string; message?: unknown };
    const nested = typeof parsed.error === 'object' ? parsed.error?.message : parsed.error;
    const found = typeof nested === 'string' ? nested : typeof parsed.message === 'string' ? parsed.message : '';
    if (found) message = found;
  } catch {
    // Not JSON. The text itself is the best there is.
  }
  return { accepted: false, status, message: message.replace(/\s+/g, ' ').slice(0, 200) };
}

// ── Reports ──────────────────────────────────────────────────────────────────

const dash = '-';
const pct = (value: number | null): string => (value === null ? dash : `${Math.round(value * 100)}%`);
const secs = (ms: number | null): string => (ms === null ? dash : (ms / 1000).toFixed(1));
const whole = (value: number): string => Math.round(value).toLocaleString('en-US');
const usd = (value: number | null, digits: number): string => (value === null ? dash : `$${value.toFixed(digits)}`);

const pad = (text: string, width: number): string => (text.length >= width ? text : text + ' '.repeat(width - text.length));
const padLeft = (text: string, width: number): string =>
  text.length >= width ? text : ' '.repeat(width - text.length) + text;

/** One line per model: accuracy, latency, tokens, cache share and cost. */
export function formatSummaryTable(summaries: readonly ModelSummary[]): string {
  const header = ['model', 'right', 'answered', 'p50 s', 'p90 s', 'tok in', 'tok out', 'cached', '$/call', '$ total'];
  const rows = summaries.map((summary) => [
    summary.model,
    pct(summary.accuracy),
    `${summary.answered}/${summary.runs}`,
    secs(summary.latency.p50),
    secs(summary.latency.p90),
    whole(summary.tokensIn),
    whole(summary.tokensOut),
    pct(summary.cachedShare),
    usd(summary.usdPerCall, 4),
    usd(summary.usdTotal, 3),
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const line = (cells: string[]) =>
    cells.map((cell, column) => (column === 0 ? pad(cell, widths[column]) : padLeft(cell, widths[column]))).join('  ');
  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join('\n');
}

export type MatrixCell = 'pass' | 'fail' | 'error' | 'skipped';

const CELL_MARK: Record<MatrixCell, string> = { pass: 'P', fail: 'x', error: '!', skipped: '.' };

/**
 * Case by model, one character a cell. Reading down a column shows where a
 * model starts to fail; reading across a row shows which rung is the cheapest
 * one that gets a case right, which is what the router's classifier has to
 * predict. `tier` is the rung the router's rules would start that case on.
 */
export function formatCaseMatrix(
  rows: ReadonlyArray<{ caseId: string; tier: string; cells: Readonly<Record<string, MatrixCell>> }>,
  models: readonly string[]
): string {
  const labels = models.map((model) => model.split('/').pop() ?? model);
  const idWidth = Math.max('case'.length, ...rows.map((row) => row.caseId.length));
  const tierWidth = Math.max('tier'.length, ...rows.map((row) => row.tier.length));
  const head = `${pad('case', idWidth)}  ${pad('tier', tierWidth)}  ${models.map((_model, i) => `${i + 1}`).join(' ')}`;
  const legend = labels.map((label, i) => `${i + 1}=${label}`).join('  ');
  const body = rows.map(
    (row) =>
      `${pad(row.caseId, idWidth)}  ${pad(row.tier, tierWidth)}  ${models
        .map((model) => CELL_MARK[row.cells[model] ?? 'skipped'])
        .join(' ')}`
  );
  return [legend, '(P right, x wrong, ! request failed, . not run)', head, ...body].join('\n');
}
