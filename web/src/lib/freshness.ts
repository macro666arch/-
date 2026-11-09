import { API_BASE, ApiError, apiFetch, readableError } from "@/lib/http";

export interface FreshnessTableRow {
  table: string;
  total: number;
  stale: number;
  expired: number;
  pending: number;
  current: number;
}

export interface FreshnessSummary {
  total: number;
  current: number;
  stale: number;
  expired: number;
  pending: number;
  threshold_days: number;
  by_table: FreshnessTableRow[];
}

export type FreshnessSource = "live" | "demo" | "fallback";

export interface FreshnessResult {
  data: FreshnessSummary;
  source: FreshnessSource;
  error?: string;
}

export const DEMO_FRESHNESS_SUMMARY: FreshnessSummary = {
  total: 126,
  current: 83,
  stale: 14,
  expired: 11,
  pending: 18,
  threshold_days: 90,
  by_table: [
    { table: "processes", total: 24, stale: 3, expired: 1, pending: 4, current: 16 },
    { table: "contacts", total: 32, stale: 4, expired: 2, pending: 5, current: 21 },
    { table: "notices", total: 38, stale: 4, expired: 6, pending: 4, current: 24 },
    { table: "policies", total: 19, stale: 2, expired: 1, pending: 3, current: 13 },
    { table: "calendar", total: 13, stale: 1, expired: 1, pending: 2, current: 9 },
  ],
};

function numberField(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSummary(raw: unknown): FreshnessSummary {
  if (!raw || typeof raw !== "object") {
    throw new ApiError("新鲜度接口未返回对象");
  }
  const body = raw as Record<string, unknown>;
  const rows = Array.isArray(body.by_table)
    ? body.by_table.map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return {
          table: String(row.table ?? ""),
          total: numberField(row.total),
          stale: numberField(row.stale),
          expired: numberField(row.expired),
          pending: numberField(row.pending),
          current: numberField(row.current),
        };
      })
    : [];
  return {
    total: numberField(body.total),
    current: numberField(body.current),
    stale: numberField(body.stale),
    expired: numberField(body.expired),
    pending: numberField(body.pending),
    threshold_days: numberField(body.threshold_days, 90),
    by_table: rows,
  };
}

export async function fetchFreshnessSummary(): Promise<FreshnessResult> {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
  if (useMock) {
    return { data: DEMO_FRESHNESS_SUMMARY, source: "demo" };
  }

  try {
    if (!API_BASE) throw new ApiError("未配置后端地址");
    const data = normalizeSummary(
      await apiFetch<unknown>("/api/freshness/summary", {}, 5_000),
    );
    return { data, source: "live" };
  } catch (error) {
    return {
      data: DEMO_FRESHNESS_SUMMARY,
      source: "fallback",
      error: readableError(error),
    };
  }
}
