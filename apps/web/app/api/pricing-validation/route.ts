import { NextRequest, NextResponse } from 'next/server';
import { normalizePricingValidationResponse } from '@/lib/pricing-validation';
import {
  PRICING_VALIDATION_SQL,
  PRICING_VALIDATION_TABLE,
  createAdminClient,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  toClientPricingValidation,
} from './_shared';

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data, error } = await adminClient
    .from(PRICING_VALIDATION_TABLE)
    .select('id,user_id,willingness,price_band,notes,placement,created_at,updated_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({
        exists: false,
        response: null,
        setupRequired: true,
        setupSql: PRICING_VALIDATION_SQL,
      });
    }
    return NextResponse.json({ error: error.message || 'Could not load pricing validation response' }, { status: 500 });
  }

  return NextResponse.json({
    exists: Boolean(data),
    response: data ? toClientPricingValidation(data) : null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const normalized = normalizePricingValidationResponse(body);

  if (!normalized.willingness) {
    return NextResponse.json({ error: 'Select whether you would pay monthly.' }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from(PRICING_VALIDATION_TABLE)
    .upsert(
      {
        user_id: auth.user.id,
        willingness: normalized.willingness,
        price_band: normalized.priceBand,
        notes: normalized.notes,
        placement: normalized.placement,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    )
    .select('id,user_id,willingness,price_band,notes,placement,created_at,updated_at')
    .single();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json(
        {
          error: 'Pricing validation table is missing. Run the migration first.',
          setupRequired: true,
          setupSql: PRICING_VALIDATION_SQL,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message || 'Could not save pricing validation response' }, { status: 500 });
  }

  return NextResponse.json({ response: toClientPricingValidation(data) });
}
