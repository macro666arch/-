import { ApiError, apiFetch } from "@/lib/http";

export const TOKEN_KEY = "nau_token";
export const USER_KEY = "nau_user";
export const AUTH_CHANGED_EVENT = "nau-auth-changed";
export const AUTH_NOTICE_KEY = "nau_auth_notice";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  first_name: string;
}

interface AuthResponse {
  access_token: string;
  user: Partial<AuthUser> & { display_name?: string; firstName?: string };
}

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeUser(user: AuthResponse["user"]): AuthUser {
  return {
    id: String(user.id ?? ""),
    username: String(user.username ?? ""),
    email: String(user.email ?? ""),
    role: String(user.role ?? "student"),
    first_name: String(
      user.first_name ?? user.display_name ?? user.firstName ?? user.username ?? "",
    ),
  };
}

export function getToken(): string | null {
  if (!storageAvailable()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return normalizeUser(JSON.parse(raw) as AuthResponse["user"]);
  } catch {
    return null;
  }
}

export function storeAuthUser(user: AuthUser, dispatchEvent = true): void {
  if (!storageAvailable()) return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (dispatchEvent) window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearAuthSession(): void {
  if (!storageAvailable()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(AUTH_NOTICE_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getAuthNotice(): string {
  if (!storageAvailable()) return "";
  return window.localStorage.getItem(AUTH_NOTICE_KEY) ?? "";
}

function storeSession(session: AuthResponse): AuthUser {
  if (!storageAvailable()) {
    throw new Error("当前浏览器不支持本地登录状态");
  }
  if (!session.access_token) throw new Error("后端未返回 access_token");
  const user = normalizeUser(session.user);
  window.localStorage.setItem(TOKEN_KEY, session.access_token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.localStorage.removeItem(AUTH_NOTICE_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  return user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const session = await apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return storeSession(session);
}

export async function register(input: {
  username: string;
  password: string;
  displayName?: string;
}): Promise<AuthUser> {
  const session = await apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return storeSession(session);
}

export async function getMe(token = getToken()): Promise<AuthUser> {
  if (!token) throw new ApiError("尚未登录", 401);
  const user = await apiFetch<AuthResponse["user"]>("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return normalizeUser(user);
}

export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * Task requests handle 401 differently from general auth hydration:
 * clear the stale token immediately and leave local tasks untouched.
 */
export function handleTaskUnauthorized(): void {
  if (typeof window === "undefined") return;
  const notice = "登录已过期，请重新登录";
  clearAuthSession();
  window.localStorage.setItem(AUTH_NOTICE_KEY, notice);
  if (window.location.pathname === "/tasks") {
    redirectToLogin();
    return;
  }
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}
