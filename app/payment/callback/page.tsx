'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function PaymentCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams.get('reference');
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');

  useEffect(() => {
    if (reference) {
      verifyPayment(reference);
    }
  }, [reference]);

  const verifyPayment = async (ref: string) => {
    try {
      const res = await fetch(`/api/payments/verify?reference=${ref}`);
      const data = await res.json();
      
      if (data.status === 'success') {
        setStatus('success');
        // Redirect to dashboard after 2 seconds
        setTimeout(() => router.push('/dashboard'), 2000);
      } else {
        setStatus('failed');
      }
    } catch (error) {
      setStatus('failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        {status === 'verifying' && (
          <>
            <div className="animate-spin h-8 w-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-white">Verifying payment...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-emerald-500 text-5xl mb-4">✓</div>
            <p className="text-white text-xl">Payment successful!</p>
            <p className="text-gray-400 mt-2">Redirecting to dashboard...</p>
          </>
        )}
        {status === 'failed' && (
          <>
            <div className="text-red-500 text-5xl mb-4">✕</div>
            <p className="text-white text-xl">Payment verification failed</p>
            <button 
              onClick={() => router.push('/dashboard')}
              className="mt-4 px-4 py-2 bg-white text-black rounded"
            >
              Return to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}