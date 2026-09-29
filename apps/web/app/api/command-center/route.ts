import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, isTaskSchemaMissingError } from '@/lib/tasks-server';
import { errorMessage } from '@/lib/errors';
import { loadCommandCenterData } from '@/lib/command-center-server';

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    const data = await loadCommandCenterData(auth.adminClient, auth.user);
    return NextResponse.json(data);
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return NextResponse.json({ error: 'Schema missing' }, { status: 501 });
    }
    // This catch used to discard the diagnosis on BOTH sides, which is how a
    // real failure reached a user as a bare "Internal Server Error" with
    // nothing to go on and nothing in the server output either.
    //
    // `error instanceof Error` is FALSE for the most common failure shape in
    // this codebase — a raw PostgREST error object, `{ message, code, details,
    // hint }`, which the ~25 `throw result.error` call sites reachable from
    // here throw directly. So the one branch that could have said something
    // never ran, and the literal fallback shipped instead. `errorMessage`
    // walks that object shape, which is why it exists.
    //
    // The log is the half that matters: the response is one screen a person
    // may or may not screenshot, the Vercel runtime log is the record. The
    // sibling activity closure inside loadCommandCenterData already logs for
    // exactly this reason — its own comment notes that a silent degrade is
    // what hid the previous schema mismatch here.
    console.error('[command-center] request failed:', error);
    return NextResponse.json(
      { error: errorMessage(error, 'Internal Server Error') },
      { status: 500 }
    );
  }
}
