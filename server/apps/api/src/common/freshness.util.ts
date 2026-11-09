export const FRESHNESS_THRESHOLD_DAYS = 90;

export type FreshnessCategory = 'current' | 'stale' | 'expired' | 'pending';

export interface FreshnessFields {
  stale: boolean;
  verified_months_ago: number | null;
  stale_reason: string | null;
}

export interface FreshnessRecord {
  lastVerifiedAt?: unknown;
  last_verified_at?: unknown;
  verifyStatus?: unknown;
  verify_status?: unknown;
  effectiveStatus?: unknown;
  effective_status?: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function verifiedTimestamp(record: FreshnessRecord): number | null {
  const raw = stringValue(record.lastVerifiedAt, record.last_verified_at);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function assessFreshness(
  record: FreshnessRecord,
  now: Date = new Date(),
  thresholdDays = FRESHNESS_THRESHOLD_DAYS,
): FreshnessFields & { category: FreshnessCategory } {
  const effectiveStatus =
    stringValue(record.effectiveStatus, record.effective_status) ?? '';
  const verifyStatus =
    stringValue(record.verifyStatus, record.verify_status) ?? '';
  const verifiedAt = verifiedTimestamp(record);
  const elapsedDays =
    verifiedAt == null
      ? null
      : Math.max(0, (now.getTime() - verifiedAt) / DAY_MS);
  const verifiedMonthsAgo =
    elapsedDays == null ? null : Math.max(0, Math.floor(elapsedDays / 30));

  if (effectiveStatus === '已失效') {
    return {
      category: 'expired',
      stale: false,
      verified_months_ago: verifiedMonthsAgo,
      stale_reason: null,
    };
  }

  const stale = elapsedDays != null && elapsedDays > thresholdDays;
  if (stale) {
    const verifiedDate = new Date(verifiedAt!).toISOString().slice(0, 10);
    return {
      category: 'stale',
      stale: true,
      verified_months_ago: verifiedMonthsAgo,
      stale_reason: `上次人工核实为 ${verifiedDate}，距今约 ${verifiedMonthsAgo} 个月，已超过 ${thresholdDays} 天复核周期。`,
    };
  }

  if (verifyStatus === '待核实' || effectiveStatus === '待核实') {
    return {
      category: 'pending',
      stale: false,
      verified_months_ago: verifiedMonthsAgo,
      stale_reason: null,
    };
  }

  return {
    category: 'current',
    stale: false,
    verified_months_ago: verifiedMonthsAgo,
    stale_reason: null,
  };
}

export function withPublicFreshness<T extends FreshnessRecord>(
  record: T,
  now: Date = new Date(),
): Omit<T, 'embedding'> & FreshnessFields {
  const { embedding: _embedding, ...publicRecord } = record as T & {
    embedding?: number[];
  };
  const { category: _category, ...freshness } = assessFreshness(record, now);
  return {
    ...(publicRecord as Omit<T, 'embedding'>),
    ...freshness,
  };
}
