'use client';

type ReleaseStatsMiniCardsProps = {
  invited: number;
  submitted: number;
  pending: number;
};

export function ReleaseStatsMiniCards({ invited, submitted, pending }: ReleaseStatsMiniCardsProps) {
  const items: Array<[string, number]> = [
    ['Invited', invited],
    ['Submitted', submitted],
    ['Pending', pending],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-content-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}
