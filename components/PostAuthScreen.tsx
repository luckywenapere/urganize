'use client';

export function PostAuthScreen() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2">
        <svg
          viewBox="0 0 240 240"
          className="h-auto w-[clamp(128px,30vw,204px)]"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path
              d="M44 116c0-43.2 34.8-78 76-78s76 34.8 76 78"
              strokeWidth="18"
            />
            <rect x="54" y="64" width="48" height="96" rx="23" fill="currentColor" stroke="none" />
            <rect x="138" y="64" width="48" height="96" rx="23" fill="currentColor" stroke="none" />
            <path d="M44 116c0 45.6 32.8 82 76 82s76-36.4 76-82" strokeWidth="14" />
          </g>
        </svg>
      </div>

      <p className="absolute left-1/2 top-[72%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[clamp(2.1rem,6.5vw,3.25rem)] font-normal leading-none tracking-tight text-white/95">
        Continue..
      </p>
    </main>
  );
}
