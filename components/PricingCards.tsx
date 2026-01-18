'use client';

import { PaystackButton } from './PaystackButton';

interface PricingCardsProps {
  email: string;
}

export function PricingCards({ email }: PricingCardsProps) {
  return (
    <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
      {/* Monthly Plan */}
      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/50">
        <h3 className="text-lg font-medium text-white">Monthly</h3>
        <div className="mt-4">
          <span className="text-3xl font-bold text-white">₦8,000</span>
          <span className="text-zinc-400">/month</span>
        </div>
        <p className="text-zinc-500 text-sm mt-1">
          <span className="line-through">₦26,000</span>
          <span className="text-emerald-500 ml-2">Beta pricing</span>
        </p>
        <ul className="mt-6 space-y-3 text-sm text-zinc-300">
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> Unlimited releases
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> Pre-built task frameworks
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> File management
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> Timeline enforcement
          </li>
        </ul>
        <div className="mt-6">
          <PaystackButton
            email={email}
            amount={8000}
            plan="monthly"
            className="w-full px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors border border-zinc-700"
          >
            Start Monthly
          </PaystackButton>
        </div>
      </div>

      {/* 8-Month Plan - POPULAR */}
      <div className="border border-emerald-600 rounded-xl p-6 bg-zinc-900/50 relative">
        <div className="absolute -top-3 left-4 bg-emerald-600 text-white text-xs font-medium px-3 py-1 rounded-full">
          MOST POPULAR
        </div>
        <h3 className="text-lg font-medium text-white">8 Months</h3>
        <div className="mt-4">
          <span className="text-3xl font-bold text-white">₦44,000</span>
          <span className="text-zinc-400">/8 months</span>
        </div>
        <p className="text-zinc-500 text-sm mt-1">
          <span className="line-through">₦208,000</span>
          <span className="text-emerald-500 ml-2">Beta pricing</span>
        </p>
        <p className="text-emerald-400 text-sm mt-1">
          ≈ ₦5,500/month • Save 31%
        </p>
        <ul className="mt-6 space-y-3 text-sm text-zinc-300">
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> Everything in Monthly
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> 2+ months free
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> Priority support
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> Lock in beta price
          </li>
        </ul>
        <div className="mt-6">
          <PaystackButton
            email={email}
            amount={44000}
            plan="8months"
            className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
          >
            Start 8 Months
          </PaystackButton>
        </div>
      </div>

      {/* Yearly Plan */}
      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/50 relative">
        <div className="absolute -top-3 left-4 bg-zinc-700 text-white text-xs font-medium px-3 py-1 rounded-full">
          BEST VALUE
        </div>
        <h3 className="text-lg font-medium text-white">Yearly</h3>
        <div className="mt-4">
          <span className="text-3xl font-bold text-white">₦80,000</span>
          <span className="text-zinc-400">/year</span>
        </div>
        <p className="text-zinc-500 text-sm mt-1">
          <span className="line-through">₦280,000</span>
          <span className="text-emerald-500 ml-2">Beta pricing</span>
        </p>
        <p className="text-emerald-400 text-sm mt-1">
          ≈ ₦6,667/month • Save 17%
        </p>
        <ul className="mt-6 space-y-3 text-sm text-zinc-300">
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> Everything in Monthly
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> 4 months free
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> Priority support
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> Lock in beta price
          </li>
        </ul>
        <div className="mt-6">
          <PaystackButton
            email={email}
            amount={80000}
            plan="yearly"
            className="w-full px-4 py-3 bg-white hover:bg-zinc-200 text-black font-medium rounded-lg transition-colors"
          >
            Start Yearly
          </PaystackButton>
        </div>
      </div>
    </div>
  );
}
