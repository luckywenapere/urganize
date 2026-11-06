// Finding a released song's UPC and ISRC: the database half. Server only.
//
// findCodes looks the song up (at most every 15 minutes) and keeps what it found
// in release_code_lookups. Nothing reaches release_metadata, and so nothing
// reaches the smart link, until the person answers "Yes, this is my song"
// (answerCodes). Then the codes are saved where a typed code would go and
// syncSmartLink makes the link exactly as it would for a typed one.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAiConfigured } from '@/lib/ai/provider';
import { legacyModelFor } from '@/lib/ai/model-router';
import { generateRoutedStructuredOutput } from '@/lib/ai/routed';
import { recordRequestUsage } from '@/lib/ai/usage-log-server';
import { createUsageCollector } from '@/lib/credits/embedded';
import { normalizeIsrc, normalizeUpc } from '@/lib/altlink/rules';
import { loadSmartLinkFacts, syncSmartLink, type SyncOutcome } from '@/lib/altlink/server';
import {
  CODE_MATCH_SCHEMA,
  buildMatchMessages,
  candidateKey,
  decideMatch,
  isLookupDue,
  isOutOn,
  parseMatchPick,
  type CodeCandidate,
  type CodeTarget,
  type LookupStatus,
  type ScoredCandidate,
} from './rules';
import { isSpotifyConfigured, searchDeezer, searchSpotify } from './sources';

export const CODE_LOOKUPS_TABLE = 'release_code_lookups';

const COLUMNS = 'release_id,status,candidate,rejected_keys,matched_by,attempts,checked_at,confirmed_at';
const MATCH_TIMEOUT_MS = 8000;

type LookupRow = {
  release_id: string;
  status: LookupStatus;
  candidate: CodeCandidate | null;
  rejected_keys: string[] | null;
  matched_by: 'rules' | 'ai' | null;
  attempts: number;
  checked_at: string | null;
  confirmed_at: string | null;
  confirmed_by?: string | null;
};

/** What the browser is told. The codes are shown so the person can check them. */
export type CodeFinderView =
  | { status: 'has_code' }
  | { status: 'not_out' }
  | { status: 'looking' }
  | { status: 'found'; candidate: CodeCandidate }
  | { status: 'confirmed' };

export type FindContext = {
  actorUserId: string | null;
  workspaceId: string | null;
  ownerUserId: string | null;
  now?: number;
  fetchImpl?: typeof fetch;
};

async function loadRow(admin: SupabaseClient, releaseId: string): Promise<LookupRow | null> {
  const { data, error } = await admin.from(CODE_LOOKUPS_TABLE).select(COLUMNS).eq('release_id', releaseId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LookupRow | null) ?? null;
}

async function saveRow(admin: SupabaseClient, releaseId: string, fields: Partial<LookupRow>) {
  const { error } = await admin.from(CODE_LOOKUPS_TABLE).upsert({ release_id: releaseId, ...fields }, { onConflict: 'release_id' });
  if (error) throw new Error(error.message);
}

function viewOf(row: LookupRow | null): CodeFinderView {
  if (row?.status === 'found' && row.candidate) return { status: 'found', candidate: row.candidate };
  if (row?.status === 'confirmed') return { status: 'confirmed' };
  return { status: 'looking' };
}

/** Asks the model which listing is the song. Null when it says none, or cannot answer. */
async function pickWithAi(
  admin: SupabaseClient,
  target: CodeTarget,
  options: ScoredCandidate[],
  context: FindContext & { releaseId: string }
): Promise<{ answered: boolean; pick: number | null }> {
  if (!isAiConfigured()) return { answered: false, pick: null };
  const collector = createUsageCollector(legacyModelFor('code_match') ?? null);
  let answer: { pick: number | null } | null = null;
  try {
    answer = await generateRoutedStructuredOutput({
      surface: 'code_match',
      messages: buildMatchMessages(target, options),
      jsonSchema: CODE_MATCH_SCHEMA,
      timeoutMs: MATCH_TIMEOUT_MS,
      maxRetries: 1,
      maxOutputTokens: 200,
      onUsage: collector.onUsage,
      onFailure: collector.onFailure,
      parse: (raw) => parseMatchPick(raw, options.length),
      invalidFormatMessage: 'AI answered in a shape we could not read.',
    });
  } catch {
    answer = null;
  }
  await recordRequestUsage(admin, {
    context: {
      requestId: `code_match:${randomUUID()}`,
      feature: 'code_match',
      workspaceId: context.workspaceId,
      ownerUserId: context.ownerUserId,
      actorUserId: context.actorUserId,
      releaseId: context.releaseId,
    },
    calls: collector.calls,
    failures: collector.failures,
    creditsCharged: 0,
  });
  return answer ? { answered: true, pick: answer.pick } : { answered: false, pick: null };
}

/**
 * Looks the song up when it is due, and answers with what there is to show.
 * Never looks before release day: an unreleased song is not on streaming yet.
 */
export async function findCodes(admin: SupabaseClient, releaseId: string, context: FindContext): Promise<CodeFinderView> {
  const now = context.now ?? Date.now();
  const facts = await loadSmartLinkFacts(admin, releaseId);
  if (!facts) return { status: 'not_out' };
  if (facts.upc || facts.isrc) return { status: 'has_code' };
  if (!isOutOn(facts.releaseDate, now) || !facts.title || !facts.artistName) return { status: 'not_out' };

  const row = await loadRow(admin, releaseId);
  if (!isLookupDue(row ? { status: row.status, checkedAt: row.checked_at } : null, now)) return viewOf(row);

  const target: CodeTarget = {
    title: facts.title,
    artistName: facts.artistName,
    releaseDate: facts.releaseDate,
    releaseType: facts.releaseType,
  };
  const rejected = row?.rejected_keys ?? [];
  const fetchImpl = context.fetchImpl ?? fetch;

  let candidates = await searchDeezer(target, fetchImpl);
  let decision = decideMatch(target, candidates, rejected);
  if (decision.kind === 'none' && isSpotifyConfigured()) {
    candidates = [...candidates, ...(await searchSpotify(target, fetchImpl))];
    decision = decideMatch(target, candidates, rejected);
  }

  let found: CodeCandidate | null = null;
  let matchedBy: 'rules' | 'ai' | null = null;
  if (decision.kind === 'clear') {
    found = decision.best.candidate;
    matchedBy = 'rules';
  } else if (decision.kind === 'ambiguous') {
    const ai = await pickWithAi(admin, target, decision.options, { ...context, releaseId });
    if (ai.answered) {
      found = ai.pick === null ? null : decision.options[ai.pick].candidate;
      matchedBy = found ? 'ai' : null;
    } else {
      // No AI to ask: the best score still goes to the person to confirm.
      found = decision.options[0].candidate;
      matchedBy = 'rules';
    }
  }

  const fields: Partial<LookupRow> = {
    status: found ? 'found' : 'not_found',
    candidate: found,
    matched_by: matchedBy,
    attempts: (row?.attempts ?? 0) + 1,
    checked_at: new Date(now).toISOString(),
  };
  await saveRow(admin, releaseId, fields);
  return found ? { status: 'found', candidate: found } : { status: 'looking' };
}

/** Saves the codes where a typed code would go: release_metadata. */
async function saveCodes(admin: SupabaseClient, releaseId: string, candidate: CodeCandidate, title: string, artist: string) {
  const upc = normalizeUpc(candidate.upc);
  const isrc = normalizeIsrc(candidate.isrc);
  const codes = { ...(upc ? { upc } : {}), ...(isrc ? { isrc } : {}) };
  const { data: existing, error: readError } = await admin
    .from('release_metadata')
    .select('id')
    .eq('release_id', releaseId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  const result = existing
    ? await admin.from('release_metadata').update(codes).eq('release_id', releaseId)
    : await admin
        .from('release_metadata')
        .insert({ release_id: releaseId, release_title: title, primary_artist_name: artist, ...codes });
  if (result.error) throw new Error(result.error.message);
}

export type AnswerResult = { view: CodeFinderView; link: SyncOutcome['kind'] | null };

/**
 * "Yes, this is my song": save the codes and make the link. "No": remember it,
 * and look again straight away for another.
 */
export async function answerCodes(
  admin: SupabaseClient,
  releaseId: string,
  accept: boolean,
  context: FindContext
): Promise<AnswerResult> {
  const row = await loadRow(admin, releaseId);
  if (!row || row.status !== 'found' || !row.candidate) {
    return { view: await findCodes(admin, releaseId, context), link: null };
  }
  const now = context.now ?? Date.now();

  if (!accept) {
    await saveRow(admin, releaseId, {
      status: 'rejected',
      candidate: null,
      matched_by: null,
      checked_at: null,
      rejected_keys: Array.from(new Set([...(row.rejected_keys ?? []), candidateKey(row.candidate)])),
    });
    return { view: await findCodes(admin, releaseId, context), link: null };
  }

  const facts = await loadSmartLinkFacts(admin, releaseId);
  if (!facts) return { view: { status: 'not_out' }, link: null };
  if (!facts.upc && !facts.isrc) {
    await saveCodes(admin, releaseId, row.candidate, facts.title ?? row.candidate.title, facts.artistName ?? row.candidate.artist);
  }
  await saveRow(admin, releaseId, {
    status: 'confirmed',
    confirmed_at: new Date(now).toISOString(),
    confirmed_by: context.actorUserId,
  });
  const outcome = await syncSmartLink(admin, releaseId, { actorUserId: context.actorUserId, now });
  return { view: { status: 'confirmed' }, link: outcome.kind };
}
