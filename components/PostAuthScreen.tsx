'use client';

import { useState } from 'react';

function RoleOption({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between py-2 text-left text-[clamp(2rem,4.8vw,3.6rem)] leading-tight text-white/95"
    >
      <span>{label}</span>
      <span className="ml-6 inline-block h-0 w-0 border-y-[22px] border-y-transparent border-r-[44px] border-r-[#0B8F12] sm:border-y-[28px] sm:border-r-[56px]" />
    </button>
  );
}

export function PostAuthScreen() {
  const [showRoleSelection, setShowRoleSelection] = useState(false);

  if (showRoleSelection) {
    return (
      <main className="relative min-h-screen w-full overflow-hidden bg-black px-8 pb-12 pt-20 text-white sm:px-12 sm:pt-24 md:px-16">
        <button
          type="button"
          onClick={() => setShowRoleSelection(false)}
          className="text-[clamp(2rem,4.4vw,3.2rem)] leading-none text-white/90"
        >
          ...Back
        </button>

        <section className="mx-auto mt-[22vh] w-full max-w-2xl">
          <h1 className="text-center text-[clamp(2.9rem,7.5vw,5.8rem)] leading-[1.05] tracking-tight text-white/95">
            Select Your Role.
          </h1>

          <div className="mt-24 space-y-4 sm:mt-28 sm:space-y-6">
            <RoleOption label="Artist Manager" />
            <RoleOption label="Artist Team" />
            <RoleOption label="Artist" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2">
        <svg
          viewBox="0 0 240 240"
          className="h-auto w-[clamp(128px,30vw,204px)]"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M44 116c0-43.2 34.8-78 76-78s76 34.8 76 78" strokeWidth="18" />
            <rect x="54" y="64" width="48" height="96" rx="23" fill="currentColor" stroke="none" />
            <rect x="138" y="64" width="48" height="96" rx="23" fill="currentColor" stroke="none" />
            <path d="M44 116c0 45.6 32.8 82 76 82s76-36.4 76-82" strokeWidth="14" />
          </g>
        </svg>
      </div>

      <button
        type="button"
        onClick={() => setShowRoleSelection(true)}
        className="absolute left-1/2 top-[72%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[clamp(2.1rem,6.5vw,3.25rem)] font-normal leading-none tracking-tight text-white/95"
      >
        Continue..
      </button>
    </main>
  );
}
