import { redirect } from 'next/navigation';

// The content calendar stopped being its own page (2026-08-04) — it now opens
// as a wide overlay window over the workspace via `?scene=calendar`. See the
// metadata stub next door for the full rationale.
//
// Unlike the other three stubs, this one FORWARDS `calendar` and `month`. Those
// params are documented as deep-linkable "by humans and Chappi alike, per the
// spec", so an existing bookmark or share that pins a specific tab and month
// has to keep landing on exactly that view — dropping them would be a real
// regression, not just a cosmetic one.
export default async function ContentCalendarRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ releaseId: string }>;
  searchParams: Promise<{ calendar?: string; month?: string }>;
}) {
  const { releaseId } = await params;
  const { calendar, month } = await searchParams;

  const forwarded = new URLSearchParams({ release: releaseId, scene: 'calendar' });
  if (calendar) forwarded.set('calendar', calendar);
  if (month) forwarded.set('month', month);

  redirect(`/dashboard?${forwarded.toString()}`);
}
