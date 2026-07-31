import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass, mutedLeadClass } from "./shared";

const fourTools = [
  { num: "01", name: "WhatsApp", note: "group chats, voice notes, files" },
  { num: "02", name: "Google Drive", note: "stems, art, versioned by hope" },
  { num: "03", name: "Asana / Notion", note: "half-built templates" },
  { num: "04", name: "Memory", note: "or nothing at all" },
] as const;

export function MirrorSection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[100px] lg:py-[140px]"
        containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
      >
        <div className="mx-auto flex w-full flex-col items-center text-center">
          <h2 className={`mx-auto max-w-[52rem] ${centeredHeadlineClass}`}>
            A roster means multiple release calendars, multiple sets of
            masters, and a scatter of chats holding it all together.
          </h2>

          <div className="mt-14 grid w-full max-w-[60rem] grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2 lg:grid-cols-4">
            {fourTools.map((tool) => (
              <div
                key={tool.num}
                className="bg-[var(--marketing-bg)] px-6 py-7 text-left sm:px-7 sm:py-8"
              >
                <p className="font-mono text-[0.72rem] font-medium tracking-[0.16em] text-[var(--marketing-accent)]">
                  {tool.num}
                </p>
                <p className="mt-3 font-mono text-[0.95rem] font-semibold uppercase tracking-[0.06em] text-[var(--marketing-text)]">
                  {tool.name}
                </p>
                <p className="mt-2 font-mono text-[0.78rem] italic tracking-[0.02em] text-[var(--marketing-text-subtle)]">
                  {tool.note}
                </p>
              </div>
            ))}
          </div>

          <p className={`mx-auto mt-14 block w-full max-w-[40rem] text-center ${mutedLeadClass}`}>
            Urganize replaces all of that with a system built for the release.
          </p>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
