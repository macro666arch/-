import { getToken } from "@/lib/auth";
import { apiFetch } from "@/lib/http";

export interface RemoteChatSnapshot {
  msgs?: unknown[];
  conversation?: { turns?: number };
  runtime?: string;
}

export function hasAccount(): boolean {
  return Boolean(getToken());
}

/** 读取账号里保存的对话；未登录或后端不可用时返回 null，由调用方回退本地缓存。 */
export async function loadChatHistory(): Promise<RemoteChatSnapshot | null> {
  const token = getToken();
  if (!token) return null;
  try {
    return await apiFetch<RemoteChatSnapshot | null>(
      "/api/campus/chat-history",
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
      4_000,
    );
  } catch {
    return null;
  }
}

/** 把当前对话写回账号。失败时静默放弃，本地缓存仍然有效。 */
export async function saveChatHistory(snapshot: RemoteChatSnapshot): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    await apiFetch(
      "/api/campus/chat-history",
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(snapshot),
      },
      6_000,
    );
  } catch {
    // 网络抖动时不打扰用户，下次对话变化会再尝试
  }
}

export async function clearChatHistory(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    await apiFetch(
      "/api/campus/chat-history",
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      4_000,
    );
  } catch {
    // 忽略
  }
}
