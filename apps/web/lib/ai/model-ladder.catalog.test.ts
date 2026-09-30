/**
 * Does the ladder still match what the provider actually serves?
 *
 * The ladder (lib/ai/model-ladder.ts) was chosen on 2026-09-29 from RodiumAi's
 * live catalogue. A catalogue moves: a model is retired, renamed, put behind a
 * flag or repriced, and the first anyone hears of it is a request that comes
 * back 404. This reads the same public catalogue the ladder was chosen from and
 * checks the facts the router relies on.
 *
 * It is the one router test that needs the network, so it is opt-in and
 * `pnpm test` stays offline (the release-scope.integration.test.ts precedent):
 *
 *   ROUTER_CATALOG_CHECK=1 pnpm --filter @urganize/web test lib/ai/model-ladder.catalog.test.ts
 *
 * The endpoint is public. No key is read, sent or needed. It checks the DEFAULT
 * ladder; an AI_LADDER_* override in the environment is not what is under test.
 *
 * A failure here is not a flaky test. Read which rung and which fact before
 * touching anything: usually the answer is an env override (AI_LADDER_<RUNG>),
 * which needs no deploy.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_LADDER, MODEL_TIERS, usesMaxCompletionTokens } from './model-ladder';
import { supportsReasoningEffort } from './provider';

const enabled = process.env.ROUTER_CATALOG_CHECK === '1';
const CATALOGUE_URL = process.env.ROUTER_CATALOG_URL || 'https://api.rodiumai.io/v1/models';

type CatalogueModel = {
  id: string;
  rodiumai_status?: string;
  rodiumai_capabilities?: {
    supports_tools?: boolean;
    supports_json_mode?: boolean;
    supports_reasoning?: boolean;
    max_output_tokens?: number;
  };
  rodiumai_pricing?: { input_per_1m?: string; output_per_1m?: string };
  rodiumai_rate_limits?: { rpm?: number; tpm?: number; rpd?: number };
};

async function fetchCatalogue(): Promise<Map<string, CatalogueModel>> {
  const response = await fetch(CATALOGUE_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
  const payload = (await response.json()) as { data?: CatalogueModel[] };
  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error('Catalogue came back empty or in a shape this test does not know');
  }
  return new Map(payload.data.map((model) => [model.id, model]));
}

const allLadderModels = MODEL_TIERS.flatMap((tier) =>
  DEFAULT_LADDER[tier].models.map((id) => ({ tier, id, primary: DEFAULT_LADDER[tier].models[0] === id }))
);

describe.skipIf(!enabled)('the default ladder against the provider\'s live catalogue', () => {
  let catalogue: Map<string, CatalogueModel>;

  // One fetch for the whole file. If it fails, every test below fails with the
  // reason, rather than each one tripping over an undefined catalogue.
  beforeAll(async () => {
    catalogue = await fetchCatalogue();
  }, 30_000);

  it('reads a catalogue that looks like one', () => {
    expect(catalogue.size).toBeGreaterThan(20);
  });

  for (const { tier, id } of allLadderModels) {
    describe(`${tier}: ${id}`, () => {
      const model = () => {
        const found = catalogue.get(id);
        if (!found) throw new Error(`${id} is not in the catalogue (rung ${tier}). Replace it with AI_LADDER_${tier.toUpperCase()}.`);
        return found;
      };

      it('is in the catalogue and available', () => {
        expect(model().rodiumai_status).toBe('available');
      });

      it('supports tools and JSON mode, which every rung is used for', () => {
        expect(model().rodiumai_capabilities?.supports_tools).toBe(true);
        expect(model().rodiumai_capabilities?.supports_json_mode).toBe(true);
      });

      it('takes reasoning_effort exactly when the router thinks it does', () => {
        // supportsReasoningEffort decides whether the parameter is sent, from the
        // model id alone. If the catalogue says otherwise the request either wastes
        // the parameter or, worse, sends it to a model that rejects it.
        expect(Boolean(model().rodiumai_capabilities?.supports_reasoning)).toBe(supportsReasoningEffort(id));
        expect(usesMaxCompletionTokens(id)).toBe(supportsReasoningEffort(id));
      });

      it('allows at least as many output tokens as the rung asks for', () => {
        const limit = model().rodiumai_capabilities?.max_output_tokens ?? 0;
        expect(limit).toBeGreaterThanOrEqual(DEFAULT_LADDER[tier].maxOutputTokens);
      });
    });
  }

  it('is a ladder: each rung\'s primary costs at least as much as the one below, in and out', () => {
    const price = (id: string, key: 'input_per_1m' | 'output_per_1m') => Number(catalogue.get(id)?.rodiumai_pricing?.[key]);
    const primaries = MODEL_TIERS.map((tier) => DEFAULT_LADDER[tier].models[0]);
    for (let i = 1; i < primaries.length; i += 1) {
      expect(price(primaries[i], 'input_per_1m')).toBeGreaterThanOrEqual(price(primaries[i - 1], 'input_per_1m'));
      expect(price(primaries[i], 'output_per_1m')).toBeGreaterThanOrEqual(price(primaries[i - 1], 'output_per_1m'));
    }
  });

  it('gives every rung a sibling with limits of its own (so a rate limit has somewhere to go)', () => {
    for (const tier of MODEL_TIERS) {
      expect(DEFAULT_LADDER[tier].models.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('states the request limits it is planning around, for the record', () => {
    // Not an assertion about the provider: the figures the ladder was chosen with
    // (Terra and Sol at 10 requests a minute and 500 a day) are why each has a
    // higher-limit sibling. Printed so a run shows whether they have moved.
    const rows = allLadderModels.map(({ tier, id, primary }) => {
      const limits = catalogue.get(id)?.rodiumai_rate_limits;
      return `${tier.padEnd(9)}${primary ? '*' : ' '} ${id.padEnd(24)} rpm ${limits?.rpm} tpm ${limits?.tpm} rpd ${limits?.rpd}`;
    });
    console.info(`\n${rows.join('\n')}\n(* = primary)`);
    expect(rows.length).toBe(allLadderModels.length);
  });
});
