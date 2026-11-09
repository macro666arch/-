const configuredBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

export const API_BASE = configuredBase.replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status = 0, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function responseMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const body = data as Record<string, unknown>;
  const direct = body.message ?? body.error;
  if (Array.isArray(direct)) return direct.map(String).join("；");
  if (typeof direct === "string" && direct.trim()) return direct;
  return fallback;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 8_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      throw new ApiError(
        responseMessage(data, `请求失败（${response.status}）`),
        response.status,
        data,
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("请求超时，后端暂不可用", 0);
    }
    throw new ApiError(
      error instanceof Error ? error.message : "网络请求失败",
      0,
    );
  } finally {
    window.clearTimeout(timer);
  }
}

export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}
