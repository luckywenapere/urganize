'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addSpendLine,
  changeSpendLine,
  loadSpend,
  removeSpendLine,
  savePaybackAnswer,
  type SpendFormValues,
  type SpendResult,
} from '@/lib/release-spend-client';
import { sortSpendLines, totalKobo, type Payback, type SpendLine } from '@/lib/release-spend';

export type SpendState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; canView: boolean; lines: SpendLine[]; payback: Payback | null };

/**
 * One rollout's spend, read from the server and kept in step with each edit.
 * Never cached or persisted: it is money, and a person's right to see it can
 * change, so every open asks again. Each mutation answers `{ ok, value }` and, on
 * success, updates the list from what the SERVER returned, so what is on screen
 * is the saved line and not the typed one.
 */
export function useSpend(releaseId: string) {
  const [state, setState] = useState<SpendState>({ status: 'loading' });

  // The first read starts from the initial 'loading' state, so it sets nothing
  // before its answer arrives. The component is keyed on the rollout, so a
  // different rollout is a fresh mount and never shows the last one's money.
  const fetchSpend = useCallback(async () => {
    const result = await loadSpend(releaseId);
    if (!result.ok) {
      setState({ status: 'error', error: result.error });
      return;
    }
    const { canView, lines, payback } = result.value;
    setState({ status: 'ready', canView, lines: sortSpendLines(lines), payback });
  }, [releaseId]);

  useEffect(() => {
    void fetchSpend();
  }, [fetchSpend]);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    await fetchSpend();
  }, [fetchSpend]);

  const edit = useCallback((change: (lines: SpendLine[], payback: Payback | null) => { lines?: SpendLine[]; payback?: Payback | null }) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      const next = change(current.lines, current.payback);
      return {
        ...current,
        lines: next.lines ? sortSpendLines(next.lines) : current.lines,
        payback: next.payback === undefined ? current.payback : next.payback,
      };
    });
  }, []);

  const add = useCallback(
    async (values: SpendFormValues): Promise<SpendResult<SpendLine>> => {
      const result = await addSpendLine(releaseId, values);
      if (result.ok) edit((lines) => ({ lines: [result.value, ...lines] }));
      return result;
    },
    [releaseId, edit]
  );

  const change = useCallback(
    async (lineId: string, values: SpendFormValues): Promise<SpendResult<SpendLine>> => {
      const result = await changeSpendLine(releaseId, lineId, values);
      if (result.ok) edit((lines) => ({ lines: lines.map((line) => (line.id === lineId ? result.value : line)) }));
      return result;
    },
    [releaseId, edit]
  );

  const remove = useCallback(
    async (lineId: string): Promise<SpendResult<true>> => {
      const result = await removeSpendLine(releaseId, lineId);
      if (result.ok) edit((lines) => ({ lines: lines.filter((line) => line.id !== lineId) }));
      return result;
    },
    [releaseId, edit]
  );

  const answerPayback = useCallback(
    async (input: { amountNaira: string; note: string }): Promise<SpendResult<Payback>> => {
      const result = await savePaybackAnswer(releaseId, input);
      if (result.ok) edit(() => ({ payback: result.value }));
      return result;
    },
    [releaseId, edit]
  );

  const total = state.status === 'ready' ? totalKobo(state.lines) : 0;

  return { state, total, reload: load, add, change, remove, answerPayback };
}
