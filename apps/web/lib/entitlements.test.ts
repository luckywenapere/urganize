import { describe, expect, it } from 'vitest';
import { ALL_ENTITLEMENTS_OFF, ALL_ENTITLEMENTS_ON, resolveEntitlements } from './entitlements';

// resolveEntitlements is the whole decision for the four paid-tier flags
// (catalog_view, chappi_assistant, file_management, cross_release_insights)
// behind URG-178's free-core + paid-tier gate. core_release_task is never
// gated, so it has no representation here at all.

describe('resolveEntitlements', () => {
  it('founding member → all flags on, regardless of subscription state', () => {
    expect(resolveEntitlements(true, false)).toEqual(ALL_ENTITLEMENTS_ON);
  });

  it('paid or trialing account (hasAccess) → all flags on', () => {
    expect(resolveEntitlements(false, true)).toEqual(ALL_ENTITLEMENTS_ON);
  });

  it('founding member AND paid → still just all-on (no double-counting)', () => {
    expect(resolveEntitlements(true, true)).toEqual(ALL_ENTITLEMENTS_ON);
  });

  it('neither founding member nor active access → all flags off (free core only)', () => {
    expect(resolveEntitlements(false, false)).toEqual(ALL_ENTITLEMENTS_OFF);
  });
});
