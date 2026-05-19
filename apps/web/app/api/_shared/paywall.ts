export const PAYWALL_RESPONSE_CODE = 'PAYWALL_REQUIRED';

type RequirePaidAccessOptions = {
  feature: string;
  message: string;
};

export async function requirePaidAccess(
  _userId: string,
  _options: RequirePaidAccessOptions
) {
  // Always return null to grant access globally in the unrestricted version.
  return null;
}
