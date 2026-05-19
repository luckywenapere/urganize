'use client';

import { useState } from 'react';
import { usePaystackPayment } from 'react-paystack';

interface PaystackButtonProps {
  email: string;
  amount: number;
  plan: string;
  metadata?: Record<string, string | number | boolean>;
  onSuccess?: (reference: { reference: string }) => void;
  onClose?: () => void;
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  redirectPath?: string;
  currency?: 'NGN';
}

export function PaystackButton({
  email,
  amount,
  plan,
  metadata = {},
  onSuccess,
  onClose,
  className = '',
  children = 'Upgrade Now',
  disabled = false,
  redirectPath = '/payment/callback',
  currency = 'NGN',
}: PaystackButtonProps) {
  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '';
  const safeAmount = Math.max(0, Number(amount) || 0);
  // Stable per-mount reference. Lazy useState keeps the impure Date.now/
  // Math.random calls out of every render, satisfying react-hooks/purity.
  const [reference] = useState(
    () => `urganize_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
  );
  const paymentPurpose = String(metadata?.purpose || '').trim().toLowerCase();
  const isTrialTokenization = paymentPurpose === 'trial_tokenization';

  const config = {
    reference,
    email: email.trim().toLowerCase(),
    amount: Math.round(safeAmount * 100),
    currency,
    publicKey,
    ...(isTrialTokenization ? { channels: ['card'] } : {}),
    metadata: {
      plan,
      ...metadata,
      custom_fields: [
        {
          display_name: 'Plan',
          variable_name: 'plan',
          value: plan,
        },
        ...Object.entries(metadata).map(([key, value]) => ({
          display_name: key.replace(/_/g, ' '),
          variable_name: key,
          value: String(value),
        })),
      ],
    },
  };

  const initializePayment = usePaystackPayment(config);

  const handlePayment = () => {
    if (!publicKey || !email || safeAmount <= 0 || disabled) return;

    initializePayment({
      onSuccess: (reference) => {
        onSuccess?.(reference as { reference: string });
        const referenceId = encodeURIComponent(reference.reference);
        window.location.assign(`${redirectPath}?reference=${referenceId}`);
      },
      onClose: () => {
        onClose?.();
      },
    });
  };

  return (
    <button
      type="button"
      onClick={handlePayment}
      disabled={disabled || !publicKey || !email || safeAmount <= 0}
      className={
        className ||
        'rounded-lg bg-brand px-6 py-3 font-medium text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      {children}
    </button>
  );
}
