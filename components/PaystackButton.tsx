'use client';

import { usePaystackPayment } from 'react-paystack';

interface PaystackButtonProps {
  email: string;
  amount: number;
  plan?: string;
  onSuccess?: (reference: any) => void;
  onClose?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function PaystackButton({
  email,
  amount,
  plan = 'pro',
  onSuccess,
  onClose,
  className = '',
  children = 'Upgrade Now',
}: PaystackButtonProps) {
  const config = {
    reference: `urganize_${new Date().getTime()}`,
    email,
    amount: amount * 100,
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
    metadata: {
      plan,
      custom_fields: [
        {
          display_name: 'Plan',
          variable_name: 'plan',
          value: plan,
        },
      ],
    },
  };

  const initializePayment = usePaystackPayment(config);

  const handlePayment = () => {
    initializePayment({
      onSuccess: (reference) => {
        console.log('Payment successful:', reference);
        onSuccess?.(reference);
        window.location.href = `/payment/callback?reference=${reference.reference}`;
      },
      onClose: () => {
        console.log('Payment closed');
        onClose?.();
      },
    });
  };

  return (
    <button
      onClick={handlePayment}
      className={className || 'px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors'}
    >
      {children}
    </button>
  );
}