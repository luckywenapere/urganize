import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireDeskCurator } from '../_shared';
import { loadCuratorName, loadDeskTerms, loadPagePrefill, saveDeskTerms } from '@/lib/front-desk/server';
import { hasDeskFacts, parseDeskTerms } from '@/lib/front-desk/terms';

// Screen 12, Teach UrgAns. The curator's own terms only.
export async function GET(request: NextRequest) {
  const auth = await requireDeskCurator(request);
  if ('error' in auth && auth.error) return auth.error;
  try {
    const [record, curatorName] = await Promise.all([
      loadDeskTerms(auth.adminClient, auth.user.id),
      loadCuratorName(auth.adminClient, auth.user.id),
    ]);
    if (record.exists) {
      return NextResponse.json({ curatorName, enabled: record.enabled, terms: record.terms, fromPage: { genres: false, timing: false }, saved: true });
    }
    const prefill = await loadPagePrefill(auth.adminClient, auth.user.id);
    // Decision 6: on by default; it only answers once there is a service.
    return NextResponse.json({ curatorName, enabled: true, terms: prefill.terms, fromPage: prefill.fromPage, saved: false });
  } catch {
    return NextResponse.json({ error: 'Could not load your terms.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireDeskCurator(request);
  if ('error' in auth && auth.error) return auth.error;
  const body = await readJson(request);
  const terms = parseDeskTerms(body.terms);
  if (!hasDeskFacts(terms)) {
    return NextResponse.json({ error: 'Add at least one service first.' }, { status: 400 });
  }
  const enabled = body.enabled !== false;
  try {
    await saveDeskTerms(auth.adminClient, auth.user.id, enabled, terms);
  } catch {
    return NextResponse.json({ error: "Couldn't save. Your answers are still here." }, { status: 500 });
  }
  return NextResponse.json({ enabled, terms, saved: true });
}
