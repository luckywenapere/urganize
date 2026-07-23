import { redirect } from 'next/navigation';

// The presentable invite-link entry point (founder request, 2026-07-23):
// app.urganize.app/join/<code>, Linear-style. All the actual work — code
// lookup, workspace metadata, signup/sign-in, membership insert — lives in
// the existing /invite/accept page + /api/invites/[token] routes, which
// understand short join codes alongside the older token kinds. This route
// exists purely so the SHARED link is short and clean.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  redirect(`/invite/accept?token=${encodeURIComponent(code || '')}`);
}
