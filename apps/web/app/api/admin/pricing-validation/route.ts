import { NextRequest, NextResponse } from 'next/server';
import { PRICING_VALIDATION_SQL, PRICING_VALIDATION_TABLE, isOptionalTableMissingError } from '@/app/api/pricing-validation/_shared';
import { verifyAdmin } from '../_shared';

type PricingValidationAdminRow = {
  id: string;
  user_id: string;
  willingness: 'yes' | 'maybe' | 'no' | null;
  price_band: 'under-5000' | '5000-10000' | '10000-plus' | 'not-sure' | null;
  notes: string | null;
  placement: 'onboarding' | 'dashboard' | 'research' | null;
  created_at: string;
  updated_at: string;
};

const escapeCsv = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`;

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  const { data, error } = await adminResult.supabaseAdmin
    .from(PRICING_VALIDATION_TABLE)
    .select('id,user_id,willingness,price_band,notes,placement,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json(
        {
          error: 'Missing pricing_validation_responses table. Run the migration first.',
          sql: PRICING_VALIDATION_SQL,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message || 'Could not load pricing validation responses' }, { status: 500 });
  }

  const rows = (data || []) as PricingValidationAdminRow[];
  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
  let profileMap = new Map<string, { name: string; role: string; artist_name: string }>();

  if (userIds.length > 0) {
    const { data: profiles } = await adminResult.supabaseAdmin
      .from('profiles')
      .select('id,name,role,artist_name')
      .in('id', userIds);

    const profileRows = ((profiles || []) as Array<Record<string, unknown>>);
    profileMap = new Map(
      profileRows.map((profile) => [
        String(profile.id || ''),
        {
          name: String(profile.name || ''),
          role: String(profile.role || ''),
          artist_name: String(profile.artist_name || ''),
        },
      ])
    );
  }

  const responses = rows.map((row) => {
    const profile = profileMap.get(row.user_id);
    return {
      id: row.id,
      userId: row.user_id,
      name: profile?.name || '',
      role: profile?.role || '',
      artistName: profile?.artist_name || '',
      willingness: row.willingness,
      priceBand: row.price_band,
      notes: row.notes || '',
      placement: row.placement || 'dashboard',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  const summary = {
    total: responses.length,
    yes: responses.filter((item) => item.willingness === 'yes').length,
    maybe: responses.filter((item) => item.willingness === 'maybe').length,
    no: responses.filter((item) => item.willingness === 'no').length,
    onboarding: responses.filter((item) => item.placement === 'onboarding').length,
    dashboard: responses.filter((item) => item.placement === 'dashboard').length,
    research: responses.filter((item) => item.placement === 'research').length,
  };

  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const header = ['updated_at', 'user_id', 'name', 'role', 'artist_name', 'willingness', 'price_band', 'placement', 'notes'];
    const lines = responses.map((row) =>
      [
        row.updatedAt,
        row.userId,
        row.name,
        row.role,
        row.artistName,
        row.willingness || '',
        row.priceBand || '',
        row.placement,
        row.notes,
      ]
        .map((value) => escapeCsv(String(value || '')))
        .join(',')
    );
    return new NextResponse([header.join(','), ...lines].join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="pricing-validation-responses.csv"',
      },
    });
  }

  return NextResponse.json({ summary, responses });
}
