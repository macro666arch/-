import { Injectable } from '@nestjs/common';
import { FeishuService } from '../feishu/feishu.service';

/**
 * 丙前端约定的集成接口
 *  - feishu/task：只接收文本，webhook 地址只能由后端环境变量配置（不接受前端传 URL）
 *  - site-check：只允许 cuc.edu.cn 的 https 页面，防止被当成任意地址请求器
 */
@Injectable()
export class IntegrationsService {
  constructor(private readonly feishuService: FeishuService) {}

  async pushFeishu(text: string) {
    const sent = await this.feishuService.sendText(text);
    const now = new Date().toISOString();
    if (sent.ok) {
      return { ok: true, code: 'sent', message: '已推送到飞书群', sent_at: now };
    }
    const notConfigured = sent.reason?.includes('未配置');
    return {
      ok: false,
      code: notConfigured ? 'not_configured' : 'provider_error',
      message: sent.reason ?? '推送失败',
      sent_at: now,
    };
  }

  async siteCheck(url: string) {
    const now = new Date().toISOString();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, code: 'blocked_url', message: 'URL 格式不合法', checked_at: now, url };
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('cuc.edu.cn')) {
      return {
        ok: false,
        code: 'blocked_url',
        message: '只允许巡检 cuc.edu.cn 的 https 页面',
        checked_at: now,
        url,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'cuc-campus-checker/1.0 (+admin)' },
      });
      const text = (await res.text()).replace(/\s+/g, ' ');
      const title = /<title[^>]*>([^<]*)</i.exec(text)?.[1]?.trim() ?? null;
      if (!res.ok) {
        return {
          ok: false,
          code: 'http_error',
          message: `官网返回 HTTP ${res.status}`,
          checked_at: now,
          url,
          final_url: res.url || url,
          http_status: res.status,
          title,
          content_length: text.length,
        };
      }
      return {
        ok: true,
        code: 'reachable',
        message: '页面可访问',
        checked_at: now,
        url,
        final_url: res.url || url,
        http_status: res.status,
        title,
        content_length: text.length,
      };
    } catch (e) {
      const msg = (e as Error).name === 'AbortError' ? '巡检超时（8 秒）' : (e as Error).message;
      return {
        ok: false,
        code: (e as Error).name === 'AbortError' ? 'timeout' : 'network_error',
        message: msg,
        checked_at: now,
        url,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
