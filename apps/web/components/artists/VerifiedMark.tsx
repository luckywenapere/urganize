// The Verified artist badge: the same green circle with a tick the Directory
// already uses for a verified person, so people learn one sign (issue #1390).
// Shown only once an admin has approved the artist.

const SIZES = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' } as const;

export function VerifiedMark({ size = 'md', className = '' }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Verified artist"
      title="Verified artist"
      className={`inline-grid shrink-0 place-items-center rounded-full bg-brand text-content-inverse ${SIZES[size]} ${className}`}
    >
      <svg
        viewBox="0 0 20 20"
        className="h-[62%] w-[62%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M5 10.5l3.2 3.2L15 6.8" />
      </svg>
    </span>
  );
}
