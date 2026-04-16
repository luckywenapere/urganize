import { NextResponse } from 'next/server';
import { getSubscriptionStatus, hasAccess } from '@/lib/subscription-access';

export const PAYWALL_RESPONSE_CODE = 'PAYWALL_REQUIRED';

type RequirePaidAccessOptions = {
  feature: string;
  message: string;
};

export async function requirePaidAccess(
  userId: string,
  options: RequirePaidAccessOptions
) {
  const accessAllowed = await hasAccess(userId);
  if (accessAllowed) {
    return null;
  }

  const status = await getSubscriptionStatus(userId);

  return NextResponse.json(
    {
      error: options.message,
      code: PAYWALL_RESPONSE_CODE,
      feature: options.feature,
      status,
    },
    { status: 402 }
  );
}
