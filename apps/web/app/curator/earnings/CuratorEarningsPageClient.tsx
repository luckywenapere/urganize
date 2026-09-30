'use client';

// The curator's Earnings page: bank account, price, strikes, and what has
// actually been sent to their bank.
//
// One page-level load rather than the useCuratorStore mechanics its three
// siblings share: those exist for profile/playlists/pitches, which the curator
// re-visits and edits piecemeal, while this reads one aggregate route
// (GET /api/curator/earnings) built for exactly this screen and mutates through
// four narrow routes (bank account, price). A shared store would buy nothing
// here and would tempt a second, thinner shape of CuratorEarnings into
// existence.

import { useCallback, useEffect, useState } from 'react';
import { CuratorShell } from '@/components/curator/CuratorShell';
import { CuratorLoadError } from '@/components/curator/CuratorLoadError';
import { CuratorEarningsSkeleton } from '@/components/loading/CuratorSkeleton';
import { PitchTerms } from '@/components/pitching/PitchTerms';
import { CURATOR_TERMS } from '@/lib/pitch-payment-terms';
import {
  CURATOR_TERMS_VERSION,
  PITCH_PRICE_MAX_KOBO,
  PITCH_PRICE_MIN_KOBO,
  isValidNubanAccountNumber,
  nairaToKobo,
  splitPitchPrice,
  validatePitchPrice,
} from '@/lib/pitch-payments';
import {
  ACCEPT_CURATOR_TERMS,
  ADD_BANK_ACCOUNT,
  EARNINGS_EMPTY,
  INBOX_PAUSED,
  NAME_CHECK_NO,
  NAME_CHECK_YES,
  NAME_MISMATCH,
  STOP_PAID_PITCHES,
  TAKE_PAID_PITCHES,
  accountLive,
  earningsRow,
  formatPitchDate,
  nameCheckQuestion,
  priceFieldHelp,
  priceNotLiveYet,
  priceOutOfBand,
  recoveryAppliedLine,
  recoveryOwedLine,
  rowRefundedLine,
  strikesLine,
  windowNote,
} from '@/lib/pitch-payment-copy';
import {
  loadCuratorEarnings,
  loadPayoutBanks,
  removePayoutAccount,
  resolvePayoutAccount,
  saveCuratorPricing,
  savePayoutAccount,
  stopCuratorPricing,
} from '@/lib/pitch-payments-client';
import type { PaystackBank } from '@/lib/paystack-server';
import type { CuratorEarnings } from '@/types/pitch-payments';

const inputClass =
  'h-11 w-full rounded-xl border border-stroke-control bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';
const primaryButtonClass =
  'inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50';
const secondaryButtonClass =
  'inline-flex h-10 items-center justify-center rounded-xl border border-stroke-default px-4 text-sm font-semibold text-content-secondary transition-colors hover:border-stroke-strong hover:text-content-primary disabled:opacity-50';

type BankWizardStep = 'idle' | 'form' | 'confirm' | 'terms';

/** Bank account: add, confirm the name at the bank, accept the terms, save. */
function PayoutAccountSection({
  earnings,
  onSaved,
}: {
  earnings: CuratorEarnings;
  onSaved: () => void;
}) {
  const account = earnings.payoutAccount;
  const [step, setStep] = useState<BankWizardStep>('idle');
  const [banks, setBanks] = useState<PaystackBank[] | null>(null);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [resolvedBankName, setResolvedBankName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('idle');
    setBankCode('');
    setAccountNumber('');
    setResolvedName('');
    setResolvedBankName('');
    setAccepted(false);
    setError('');
  };

  const openForm = async () => {
    setError('');
    setStep('form');
    if (!banks) {
      const result = await loadPayoutBanks();
      if (result.ok) setBanks(result.data.banks);
      else setError(result.error);
    }
  };

  const check = async () => {
    setError('');
    if (!bankCode) {
      setError('Pick your bank.');
      return;
    }
    if (!isValidNubanAccountNumber(accountNumber)) {
      setError('Enter your 10-digit account number.');
      return;
    }
    setIsBusy(true);
    try {
      const result = await resolvePayoutAccount(bankCode, accountNumber);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setResolvedName(result.data.accountName);
      setResolvedBankName(result.data.bankName);
      setStep('confirm');
    } finally {
      setIsBusy(false);
    }
  };

  const save = async () => {
    if (!accepted) {
      setError('Read and accept the Curator Terms to get paid.');
      return;
    }
    setError('');
    setIsBusy(true);
    try {
      const result = await savePayoutAccount({
        bankCode,
        accountNumber,
        termsVersion: CURATOR_TERMS_VERSION,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      onSaved();
    } finally {
      setIsBusy(false);
    }
  };

  const remove = async () => {
    setError('');
    setIsBusy(true);
    try {
      const result = await removePayoutAccount();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-content-tertiary">Bank account</p>

      {step === 'idle' ? (
        account ? (
          <div className="space-y-3">
            <p
              className={`text-sm ${
                account.status === 'needs_review' ? 'text-status-warning' : 'text-content-primary'
              }`}
            >
              {account.status === 'needs_review'
                ? NAME_MISMATCH
                : accountLive(account.bankName, account.accountLast4)}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void openForm()} className={secondaryButtonClass}>
                Change bank account
              </button>
              <button type="button" onClick={() => void remove()} disabled={isBusy} className={secondaryButtonClass}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-content-secondary">{EARNINGS_EMPTY}</p>
            <button type="button" onClick={() => void openForm()} className={primaryButtonClass}>
              {ADD_BANK_ACCOUNT}
            </button>
          </div>
        )
      ) : null}

      {step === 'form' ? (
        <div className="space-y-3">
          <select
            value={bankCode}
            onChange={(event) => setBankCode(event.target.value)}
            className={inputClass}
          >
            <option value="">Pick your bank</option>
            {(banks || []).map((bank) => (
              <option key={bank.code} value={bank.code}>
                {bank.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ''))}
            placeholder="10-digit account number"
            className={inputClass}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void check()} disabled={isBusy} className={primaryButtonClass}>
              {isBusy ? 'Checking…' : 'Check account'}
            </button>
            {account ? (
              <button type="button" onClick={reset} className={secondaryButtonClass}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 'confirm' ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-content-primary">{nameCheckQuestion(resolvedName)}</p>
          <p className="text-xs text-content-tertiary">{resolvedBankName}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep('terms')} className={primaryButtonClass}>
              {NAME_CHECK_YES}
            </button>
            <button type="button" onClick={() => setStep('form')} className={secondaryButtonClass}>
              {NAME_CHECK_NO}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'terms' ? (
        <div className="space-y-3">
          <PitchTerms terms={CURATOR_TERMS} />
          <label className="flex items-start gap-2 text-sm text-content-secondary">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-0.5"
            />
            {ACCEPT_CURATOR_TERMS}
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={isBusy || !accepted}
              className={primaryButtonClass}
            >
              {isBusy ? 'Saving…' : 'Save bank account'}
            </button>
            <button type="button" onClick={() => setStep('confirm')} className={secondaryButtonClass}>
              Back
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Whether artists are actually charged right now, and what to do about it if not. */
function priceNotLiveReason(earnings: CuratorEarnings): Parameters<typeof priceNotLiveYet>[0] | null {
  if (earnings.livePriceKobo !== null) return null;
  if (!earnings.pricing?.isLive) return 'off';
  if (!earnings.payoutAccount) return 'no_account';
  if (earnings.payoutAccount.status !== 'active') return 'account_review';
  if (earnings.paused) return 'paused';
  return 'off';
}

/** The pitch price: set it, see the share preview, switch paid pitches on or off. */
function PricingSection({ earnings, onSaved }: { earnings: CuratorEarnings; onSaved: () => void }) {
  const pricing = earnings.pricing;
  const [priceInput, setPriceInput] = useState(() =>
    pricing?.priceKobo ? String(Math.round(pricing.priceKobo / 100)) : ''
  );
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const kobo = priceInput.trim() ? nairaToKobo(priceInput) : null;
  const check = kobo !== null ? validatePitchPrice(kobo) : null;
  const share = kobo !== null && check?.ok ? splitPitchPrice(kobo, earnings.config.feeBps).curatorShareKobo : null;
  const isLive = pricing?.isLive ?? false;
  const reason = priceNotLiveReason(earnings);

  const submit = async () => {
    setError('');
    if (kobo === null) {
      setError('Enter a price in naira.');
      return;
    }
    if (check && !check.ok) {
      setError(check.error);
      return;
    }
    setIsBusy(true);
    try {
      const result = await saveCuratorPricing(String(Math.round(kobo / 100)), true);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    } finally {
      setIsBusy(false);
    }
  };

  const stop = async () => {
    setError('');
    setIsBusy(true);
    try {
      const result = await stopCuratorPricing();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-content-tertiary">Your price</p>

      <div className="flex items-center gap-2">
        <span className="text-sm text-content-tertiary">₦</span>
        <input
          type="text"
          inputMode="numeric"
          value={priceInput}
          onChange={(event) => setPriceInput(event.target.value)}
          placeholder="5,000"
          className={inputClass}
        />
      </div>

      {share !== null ? (
        <p className="text-xs text-content-tertiary">{priceFieldHelp(share)}</p>
      ) : (
        <p className="text-xs text-content-tertiary">{priceOutOfBand(PITCH_PRICE_MIN_KOBO, PITCH_PRICE_MAX_KOBO)}</p>
      )}

      <p className="text-xs text-content-tertiary">{windowNote(pricing?.responseWindowHours)}</p>

      {reason ? (
        <p className="text-sm text-status-warning">{priceNotLiveYet(reason)}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void submit()} disabled={isBusy} className={primaryButtonClass}>
          {isBusy ? 'Saving…' : isLive ? 'Update price' : TAKE_PAID_PITCHES}
        </button>
        {isLive ? (
          <button type="button" onClick={() => void stop()} disabled={isBusy} className={secondaryButtonClass}>
            {STOP_PAID_PITCHES}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** What has actually been sent to the bank, newest first. A refunded row is
 *  greyed out and says so: nothing from it reached the curator. */
function EarningsList({ earnings }: { earnings: CuratorEarnings }) {
  const emptyLine = earnings.payoutAccount
    ? 'No pitches paid for yet. They will show up here.'
    : EARNINGS_EMPTY;

  return (
    <section className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-content-tertiary">Earnings</p>
      {earnings.earnings.length === 0 ? (
        <p className="rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
          {emptyLine}
        </p>
      ) : (
        <ul className="space-y-2">
          {earnings.earnings.map((row) => {
            const refunded = row.status !== 'paid';
            return (
              <li
                key={row.id}
                className="rounded-xl border border-stroke-default bg-bg-surface p-3"
              >
                <p className={`text-sm ${refunded ? 'text-content-tertiary' : 'text-content-primary'}`}>
                  {earningsRow(row.songTitle, row.artistName, row.sentToBankKobo, formatPitchDate(row.paidAt))}
                </p>
                {refunded ? (
                  <p className="mt-1 text-xs text-status-warning">{rowRefundedLine}</p>
                ) : row.recoveryAppliedKobo > 0 ? (
                  <p className="mt-1 text-xs text-content-tertiary">
                    {recoveryAppliedLine(row.recoveryAppliedKobo)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function CuratorEarningsPageClient() {
  const [earnings, setEarnings] = useState<CuratorEarnings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await loadCuratorEarnings();
    if (!result.ok) {
      setLoadError(result.error);
      setIsLoading(false);
      return;
    }
    setLoadError('');
    setEarnings(result.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <CuratorShell>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.16em] text-content-tertiary">Earnings</p>
          <h1 className="font-display text-2xl text-content-primary">Get paid to review songs</h1>
          <p className="text-sm text-content-secondary">
            Artists pay you each time you listen and reply to a pitch.
          </p>
        </header>

        {loadError ? (
          <CuratorLoadError
            message={loadError}
            variant={earnings ? 'banner' : 'blocking'}
            isRetrying={isLoading}
            onRetry={() => void load()}
          />
        ) : null}

        {isLoading && !earnings ? (
          <CuratorEarningsSkeleton />
        ) : earnings ? (
          <>
            <PayoutAccountSection earnings={earnings} onSaved={() => void load()} />
            <PricingSection earnings={earnings} onSaved={() => void load()} />

            {earnings.paused ? (
              <p role="status" className="rounded-xl border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
                {INBOX_PAUSED}
              </p>
            ) : null}

            {earnings.strikeCount > 0 ? (
              <p className="text-sm text-content-secondary">{strikesLine(earnings.strikeCount)}</p>
            ) : null}

            {earnings.recoveryOwedKobo > 0 ? (
              <p className="text-sm text-status-warning">{recoveryOwedLine(earnings.recoveryOwedKobo)}</p>
            ) : null}

            <EarningsList earnings={earnings} />
          </>
        ) : null}
      </div>
    </CuratorShell>
  );
}
