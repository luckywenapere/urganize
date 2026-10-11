/**
 * The grant finder evaluation (plan step 4). Opt-in, like the router's: it never
 * runs in `pnpm test`, and the real run costs real money.
 *
 * Two modes:
 *
 *   GRANT_EVAL=1 GRANT_EVAL_FAKE=1
 *     The dry run. A local fake of the search vendor and a scripted model, no key,
 *     no network, no cost. Proves the wiring and the report before a real key.
 *
 *   GRANT_EVAL=1 EXA_API_KEY=... AI_API_KEY=...
 *     The real run. Searches the vendor and reads each page with the app's own AI
 *     gateway (AI_API_KEY / AI_API_BASE, the same ones the single-shot features use).
 *
 * Optional:
 *   GRANT_EVAL_MODEL=...           the extraction model (default: the gateway's own default)
 *   GRANT_EVAL_CASES=id,id         only these cases (ids in eval-cases.ts)
 *   GRANT_EVAL_MAX_CASES=5         only the first N cases (the plan's small first run)
 *   GRANT_EVAL_MAX_USD=1           stop spending past this across the whole run (default 1, at most 10)
 *   GRANT_EVAL_QUERIES=2           queries per case (default 2)
 *   GRANT_EVAL_OUT=grant-eval.json also write the report, with an empty label per result to fill in
 *
 * The keys are read once, sent only in headers, and the report is refused outright if
 * either appears anywhere in it. Set them for one process, then remove them:
 *
 *   PowerShell, from apps/web:
 *     $k = Read-Host "Exa key" -AsSecureString
 *     $env:EXA_API_KEY = [System.Net.NetworkCredential]::new('', $k).Password
 *     $env:GRANT_EVAL = '1'; $env:GRANT_EVAL_MAX_CASES = '5'; $env:GRANT_EVAL_MAX_USD = '0.5'
 *     $env:GRANT_EVAL_OUT = 'grant-eval.json'
 *     pnpm exec vitest run lib/grants/grant-eval.integration.test.ts --disableConsoleIntercept
 *     Remove-Item Env:EXA_API_KEY, Env:GRANT_EVAL
 *
 * `--disableConsoleIntercept` is not optional: without it vitest swallows the summary.
 * The prices in spend.ts are UNVERIFIED estimates on the high side; confirm them
 * (plan Gate 0) before trusting the cap as more than a ceiling.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateStructuredAiOutput } from '@/lib/ai/provider';

import { GRANT_EVAL_CASES } from './eval-cases';
import { buildEvalReport, serializeEvalReport } from './eval-report';
import { searchExa } from './exa-client';
import type { ExtractionRequest } from './extract';
import { createModelExtractor, type CompleteFn } from './extractor';
import { startFakeExa } from './fake-exa';
import { HARD_CEILINGS, runGrantSearch, type GrantSearchReport } from './pipeline';

const enabled = process.env.GRANT_EVAL === '1';
const fakeMode = process.env.GRANT_EVAL_FAKE === '1';
const exaKey = (process.env.EXA_API_KEY || '').trim();
const aiKey = (process.env.AI_API_KEY || '').trim();
const model = (process.env.GRANT_EVAL_MODEL || '').trim() || undefined;
const budgetUsd = Math.min(10, Number(process.env.GRANT_EVAL_MAX_USD) > 0 ? Number(process.env.GRANT_EVAL_MAX_USD) : 1);
const queriesPerCase = Math.min(6, Math.max(1, Math.floor(Number(process.env.GRANT_EVAL_QUERIES) || 2)));
const outPath = (process.env.GRANT_EVAL_OUT || '').trim();

const cases = (() => {
  const wanted = (process.env.GRANT_EVAL_CASES || '').split(',').map((id) => id.trim()).filter(Boolean);
  let selected = wanted.length > 0 ? GRANT_EVAL_CASES.filter((c) => wanted.includes(c.id)) : [...GRANT_EVAL_CASES];
  const limit = Math.floor(Number(process.env.GRANT_EVAL_MAX_CASES) || 0);
  if (limit > 0) selected = selected.slice(0, limit);
  return selected;
})();

/** The founder's calendar day, so a deadline today in Lagos is still open. */
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

/** The scripted model for the dry run: reads the page it is given, says it is a grant, invents nothing. */
const scriptedComplete: CompleteFn = async (request: ExtractionRequest) => {
  const title = /Title: (.*)/.exec(request.user)?.[1]?.trim() || null;
  return JSON.stringify({ isGrant: true, title, funder: null, deadline: null, lastClosedOn: null, amount: null, currency: null, eligibility: [] });
};

/** The real model, through the app's gateway, with the no-tools request and its JSON schema. */
const gatewayComplete: CompleteFn = (request) =>
  generateStructuredAiOutput<string>({
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    jsonSchema: request.jsonSchema,
    model,
    maxRetries: 2,
    timeoutMs: 40_000,
    parse: (raw) => (typeof raw === 'string' && raw.trim() ? raw : null),
  });

describe.skipIf(!enabled)('the grant finder evaluation', () => {
  it(
    fakeMode ? 'dry run against a local fake' : 'live run',
    async () => {
      if (!fakeMode) {
        expect(exaKey, 'EXA_API_KEY is not set').not.toBe('');
        expect(aiKey, 'AI_API_KEY is not set').not.toBe('');
      }
      expect(cases.length, 'no cases selected').toBeGreaterThan(0);

      const fake = fakeMode
        ? await startFakeExa((call) => ({
            status: 200,
            body: {
              results: [
                {
                  url: `https://fund${call}.example.org/call`,
                  title: `Fake Fund ${call}`,
                  text: `Fake Fund ${call}\nA rehearsal page with no deadline.\nWho can apply: artists anywhere.`,
                },
              ],
            },
          }))
        : null;

      const runs: Array<{ id: string; intent: string; report: GrantSearchReport }> = [];
      let spent = 0;
      try {
        const search = (query: string) =>
          fake ? searchExa({ apiKey: 'fake-key', query, url: fake.url }) : searchExa({ apiKey: exaKey, query, numResults: 5 });
        const extract = createModelExtractor(fake ? scriptedComplete : gatewayComplete);

        for (const testCase of cases) {
          const remaining = budgetUsd - spent;
          if (remaining <= 0.0001) {
            console.log(`Budget of $${budgetUsd} reached; stopped before ${testCase.id}.`);
            break;
          }
          const report = await runGrantSearch(
            { search, extract },
            {
              facts: testCase.facts,
              today,
              maxQueries: queriesPerCase,
              limits: { maxSearches: queriesPerCase, maxPages: 10, maxUsd: Math.min(remaining, HARD_CEILINGS.maxUsd) },
            }
          );
          spent += report.spentUsd;
          runs.push({ id: testCase.id, intent: testCase.intent, report });
          console.log(
            `${testCase.id.padEnd(24)} ${report.outcome.padEnd(12)} open ${report.open.length}, unknown ${report.unknownDeadline.length}, closed ${report.watch.length}, dropped ${report.dropped.length}, $${report.spentUsd.toFixed(4)}`
          );
        }
      } finally {
        await fake?.close();
      }

      const evalReport = buildEvalReport({ startedAt: new Date().toISOString(), mode: fake ? 'fake' : 'live', today, runs });
      const json = serializeEvalReport(evalReport, [exaKey, aiKey]);
      console.log(`\n${evalReport.totals.cases} cases, ${evalReport.totals.results} results, $${evalReport.totals.spentUsd} spent (estimate).`);
      console.log(`Known funders found: ${evalReport.totals.knownFundersFound.join(', ') || 'none'}.`);
      if (outPath) {
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, json);
        console.log(`Report written to ${outPath}. Label each result, then score it with scoreRun.`);
      }

      expect(evalReport.totals.cases).toBe(runs.length);
      if (fake) expect(evalReport.totals.results).toBeGreaterThan(0);
    },
    30 * 60_000
  );
});
