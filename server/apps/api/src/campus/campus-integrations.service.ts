import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

export interface FeishuPushResult {
  ok: boolean;
  code: 'sent' | 'not_configured' | 'invalid_config' | 'provider_error';
  message: string;
  sent_at?: string;
}

export interface SiteCheckResult {
  ok: boolean;
  code:
    | 'reachable'
    | 'blocked_url'
    | 'timeout'
    | 'http_error'
    | 'network_error';
  message: string;
  checked_at: string;
  url: string;
  final_url?: string;
  http_status?: number;
  title?: string | null;
  content_length?: number;
  content_hash?: string;
}

const MAX_BODY_BYTES = 512 * 1024;
const SITE_CHECK_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

export function isAllowedCucUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    if (url.port && url.port !== '443') return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    return hostname === 'cuc.edu.cn' || hostname.endsWith('.cuc.edu.cn');
  } catch {
    return false;
  }
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(address: string): boolean {
  const value = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const family = isIP(value);
  if (family === 4) return isPrivateIpv4(value);
  if (family !== 6) return true;

  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);

  return (
    value === '::' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    /^fe[89ab]/.test(value) ||
    value.startsWith('ff') ||
    value.startsWith('2001:db8:') ||
    value.startsWith('2002:')
  );
}

async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length) return false;
  return records.every((record) => !isPrivateAddress(record.address));
}

async function readLimitedBody(
  response: Response,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text();
    return {
      text,
      bytes: Buffer.byteLength(text),
      truncated: Buffer.byteLength(text) > MAX_BODY_BYTES,
    };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = MAX_BODY_BYTES - bytes;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.subarray(0, remaining));
        bytes = MAX_BODY_BYTES;
        truncated = true;
        break;
      }
      chunks.push(value);
      bytes += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return {
    text: new TextDecoder('utf-8').decode(merged),
    bytes,
    truncated,
  };
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return match[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function hashPageContent(html: string): string {
  const normalized = html.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

@Injectable()
export class CampusIntegrationsService {
  private readonly logger = new Logger(CampusIntegrationsService.name);

  async pushTaskToFeishu(text: string): Promise<FeishuPushResult> {
    const content = text.trim();
    if (!content) {
      return {
        ok: false,
        code: 'invalid_config',
        message: '推送内容不能为空。',
      };
    }
    if (content.length > 5000) {
      return {
        ok: false,
        code: 'invalid_config',
        message: '推送内容超过 5000 字，请先精简任务摘要。',
      };
    }

    const webhook = process.env.FEISHU_WEBHOOK_URL?.trim();
    if (!webhook) {
      return {
        ok: false,
        code: 'not_configured',
        message: '后端尚未配置 FEISHU_WEBHOOK_URL，任务摘要可以继续复制使用。',
      };
    }

    let endpoint: URL;
    try {
      endpoint = new URL(webhook);
      const host = endpoint.hostname.toLowerCase();
      if (
        endpoint.protocol !== 'https:' ||
        !['open.feishu.cn', 'open.larksuite.com'].includes(host)
      ) {
        return {
          ok: false,
          code: 'invalid_config',
          message: '飞书 Webhook 配置不合法，仅允许官方 HTTPS 机器人域名。',
        };
      }
    } catch {
      return {
        ok: false,
        code: 'invalid_config',
        message: '飞书 Webhook 配置无法解析。',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      SITE_CHECK_TIMEOUT_MS,
    );
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: content },
        }),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        | { code?: number; StatusCode?: number; msg?: string }
        | null;
      const providerCode = payload?.code ?? payload?.StatusCode;
      if (!response.ok || providerCode !== 0) {
        this.logger.warn(
          `Feishu webhook rejected the message: HTTP ${response.status}, code ${providerCode}`,
        );
        return {
          ok: false,
          code: 'provider_error',
          message: '飞书机器人拒绝了这条消息，请检查 Webhook 是否仍有效。',
        };
      }
      return {
        ok: true,
        code: 'sent',
        message: '任务摘要已发送到飞书群。',
        sent_at: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(
        `Feishu webhook request failed: ${(error as Error).message}`,
      );
      return {
        ok: false,
        code: 'provider_error',
        message: controller.signal.aborted
          ? '飞书推送超时，请稍后重试或先复制摘要。'
          : '暂时无法连接飞书机器人，请稍后重试或先复制摘要。',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async checkOfficialPage(rawUrl: string): Promise<SiteCheckResult> {
    const startedAt = Date.now();
    let current = rawUrl.trim();
    let redirects = 0;

    if (!isAllowedCucUrl(current)) {
      return this.siteFailure(
        'blocked_url',
        '只允许巡检 cuc.edu.cn 的 HTTPS 官方页面，且不能带非标准端口。',
        rawUrl,
      );
    }

    while (true) {
      if (!isAllowedCucUrl(current)) {
        return this.siteFailure(
          'blocked_url',
          '重定向目标不是允许的 cuc.edu.cn HTTPS 页面。',
          rawUrl,
          current,
        );
      }

      const hostname = new URL(current).hostname;
      try {
        if (!(await resolvesToPublicAddress(hostname))) {
          return this.siteFailure(
            'blocked_url',
            '目标域名解析到私网或保留地址，巡检已阻止。',
            rawUrl,
            current,
          );
        }
      } catch {
        return this.siteFailure(
          'network_error',
          '无法解析官网域名，请稍后再试。',
          rawUrl,
          current,
        );
      }

      const remaining = SITE_CHECK_TIMEOUT_MS - (Date.now() - startedAt);
      if (remaining <= 0) {
        return this.siteFailure(
          'timeout',
          '巡检超过 8 秒，已停止请求。',
          rawUrl,
          current,
        );
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const response = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'CUC-Campus-Assistant-Site-Check/1.0',
          },
          signal: controller.signal,
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location || redirects >= MAX_REDIRECTS) {
            return this.siteFailure(
              'http_error',
              location
                ? `重定向超过 ${MAX_REDIRECTS} 次，巡检已停止。`
                : '官网返回重定向，但没有提供目标地址。',
              rawUrl,
              current,
              response.status,
            );
          }
          current = new URL(location, current).toString();
          redirects += 1;
          continue;
        }

        if (!response.ok) {
          return this.siteFailure(
            'http_error',
            `官网返回 HTTP ${response.status}。`,
            rawUrl,
            current,
            response.status,
          );
        }

        const body = await readLimitedBody(response);
        const title = extractTitle(body.text);
        return {
          ok: true,
          code: 'reachable',
          message: body.truncated
            ? '官网页面可访问，正文较大，仅检查了前 512KB。'
            : '官网页面当前可访问。',
          checked_at: new Date().toISOString(),
          url: rawUrl,
          final_url: current,
          http_status: response.status,
          title,
          content_length: body.bytes,
          content_hash: hashPageContent(body.text),
        };
      } catch (error) {
        const timedOut =
          controller.signal.aborted ||
          (error instanceof Error && error.name === 'AbortError');
        return this.siteFailure(
          timedOut ? 'timeout' : 'network_error',
          timedOut
            ? '巡检超过 8 秒，已停止请求。'
            : '请求官网时发生网络错误，请稍后再试。',
          rawUrl,
          current,
        );
      } finally {
        clearTimeout(timer);
      }
    }
  }

  private siteFailure(
    code: Exclude<SiteCheckResult['code'], 'reachable'>,
    message: string,
    url: string,
    finalUrl?: string,
    httpStatus?: number,
  ): SiteCheckResult {
    return {
      ok: false,
      code,
      message,
      checked_at: new Date().toISOString(),
      url,
      final_url: finalUrl,
      http_status: httpStatus,
    };
  }
}
