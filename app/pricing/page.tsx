'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { useAuthStore } from '@/lib/auth-store';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Paystack
const PricingCards = dynamic(() => import('@/components/PricingCards').then(mod => mod.PricingCards), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-12">
      <div className="animate-spin h-8 w-8 border-2 border-white border-t-transparent rounded-full" />
    </div>
  ),
});

export default function PricingPage() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      setEmail(user.email);
    }
  }, [user, isAuthenticated, isLoading]);

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
          <Logo />
          <div className="w-16" />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Get full access to Urganize. Cancel anytime.
          </p>
          <div className="inline-block mt-4 px-4 py-2 bg-emerald-600/20 border border-emerald-600/50 rounded-full">
            <span className="text-emerald-400 text-sm font-medium">
              Beta pricing: limited time only
            </span>
          </div>
        </div>

        {isAuthenticated && email ? (
          <PricingCards email={email} />
        ) : (
          <div className="text-center">
            <p className="text-zinc-400 mb-4">Sign in to subscribe</p>
            <Link
              href="/auth"
              className="inline-block px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Sign In
            </Link>
          </div>
        )}

        {/* FAQ or extra info */}
        <div className="mt-16 text-center">
          <p className="text-zinc-500 text-sm">
            Questions? Reach out at{' '}
            <a href="mailto:hello@urganize.app" className="text-emerald-500 hover:underline">
              hello@urganize.app
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
