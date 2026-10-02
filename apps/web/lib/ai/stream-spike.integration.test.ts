/**
 * The streaming spike: asks RodiumAi the questions the decision to stream UrgAns
 * replies turns on, with a real key, and prints what it learns. It is opt-in,
 * costs a few RODI, and never runs in `pnpm test`.
 *
 * Three phases (ROUTER_SPIKE_PHASES, default "shape,tools"):
 *
 *   shape  Does the gateway stream, on each ladder model, the exact request
 *          UrgAns's chat sends (token cap, reasoning_effort and tools together)?
 *          Does the stream end with a usage chunk (needed to charge credits)?
 *          How soon does the first word arrive, and how fast do words come?
 *   tools  Do tool calls arrive in the OpenAI delta shape, and do their pieces
 *          put back together into valid JSON arguments?
 *   abort  If we drop the connection early, is the request billed for what was
 *          written, or for the whole output cap? Off by default: it needs you to
 *          read your RodiumAi balance before and after (see below), and can cost
 *          up to a full cap on one dear model.
 *
 *   ROUTER_SPIKE=1                   turn it on
 *   ROUTER_EVAL_API_KEY=rd_sk_...    the key (falls back to CHAPPI_API_KEY, then AI_API_KEY)
 *
 * Optional:
 *   ROUTER_SPIKE_MODELS=a,b          models to test (default: every model on the ladder)
 *   ROUTER_SPIKE_PHASES=shape,tools,abort
 *   ROUTER_SPIKE_ABORT_MODEL=openai/gpt-5.4   the model for the abort test
 *   ROUTER_SPIKE_ABORT_CAP=4000      the output cap that request is given
 *   ROUTER_SPIKE_OUT=path.json       also write the results as JSON
 *   ROUTER_EVAL_BASE_URL=...         default https://api.rodiumai.io/v1
 *
 * The key is read once, sent only as an Authorization header, and scrubbed from
 * everything that comes back. Set it for one process, then remove it:
 *
 *   PowerShell, from apps/web:
 *     $k = Read-Host "RodiumAi key" -AsSecureString
 *     $env:ROUTER_EVAL_API_KEY = [System.Net.NetworkCredential]::new('', $k).Password
 *     $env:ROUTER_SPIKE = '1'
 *     pnpm exec vitest run lib/ai/stream-spike.integration.test.ts --disableConsoleIntercept
 *     Remove-Item Env:ROUTER_EVAL_API_KEY, Env:ROUTER_SPIKE
 *
 * `--disableConsoleIntercept` is not optional: without it vitest swallows the
 * report and the run ends with a bare "passed".
 *
 * THE ABORT TEST. The one thing this cannot read for itself is your balance, so
 * it asks you to. Open the RodiumAi dashboard, note the RODI balance, run with
 * ROUTER_SPIKE_PHASES=abort, wait about a minute, and read the balance again.
 * The report prints the two figures to compare against: what the request costs
 * if the provider bills only what was written, and what it costs if it bills the
 * whole cap. They are far apart on purpose. It also tries a few likely balance
 * endpoints with the key; if one answers, the before and after are printed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildChatCompletionBody, defaultTokenParam, type TokenParam } from '@/lib/chappi/runner';
import type { getChappiToolSchemas } from '@/lib/chappi/tools';

import { MODEL_TIERS, readLadder, type LadderRung } from './model-ladder';
import { priceFromCatalogue, type ModelPrice } from './model-eval';
import { supportsReasoningEffort } from './provider';
import {
  SseReader,
  StreamAccumulator,
  approxTokens,
  expectedAbortCosts,
  interestingHeaders,
  type StreamSummary,
} from './stream-spike';

const enabled = process.env.ROUTER_SPIKE === '1';

const apiKey = (
  process.env.ROUTER_EVAL_API_KEY ||
  process.env.CHAPPI_API_KEY ||
  process.env.AI_API_KEY ||
  ''
).trim();
const baseUrl = (process.env.ROUTER_EVAL_BASE_URL || 'https://api.rodiumai.io/v1').trim().replace(/\/+$/, '');
const phases = new Set((process.env.ROUTER_SPIKE_PHASES || 'shape,tools').split(',').map((p) => p.trim()));
const outPath = (process.env.ROUTER_SPIKE_OUT || '').trim();
const abortModel = (process.env.ROUTER_SPIKE_ABORT_MODEL || 'openai/gpt-5.4').trim();
const abortCap = Math.max(500, Math.floor(Number(process.env.ROUTER_SPIKE_ABORT_CAP) || 4000));

const ladder = readLadder();
const models: string[] = (() => {
  const chosen = (process.env.ROUTER_SPIKE_MODELS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (chosen.length > 0) return [...new Set(chosen)];
  return [...new Set(MODEL_TIERS.flatMap((tier) => ladder[tier].models))];
})();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const redact = (text: string): string => (apiKey ? text.split(apiKey).join('[key]') : text);

// ── What UrgAns would send each model ────────────────────────────────────────

function rungFor(model: string): LadderRung {
  for (const tier of MODEL_TIERS) if (ladder[tier].models.includes(model)) return ladder[tier];
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

type Tools = ReturnType<typeof getChappiToolSchemas>;

const WEATHER_TOOL = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a city.',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' }, units: { type: 'string', enum: ['c', 'f'] } },
        required: ['city'],
      },
    },
  },
] as unknown as Tools;

/** The same body the chat runner builds, switched to streaming. */
function streamingBody(
  base: Record<string, unknown>,
  options: { includeUsage: boolean }
): Record<string, unknown> {
  return {
    ...base,
    stream: true,
    ...(options.includeUsage ? { stream_options: { include_usage: true } } : {}),
  };
}

// ── The network ──────────────────────────────────────────────────────────────

const DEFAULT_GAP_MS = 1_500;
const gapMs = new Map<string, number>();
const lastRequestAt = new Map<string, number>();
const prices = new Map<string, ModelPrice>();

async function pace(model: string): Promise<void> {
  const wait = (lastRequestAt.get(model) ?? 0) + (gapMs.get(model) ?? DEFAULT_GAP_MS) - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(model, Date.now());
}

type StreamRun = {
  status: number;
  accepted: boolean;
  /** The gateway's own words when it refused, or the network error. */
  message: string;
  headers: Record<string, string>;
  contentType: string;
  /** Milliseconds from sending to the response headers. */
  headersMs: number;
  /** Milliseconds from sending to the first visible word; null when none came. */
  firstContentMs: number | null;
  totalMs: number;
  aborted: boolean;
  summary: StreamSummary | null;
  /** The first two data lines, for reading by eye. */
  sample: string[];
};

async function streamChat(
  model: string,
  body: Record<string, unknown>,
  options: { abortWhen?: (acc: StreamAccumulator, sinceFirstContentMs: number) => boolean; timeoutMs?: number } = {}
): Promise<StreamRun> {
  await pace(model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);
  const startedAt = Date.now();
  const blank: StreamRun = {
    status: 0,
    accepted: false,
    message: '',
    headers: {},
    contentType: '',
    headersMs: 0,
    firstContentMs: null,
    totalMs: 0,
    aborted: false,
    summary: null,
    sample: [],
  };

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const headersMs = Date.now() - startedAt;
    const contentType = response.headers.get('content-type') ?? '';
    const headers = interestingHeaders(response.headers);

    if (!response.ok || !response.body) {
      const text = redact(await response.text().catch(() => ''));
      return { ...blank, status: response.status, message: text.slice(0, 400), headers, contentType, headersMs, totalMs: Date.now() - startedAt };
    }

    const reader = new SseReader();
    const accumulator = new StreamAccumulator();
    const decoder = new TextDecoder();
    const sample: string[] = [];
    let firstContentAt: number | null = null;
    let aborted = false;

    const take = (payloads: string[]) => {
      for (const data of payloads) {
        if (sample.length < 2) sample.push(redact(data).slice(0, 240));
        accumulator.push(data);
        if (firstContentAt === null && accumulator.hasContent) firstContentAt = Date.now();
      }
    };

    const stream = response.body.getReader();
    try {
      for (;;) {
        const { value, done } = await stream.read();
        if (done) break;
        take(reader.feed(decoder.decode(value, { stream: true })));
        if (options.abortWhen && firstContentAt !== null && options.abortWhen(accumulator, Date.now() - firstContentAt)) {
          aborted = true;
          controller.abort();
          break;
        }
      }
      if (!aborted) take(reader.flush());
    } catch (error) {
      if (!aborted) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : 'read failed';
        return {
          ...blank,
          status: response.status,
          accepted: true,
          message: `stream broke: ${redact(message)}`,
          headers,
          contentType,
          headersMs,
          firstContentMs: firstContentAt === null ? null : firstContentAt - startedAt,
          totalMs: Date.now() - startedAt,
          summary: accumulator.summary(),
          sample,
        };
      }
    }

    return {
      status: response.status,
      accepted: true,
      message: '',
      headers,
      contentType,
      headersMs,
      firstContentMs: firstContentAt === null ? null : firstContentAt - startedAt,
      totalMs: Date.now() - startedAt,
      aborted,
      summary: accumulator.summary(),
      sample,
    };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'request failed';
    return { ...blank, message: redact(message), totalMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort balance read. The dashboard's own endpoints answer to a login, not to an API key, so this often finds nothing. */
async function tryReadBalance(): Promise<string> {
  const origin = baseUrl.replace(/\/v1$/, '');
  const candidates = [`${baseUrl}/wallet`, `${baseUrl}/balance`, `${origin}/api/v1/wallet`, `${origin}/api/v1/balance`];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } });
      if (!response.ok) continue;
      const text = redact(await response.text().catch(() => ''));
      if (text.trim().startsWith('{')) return `${url} -> ${text.slice(0, 300)}`;
    } catch {
      // try the next one
    }
  }
  return '';
}

// ── Results ──────────────────────────────────────────────────────────────────

type Row = { phase: string; model: string; check: string; ok: boolean; facts: string };
const rows: Row[] = [];
const notes: string[] = [];
const raw: Array<{ phase: string; model: string; check: string; run: StreamRun }> = [];

const secs = (ms: number | null) => (ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)}s`);

function record(phase: string, model: string, check: string, run: StreamRun, ok: boolean, extra = ''): void {
  const s = run.summary;
  const facts = [
    run.accepted ? `HTTP ${run.status} ${run.contentType.split(';')[0]}` : `REFUSED HTTP ${run.status}: ${run.message.slice(0, 160)}`,
    run.accepted ? `first word ${secs(run.firstContentMs)}, total ${secs(run.totalMs)}` : '',
    s ? `${s.chunks} chunks, finish=${s.finishReason ?? 'none'}, [DONE]=${s.done ? 'yes' : 'NO'}` : '',
    s ? `usage=${s.usage ? `${s.usage.promptTokens}in/${s.usage.completionTokens}out` : 'NONE'}${s.cachedTokens !== null ? `, cached ${s.cachedTokens}` : ''}` : '',
    s && s.malformedLines > 0 ? `${s.malformedLines} MALFORMED line(s)` : '',
    s?.streamError ? `STREAM ERROR: ${s.streamError}` : '',
    extra,
  ]
    .filter(Boolean)
    .join('; ');
  rows.push({ phase, model, check, ok, facts });
  raw.push({ phase, model, check, run });
}

// ── The run ──────────────────────────────────────────────────────────────────

describe.skipIf(!enabled)('the streaming spike', () => {
  beforeAll(async () => {
    if (!apiKey) {
      throw new Error('ROUTER_SPIKE=1 needs a RodiumAi key. Set ROUTER_EVAL_API_KEY (or CHAPPI_API_KEY / AI_API_KEY) for this process.');
    }
    try {
      const response = await fetch(`${baseUrl}/models`, { headers: { Accept: 'application/json' } });
      const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
      for (const entry of payload.data ?? []) {
        const id = String(entry.id ?? '');
        if (!models.includes(id) && id !== abortModel) continue;
        const price = priceFromCatalogue(entry);
        if (price) prices.set(id, price);
        const rpm = Number((entry.rodiumai_rate_limits as { rpm?: unknown } | undefined)?.rpm);
        if (Number.isFinite(rpm) && rpm > 0) gapMs.set(id, Math.ceil(60_000 / rpm) + 300);
      }
    } catch {
      console.warn('[stream-spike] could not read the public catalogue; request spacing falls back to a default.');
    }
  }, 60_000);

  it('collects the facts', { timeout: 20 * 60_000 }, async () => {
    // ── shape: the request UrgAns sends, streamed ─────────────────────────────
    if (phases.has('shape')) {
      for (const model of models) {
        const { tokenParam, maxOutputTokens, effort } = chatShape(model);
        const messages = [
          { role: 'system' as const, content: 'You are a concise assistant.' },
          { role: 'user' as const, content: 'In about 120 words, explain why a release plan should list who does what and by when.' },
        ];
        const base = buildChatCompletionBody({ model, messages, tools: WEATHER_TOOL, maxOutputTokens, tokenParam, reasoningEffort: effort });

        const withUsage = await streamChat(model, streamingBody(base, { includeUsage: true }));
        const s = withUsage.summary;
        const tokensPerSecond =
          s?.usage?.completionTokens && withUsage.firstContentMs !== null && withUsage.totalMs > withUsage.firstContentMs
            ? Math.round((s.usage.completionTokens / (withUsage.totalMs - withUsage.firstContentMs)) * 1000)
            : null;
        record(
          'shape',
          model,
          'stream + tools + effort + include_usage',
          withUsage,
          withUsage.accepted && Boolean(s?.content) && s?.done === true,
          tokensPerSecond ? `~${tokensPerSecond} tokens/s` : ''
        );

        // Same request without asking for usage: tells us whether stream_options is what a refusal is about.
        if (!withUsage.accepted || !s?.usage) {
          const without = await streamChat(model, streamingBody(base, { includeUsage: false }));
          record('shape', model, 'stream + tools + effort, NO stream_options', without, without.accepted && Boolean(without.summary?.content));
        }
      }
    }

    // ── tools: do the pieces put back together? ───────────────────────────────
    if (phases.has('tools')) {
      for (const model of models) {
        const { tokenParam, maxOutputTokens, effort } = chatShape(model);
        const messages = [
          { role: 'system' as const, content: 'Use the tools you are given. Do not answer from memory.' },
          { role: 'user' as const, content: 'What is the weather in Lagos right now, in celsius?' },
        ];
        const base = buildChatCompletionBody({ model, messages, tools: WEATHER_TOOL, maxOutputTokens, tokenParam, reasoningEffort: effort });
        const run = await streamChat(model, streamingBody(base, { includeUsage: true }));
        const call = run.summary?.toolCalls[0];
        let argsOk = false;
        if (call?.argumentsParse) {
          try {
            argsOk = typeof (JSON.parse(call.arguments) as { city?: unknown }).city === 'string';
          } catch {
            argsOk = false;
          }
        }
        record(
          'tools',
          model,
          'a streamed tool call',
          run,
          run.accepted && call?.name === 'get_weather' && argsOk && Boolean(call.id),
          call ? `tool=${call.name} id=${call.id ?? 'MISSING'} args=${call.arguments.slice(0, 60)} parse=${call.argumentsParse ? 'ok' : 'BROKEN'}` : 'NO tool call came back'
        );
      }
    }

    // ── abort: what does dropping the connection cost? ────────────────────────
    if (phases.has('abort')) {
      const price = prices.get(abortModel);
      const tokenParam = defaultTokenParam(abortModel);
      const effort = supportsReasoningEffort(abortModel) ? rungFor(abortModel).reasoningEffort : null;
      const messages = [
        { role: 'user' as const, content: 'Write a long, detailed essay of at least 3000 words on how to run a music release. Number every section.' },
      ];
      const base = buildChatCompletionBody({ model: abortModel, messages, maxOutputTokens: abortCap, tokenParam, reasoningEffort: effort });

      const before = await tryReadBalance();
      console.info(`\n[abort] about to start. Note your RODI balance now.${before ? `\n[abort] balance read before: ${before}` : '\n[abort] no balance endpoint answered; read it from the dashboard.'}`);
      await sleep(2_000);

      const run = await streamChat(abortModel, streamingBody(base, { includeUsage: true }), {
        abortWhen: (acc, sinceFirstMs) => acc.contentLength >= 700 || sinceFirstMs >= 3_000,
      });
      const writtenTokens = approxTokens(run.summary?.content.length ?? 0);
      record('abort', abortModel, `stream cut early (cap ${abortCap})`, run, run.aborted, `aborted after ~${writtenTokens} tokens written`);

      if (price) {
        const costs = expectedAbortCosts({
          promptTokens: 40,
          cap: abortCap,
          writtenTokens,
          rodiPerMillionIn: price.inputPer1M,
          rodiPerMillionOut: price.outputPer1M,
        });
        notes.push(
          `abort: if only what was written is billed, the request cost ~${costs.writtenRodi} RODI; if the whole cap is billed, ~${costs.fullCapRodi} RODI. Compare with your balance change (allow a minute for it to settle).`
        );
      } else {
        notes.push(`abort: no catalogue price for ${abortModel}; compare the balance change with ${abortCap} output tokens at that model's price.`);
      }

      await sleep(45_000);
      const after = await tryReadBalance();
      notes.push(after ? `abort: balance read after: ${after}` : 'abort: read the balance on the dashboard now and subtract.');
      if (before) notes.push(`abort: balance read before: ${before}`);
    }

    // ── report ────────────────────────────────────────────────────────────────
    const byPhase = (phase: string) => rows.filter((r) => r.phase === phase);
    const lines: string[] = ['', '== streaming spike ==', `gateway: ${baseUrl}`, `models: ${models.join(', ')}`, ''];
    for (const phase of ['shape', 'tools', 'abort']) {
      const section = byPhase(phase);
      if (section.length === 0) continue;
      lines.push(`-- ${phase}`);
      for (const r of section) lines.push(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.model} | ${r.check} | ${r.facts}`);
      lines.push('');
    }

    const shape = byPhase('shape').filter((r) => r.check.startsWith('stream + tools + effort + include_usage'));
    const accepted = shape.filter((r) => r.ok).map((r) => r.model);
    const refused = shape.filter((r) => !r.ok).map((r) => r.model);
    const usageMissing = raw
      .filter((r) => r.phase === 'shape' && r.check.includes('include_usage') && r.run.accepted && !r.run.summary?.usage)
      .map((r) => r.model);
    const headersSeen = raw.find((r) => Object.keys(r.run.headers).length > 0)?.run.headers;

    lines.push('== what this means ==');
    if (shape.length > 0) {
      lines.push(`Streams the chat request: ${accepted.length > 0 ? accepted.join(', ') : 'none'}`);
      if (refused.length > 0) lines.push(`Refused or broken: ${refused.join(', ')}  <- streaming cannot use these as they are`);
      lines.push(
        usageMissing.length === 0
          ? 'Usage arrives in the stream on every model that streamed: credits can be charged from real tokens.'
          : `NO usage in the stream for: ${usageMissing.join(', ')}  <- credits would be charged from an estimate there`
      );
    }
    const toolRows = byPhase('tools');
    if (toolRows.length > 0) {
      const bad = toolRows.filter((r) => !r.ok).map((r) => r.model);
      lines.push(bad.length === 0 ? 'Streamed tool calls assemble into valid JSON on every model tested.' : `Streamed tool calls FAILED on: ${bad.join(', ')}`);
    }
    if (headersSeen) lines.push(`Headers worth a look: ${JSON.stringify(headersSeen)}`);
    for (const note of notes) lines.push(note);
    lines.push('');
    console.info(redact(lines.join('\n')));

    if (outPath) {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, redact(JSON.stringify({ baseUrl, models, rows, notes, raw }, null, 2)));
      console.info(`[stream-spike] wrote ${outPath}`);
    }

    // A spike reports facts; a refusal is a finding, not a failure. It only has to have run.
    expect(rows.length).toBeGreaterThan(0);
  });
});
