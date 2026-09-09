import { Chappi } from "@urganize/ui";
import { PRODUCT_SHOTS } from "@/content/product-shots";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { ThemedProductShot } from "../ThemedProductShot";
import { wideContainerClass } from "./shared";

// The differentiator no competitor has (2026-09-02): an assistant that does
// the work, and asks first. Every claim here is live in production — UrgAns
// runs on a real tool-calling model (v1.0.0), gated actions show a
// confirmation card before anything irreversible, and Claude / ChatGPT
// connect through MCP (v1.2.0). Nothing about files or notes: both are
// switched off in production, so their tools refuse.
//
// Chappi is the face of UrgAns, so this is the one place on the page he
// carries meaning rather than decoration: the `pointing` pose the model
// sheet reserved for marketing, at 112px (the sheet's floor is 64). He stands
// on `--marketing-chappi-stage`, which is `none` in light and the sheet's
// stage gradient in dark, so his ink hood separates from the dark canvas.
// Per the sheet's voice rules, no string beside him says "workspace".
export function UrgAnsSection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[80px] lg:py-[100px]"
        containerClassName={wideContainerClass}
      >
        <div className="mx-auto grid max-w-[74rem] items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-[34rem]">
            <div className="flex items-end gap-5">
              <div
                className="shrink-0 rounded-full p-3"
                style={{ backgroundImage: "var(--marketing-chappi-stage)" }}
              >
                <Chappi pose="pointing" size={112} />
              </div>
              <p className="mono-label pb-4 text-[var(--marketing-accent)]">Assistant</p>
            </div>
            <h2 className="mt-6 text-balance text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--marketing-text)] sm:text-[2.6rem] lg:text-[3rem]">
              Tell UrgAns what you need.
            </h2>
            <p className="mt-5 text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
              UrgAns is the assistant inside Urganize. Say &ldquo;create a
              rollout for Tolu&apos;s EP on 24 October&rdquo; or &ldquo;mark
              the artwork done&rdquo; and it does it. It asks before anything
              that cannot be undone.
            </p>
            <p className="mt-4 text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
              Use Claude or ChatGPT? Connect it and ask about your rollouts
              there too.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-[color:var(--marketing-border)]">
            <ThemedProductShot
              {...PRODUCT_SHOTS.urgansConfirmation}
              alt="A conversation with UrgAns in Urganize. Asked to mark an activity done, the assistant did it. Asked to delete a rollout, it stops and asks for approval before doing anything."
              sizes="(min-width: 1024px) 560px, 100vw"
            />
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
