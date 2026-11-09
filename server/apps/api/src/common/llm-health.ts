/**
 * LLM 熔断状态（模块级单例）。
 * 为什么需要：账户欠费/密钥失效时，每题都会发一次注定失败的请求，既拖慢响应
 * 又把日志刷满。这里记录最近一次失败原因，并在冷却期内直接跳过调用。
 */
export type LlmStatus = 'unknown' | 'ok' | 'unavailable';

const COOLDOWN_MS = 10 * 60 * 1000; // 10 分钟内不再重试，避免持续浪费请求

let status: LlmStatus = 'unknown';
let reason: string | null = null;
let retryAt = 0;

export function markLlmOk(): void {
  status = 'ok';
  reason = null;
  retryAt = 0;
}

export function markLlmFailure(message: string): void {
  // 只有"配额/鉴权"这类不可自愈的错误才熔断；网络抖动不应熔断
  if (/40[12]|Insufficient Balance|insufficient_balance|invalid.*key/i.test(message)) {
    status = 'unavailable';
    reason = message.slice(0, 160);
    retryAt = Date.now() + COOLDOWN_MS;
  }
}

export function shouldSkipLlm(): boolean {
  return status === 'unavailable' && Date.now() < retryAt;
}

export function llmSnapshot() {
  const cooling = status === 'unavailable' && Date.now() < retryAt;
  return {
    status: cooling ? 'unavailable' : status,
    reason: cooling ? reason : null,
    retry_at: cooling ? new Date(retryAt).toISOString() : null,
    mode: cooling ? 'structured-fallback' : 'llm+structured',
  };
}
