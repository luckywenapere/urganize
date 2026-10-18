// Shared numbered-section layout for legal pages (/privacy, /terms).
export function LegalSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[color:var(--marketing-border)] py-10">
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr] lg:gap-12">
        <div>
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            {number}
          </p>
          <h2 className="mt-3 text-[1.45rem] leading-[1.15] text-[var(--marketing-text)]">
            {title}
          </h2>
        </div>
        <div className="space-y-4 text-[0.98rem] leading-7 text-[var(--marketing-text-muted)]">
          {children}
        </div>
      </div>
    </section>
  );
}
