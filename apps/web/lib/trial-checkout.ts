'use client';

import { ANNUAL_TRIAL_DAYS } from '@/lib/billing';

export type PreparedTrialCheckout = {
  trialDays: number;
  tokenizationAmount: number;
  eligibilityToken: string;
};

export const TRIAL_TOKENIZATION_PLAN = 'trial_tokenization';
export const TRIAL_TOKENIZATION_PURPOSE = 'trial_tokenization';

const TRIAL_DEVICE_ID_KEY = 'urganize.trial.device_id';

const getOrCreateTrialDeviceId = (): string => {
  if (typeof window === 'undefined') return '';

  const existing = localStorage.getItem(TRIAL_DEVICE_ID_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `trial_${Date.now()}_${Math.random().toString(16).slice(2, 12)}`;

  localStorage.setItem(TRIAL_DEVICE_ID_KEY, generated);
  return generated;
};

const hashSha256Hex = async (value: string): Promise<string> => {
  if (!value) return '';
  if (typeof window === 'undefined' || !window.crypto?.subtle) return value;

  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const prepareAnnualTrialCheckout = async (
  accessToken: string
): Promise<PreparedTrialCheckout> => {
  if (!accessToken) {
    throw new Error('Session expired. Sign in again and retry.');
  }

  const rawDeviceId = getOrCreateTrialDeviceId();
  const trialDeviceIdHash = await hashSha256Hex(rawDeviceId);

  const response = await fetch('/api/trial/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      plan: 'annual',
      trial_device_id_hash: trialDeviceIdHash,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    trial_days?: number;
    tokenization_amount_ngn?: number;
    eligibility_token?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || 'Could not prepare trial checkout.');
  }

  const trialDays = Number(payload.trial_days || ANNUAL_TRIAL_DAYS);
  const tokenizationAmount = Number(payload.tokenization_amount_ngn || 0);
  const eligibilityToken = String(payload.eligibility_token || '');

  if (!eligibilityToken || !Number.isFinite(tokenizationAmount) || tokenizationAmount <= 0) {
    throw new Error('Invalid trial preparation response. Please retry.');
  }

  return {
    trialDays,
    tokenizationAmount,
    eligibilityToken,
  };
};

export const buildAnnualTrialMetadata = (
  checkout: PreparedTrialCheckout
): Record<string, string | number | boolean> => {
  return {
    purpose: TRIAL_TOKENIZATION_PURPOSE,
    selected_plan: 'annual',
    eligibility_token: checkout.eligibilityToken,
  };
};
