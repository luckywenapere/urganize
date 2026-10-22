import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../_shared';
import { loadTrmLedger } from '@/lib/trm/partner-ledger-server';
import { ledgerMonthRange, trmLedgerCsv } from '@/lib/trm/partner-fee';

// GET /api/admin/billing/trm-ledger?month=YYYY-MM (founder, 2026-10-22). What we
// owe TRM for one month, as a spreadsheet to send them with the payment. Rows
// are the ledger entries whose period starts in that UTC month. ADMIN_EMAILS
// only. Read only: nothing here pays anyone; payouts are done by hand.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;
  const range = ledgerMonthRange(req.nextUrl.searchParams.get('month'), new Date());
  if (!range) return NextResponse.json({ error: 'month must look like 2026-10.' }, { status: 400 });

  const rows = await loadTrmLedger(adminResult.supabaseAdmin, range);
  if (rows === null) {
    return NextResponse.json({ error: 'The TRM ledger could not be read. Is the migration applied?' }, { status: 503 });
  }
  return new NextResponse(trmLedgerCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="urganize-trm-${range.label}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
