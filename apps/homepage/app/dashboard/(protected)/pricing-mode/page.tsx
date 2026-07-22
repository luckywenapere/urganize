import { revalidatePath } from "next/cache";
import { getPricingPageMode, setPricingPageMode, type PricingPageMode } from "@/lib/app-config";

// Same as growth/page.tsx: this reads live DB state and must never be
// statically cached, or "Save" would appear to work while the page kept
// showing a stale mode.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function updateMode(formData: FormData) {
  "use server";

  const mode = formData.get("mode");
  if (mode === "free" || mode === "paid") {
    await setPricingPageMode(mode);
    revalidatePath("/pricing");
  }
}

// URG-178: the "not a redeploy" switch for the pricing page's free/paid
// display mode. A Neon-backed row (AppConfig), not an env var, so this form
// submission is the actual toggle — no Vercel env change, no rebuild.
export default async function PricingModePage() {
  const currentMode: PricingPageMode = await getPricingPageMode();

  return (
    <div className="p-6 sm:p-8">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#8da29a]">
        Marketing site
      </p>
      <h1 className="mt-2 font-sans text-2xl font-semibold tracking-[-0.03em] text-white">
        Pricing page mode
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[#c8d6cd]">
        Controls the display mode ONLY — it does not change what any account is entitled to.
        Entitlement is decided live per account by subscription status, regardless of this
        setting. Current mode: <strong className="text-white">{currentMode}</strong>.
      </p>

      <form action={updateMode} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          name="mode"
          defaultValue={currentMode}
          className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
        >
          <option value="free">free — no price table, &quot;Get Started Free&quot; CTA</option>
          <option value="paid">paid — the real price table + waitlist CTA</option>
        </select>
        <button
          type="submit"
          className="rounded-md border border-[#9fe870]/40 bg-[#9fe870]/15 px-4 py-2 text-sm font-semibold text-[#eaffdf] hover:bg-[#9fe870]/25"
        >
          Save
        </button>
      </form>
    </div>
  );
}
