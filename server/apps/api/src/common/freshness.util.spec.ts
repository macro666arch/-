import {
  assessFreshness,
  withPublicFreshness,
} from './freshness.util';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-04T00:00:00.000Z');

describe('freshness utility', () => {
  it('treats exactly 90 days as current and 91 days as stale', () => {
    expect(
      assessFreshness(
        {
          last_verified_at: new Date(NOW.getTime() - 90 * DAY_MS).toISOString(),
          verify_status: '已核实',
          effective_status: '现行',
        },
        NOW,
      ).category,
    ).toBe('current');

    expect(
      assessFreshness(
        {
          last_verified_at: new Date(NOW.getTime() - 91 * DAY_MS).toISOString(),
          verify_status: '已核实',
          effective_status: '现行',
        },
        NOW,
      ).category,
    ).toBe('stale');
  });

  it('keeps expiry, stale and pending categories mutually exclusive', () => {
    const oldPending = new Date(NOW.getTime() - 200 * DAY_MS).toISOString();
    expect(
      assessFreshness(
        {
          last_verified_at: oldPending,
          verify_status: '待核实',
          effective_status: '现行',
        },
        NOW,
      ).category,
    ).toBe('stale');

    expect(
      assessFreshness(
        {
          last_verified_at: oldPending,
          verify_status: '已核实',
          effective_status: '已失效',
        },
        NOW,
      ).category,
    ).toBe('expired');

    expect(
      assessFreshness(
        {
          last_verified_at: new Date(
            NOW.getTime() - 10 * DAY_MS,
          ).toISOString(),
          verify_status: '已核实',
          effective_status: '待核实',
        },
        NOW,
      ).category,
    ).toBe('pending');
  });

  it('strips vectors and exposes public freshness fields', () => {
    const result = withPublicFreshness(
      {
        id: 'record-1',
        embedding: [0.1, 0.2],
        last_verified_at: new Date(
          NOW.getTime() - 120 * DAY_MS,
        ).toISOString(),
        verify_status: '已核实',
        effective_status: '现行',
      },
      NOW,
    );

    expect(result).not.toHaveProperty('embedding');
    expect(result).toMatchObject({
      id: 'record-1',
      stale: true,
      verified_months_ago: 4,
    });
    expect(result.stale_reason).toContain('超过 90 天');
  });
});
