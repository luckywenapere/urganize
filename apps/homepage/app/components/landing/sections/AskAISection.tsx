import { SiClaude, SiOpenai, SiPerplexity } from "react-icons/si";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass } from "./shared";

// Deliberately neutral prompt (honesty rule: we don't tell the AI what to
// conclude — "tell me why X is great" reads as astroturf and nudges the
// model into praise it can't back). Naming the domain matters: Urganize is
// a young brand, so search-capable models need urganize.app to read the
// real site instead of guessing.
const ASK_AI_PROMPT =
  "Look up Urganize (urganize.app) and tell me if it's a good fit for someone managing music releases.";

const askAiLinks = [
  {
    label: "Ask ChatGPT",
    href: `https://chatgpt.com/?q=${encodeURIComponent(ASK_AI_PROMPT)}`,
    Icon: SiOpenai,
  },
  {
    label: "Ask Claude",
    href: `https://claude.ai/new?q=${encodeURIComponent(ASK_AI_PROMPT)}`,
    Icon: SiClaude,
  },
  {
    label: "Ask Perplexity",
    href: `https://www.perplexity.ai/search/new?q=${encodeURIComponent(ASK_AI_PROMPT)}`,
    Icon: SiPerplexity,
  },
] as const;

export function AskAISection() {
  return (
    <ScrollReveal>
      <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[52rem] text-center">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            Second opinion
          </p>
          <h2 className={`mt-6 ${centeredHeadlineClass}`}>
            Still not sure Urganize is right for you?
          </h2>
          <p className="mx-auto mt-6 max-w-[36rem] text-balance text-base leading-8 text-[var(--marketing-text-muted)]">
            Don&apos;t take our word for it. Ask your favorite AI and see what
            it says about us.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {askAiLinks.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-surface)] px-5 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text)] transition-colors hover:border-[color:var(--marketing-text-subtle)]"
              >
                <Icon className="h-4 w-4 text-[var(--marketing-accent)]" aria-hidden />
                {label}
              </a>
            ))}
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
