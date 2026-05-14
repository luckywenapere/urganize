import Link from "next/link";

export default function TeamPage() {
  return (
    <main className="min-h-screen bg-[var(--marketing-bg)] px-6 py-24 text-[var(--marketing-text)]">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="text-sm text-[var(--marketing-text-muted)] transition-colors hover:text-[var(--marketing-text)]"
        >
          ← Back to home
        </Link>

        <h1 className="mt-6 text-4xl font-black tracking-tighter md:text-5xl">Team</h1>
        <p className="mt-4 text-[var(--marketing-text-muted)]">The team behind Urganize.</p>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          {[
            { name: "Lucky Wenapere", role: "Co-Founder and CEO" },
            { name: "Tedum King", role: "Co-Founder" },
            { name: "Bobson Prosper", role: "Founding Engineer" },
            { name: "Gideon Ugorji", role: "Founding Devops Engineer" },
            { name: "Adamu Kabiru", role: "Growth" },
            { name: "Chidera Nnamani", role: "Operations Lead" },
            { name: "Victoria Emmanuel", role: "Operations" },
          ].map((member) => (
            <div
              key={member.name}
              className="rounded-2xl border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6"
            >
              <div className="text-xl font-bold">{member.name}</div>
              <div className="mt-1 font-semibold text-[var(--marketing-accent)]">{member.role}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
