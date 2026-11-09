import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserTask } from '../common/entities/user-task.entity';
import { TaskReminder } from '../common/entities/task-reminder.entity';
import { Contact } from '../common/entities/contact.entity';

const FEISHU_TIMEOUT_MS = 8000;
const FEISHU_OFFICIAL_HOSTS = new Set([
  'open.feishu.cn',
  'open.larksuite.com',
]);
const SHANGHAI_TIMEZONE = 'Asia/Shanghai';

interface FeishuCallResult<T> {
  ok: boolean;
  status: number;
  payload: T | null;
}

export function isAllowedFeishuWebhook(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      FEISHU_OFFICIAL_HOSTS.has(url.hostname.toLowerCase().replace(/\.$/, ''))
    );
  } catch {
    return false;
  }
}

function providerCode(payload: any): number | null {
  if (typeof payload?.code === 'number') return payload.code;
  if (typeof payload?.StatusCode === 'number') return payload.StatusCode;
  return null;
}

function resolveRemindTimezone(raw?: string): string {
  const candidate = raw?.trim() || SHANGHAI_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return SHANGHAI_TIMEZONE;
  }
}

function localClock(
  date: Date,
  timeZone: string,
): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')),
  };
}

function formatLocalDateTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/**
 * 飞书自定义机器人与自建应用消息。
 * 只负责单向通知，不把 Webhook、应用密钥或错误详情暴露给前端。
 */
@Injectable()
export class FeishuService implements OnModuleInit {
  private readonly logger = new Logger(FeishuService.name);
  private readonly remindTimezone = resolveRemindTimezone(
    process.env.FEISHU_REMIND_TIMEZONE,
  );
  private lastRemindDate = '';
  private remindRunning = false;

  constructor(
    @InjectRepository(UserTask) private readonly tasksRepo: Repository<UserTask>,
    @InjectRepository(TaskReminder)
    private readonly remindersRepo: Repository<TaskReminder>,
    @InjectRepository(Contact) private readonly contactsRepo: Repository<Contact>,
  ) {}

  onModuleInit() {
    if (process.env.ENABLE_FEISHU_REMIND !== '1') return;

    const configuredHour = Number.parseInt(
      process.env.FEISHU_REMIND_HOUR ?? '9',
      10,
    );
    const targetHour =
      Number.isInteger(configuredHour) &&
      configuredHour >= 0 &&
      configuredHour <= 23
        ? configuredHour
        : 9;

    // 每 15 分钟检查一次，网络失败时仍可在同一目标小时内重试。
    const timer = setInterval(
      () => void this.maybeRunScheduledRemind(targetHour),
      15 * 60 * 1000,
    );
    timer.unref?.();
    this.logger.log(
      `飞书临期提醒已开启：每天 ${targetHour}:00（${this.remindTimezone}）检查一次`,
    );
  }

  private async maybeRunScheduledRemind(targetHour: number): Promise<void> {
    const clock = localClock(new Date(), this.remindTimezone);
    if (clock.hour !== targetHour || this.lastRemindDate === clock.date) return;

    try {
      const result = await this.remind();
      if (result.matched === 0 || result.sent > 0) {
        this.lastRemindDate = clock.date;
      } else if (result.reason) {
        this.logger.warn(`飞书临期提醒未发送：${result.reason}`);
      }
    } catch (error) {
      this.logger.warn(`飞书临期提醒失败：${(error as Error).message}`);
    }
  }

  private get webhookUrl(): string | undefined {
    return process.env.FEISHU_WEBHOOK_URL?.trim() || undefined;
  }

  private async postJson<T>(
    url: string,
    init: RequestInit,
  ): Promise<FeishuCallResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEISHU_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as T | null;
      return {
        ok: response.ok,
        status: response.status,
        payload,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async sendText(text: string) {
    const content = typeof text === 'string' ? text.trim() : '';
    if (!content) {
      return { ok: false, reason: '推送内容不能为空' };
    }

    const url = this.webhookUrl;
    if (!url) {
      return {
        ok: false,
        reason: '未配置 FEISHU_WEBHOOK_URL，无法推送',
      };
    }
    if (!isAllowedFeishuWebhook(url)) {
      return {
        ok: false,
        reason: 'FEISHU_WEBHOOK_URL 必须是飞书或 Lark 官方 HTTPS 机器人地址',
      };
    }

    try {
      const result = await this.postJson<any>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_type: 'text', content: { text: content } }),
      });
      const code = providerCode(result.payload);
      if (!result.ok || code !== 0) {
        this.logger.warn(
          `飞书推送失败: HTTP ${result.status}, provider code ${code}`,
        );
        return {
          ok: false,
          reason:
            result.status >= 400
              ? `飞书返回 HTTP ${result.status}`
              : `飞书返回异常状态码 ${code ?? '缺失'}`,
        };
      }
      return { ok: true, sent_at: new Date().toISOString() };
    } catch (error) {
      this.logger.warn(`飞书推送异常: ${(error as Error).message}`);
      return {
        ok: false,
        reason:
          (error as Error).name === 'AbortError'
            ? '飞书推送超时'
            : (error as Error).message,
      };
    }
  }

  pushTask(dto: {
    title: string;
    deadline?: string;
    materials?: string[];
    phone?: string;
    url?: string;
  }) {
    const lines = [
      `【待办提醒】${dto.title}`,
      dto.deadline ? `截止时间：${dto.deadline}` : '截止时间：官方原文未明确',
      dto.materials?.length
        ? `所需材料：${dto.materials.slice(0, 3).join('、')}${dto.materials.length > 3 ? ' 等' : ''}`
        : '',
      dto.phone ? `核实电话：${dto.phone}` : '',
      dto.url ? `详情链接：${dto.url}` : '',
    ].filter(Boolean);
    return this.sendText(lines.join('\n'));
  }

  /** 群内提问自动回复：用自建应用身份发消息。 */
  async sendToChat(chatId: string, text: string) {
    const receiveId = typeof chatId === 'string' ? chatId.trim() : '';
    const content = typeof text === 'string' ? text.trim() : '';
    if (!receiveId || !content) {
      return { ok: false, reason: 'chat_id 和回复内容不能为空' };
    }

    const appId = process.env.FEISHU_APP_ID?.trim();
    const appSecret = process.env.FEISHU_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      return {
        ok: false,
        reason: '未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，无法回复群消息',
      };
    }

    try {
      const tokenResult = await this.postJson<any>(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        },
      );
      const tokenCode = providerCode(tokenResult.payload);
      const token = tokenResult.payload?.tenant_access_token;
      if (
        !tokenResult.ok ||
        tokenCode !== 0 ||
        typeof token !== 'string' ||
        !token
      ) {
        return {
          ok: false,
          reason: `获取 tenant_access_token 失败: HTTP ${tokenResult.status}, code ${tokenCode ?? '缺失'}`,
        };
      }

      const messageResult = await this.postJson<any>(
        'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            receive_id: receiveId,
            msg_type: 'text',
            content: JSON.stringify({ text: content }),
          }),
        },
      );
      const messageCode = providerCode(messageResult.payload);
      if (!messageResult.ok || messageCode !== 0) {
        this.logger.warn(
          `群消息发送失败: HTTP ${messageResult.status}, code ${messageCode}`,
        );
        return {
          ok: false,
          reason: `飞书群消息发送失败: HTTP ${messageResult.status}, code ${messageCode ?? '缺失'}`,
        };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: (error as Error).message };
    }
  }

  /**
   * 扫描到期任务并推送（手动触发与定时共用同一套逻辑）
   *  - due_soon：提前 24 小时内推一次
   *  - due_today：到期当天再推一次（与临期那次互不去重）
   *  - 每条带 截止时间 / 材料项数 / 一条核实电话（按标题匹配通讯录，匹配不到就不显示）
   */
  async remind() {
    if (this.remindRunning) {
      return {
        matched: 0,
        sent: 0,
        preview: null as string | null,
        reason: '提醒任务正在执行中',
      };
    }
    this.remindRunning = true;
    try {
      const tasks = await this.tasksRepo.find({ where: { completed: false } });
      const remindedKeys = new Set(
        (await this.remindersRepo.find()).map((r) => r.taskId),
      );
      const now = new Date();
      // 日期分类必须走 remindTimezone，不能用服务器本地时区。
      // 否则 Docker 在 UTC 运行时零点比上海晚 8 小时，due_today / 已过期判断全错。
      const todayStr = localClock(now, this.remindTimezone).date;

      const groups: Record<'due_soon' | 'due_today', UserTask[]> = {
        due_soon: [],
        due_today: [],
      };

      for (const t of tasks) {
        if (!t.deadline) continue;
        const d = new Date(t.deadline);
        const dlMs = d.getTime();
        if (!Number.isFinite(dlMs)) continue;

        // deadline 在 remindTimezone 下的日期字符串（YYYY-MM-DD）
        const dlStr = localClock(d, this.remindTimezone).date;
        // 已过期判定：必须同时比「时间戳」和「日期」都小
        // 只比日期会漏掉「今天已经截止」的任务（比如 deadline=09:50，现在 10:58，日期相等但已过期）
        if (dlMs <= now.getTime()) continue;

        const stage: 'due_soon' | 'due_today' | null =
          dlStr === todayStr
            ? 'due_today'
            : dlMs <= now.getTime() + 24 * 3600 * 1000
              ? 'due_soon'
              : null;
        if (!stage) continue;
        if (remindedKeys.has(`${t.id}:${stage}`)) continue;
        groups[stage].push(t);
      }

      let matched = 0;
      let sent = 0;
      let reason: string | undefined;
      const previews: string[] = [];

      for (const stage of ['due_soon', 'due_today'] as const) {
        const list = groups[stage];
        if (!list.length) continue;
        const lines = [
          stage === 'due_today'
            ? `【到期提醒】今天到期的任务共 ${list.length} 项`
            : `【临期提醒】共有 ${list.length} 项任务将在 24 小时内到期`,
        ];
        for (const t of list.slice(0, 10)) {
          const phone = await this.findVerifyPhone(t.title);
          const materialCount = (t.materials ?? []).length;
          lines.push(
            `• ${t.title}（截止 ${formatLocalDateTime(t.deadline!, this.remindTimezone)}）· 材料 ${materialCount} 项` +
              (phone ? ` · 核实电话 ${phone}` : ''),
          );
        }
        if (list.length > 10) lines.push(`…另有 ${list.length - 10} 项`);

        matched += list.length;
        const preview = lines.join('\n');
        previews.push(preview);

        const result = await this.sendText(preview);
        if (!result.ok) {
          reason = result.reason;
          continue;
        }
        sent += list.length;
        for (const t of list) {
          await this.remindersRepo.save(
            this.remindersRepo.create({ taskId: `${t.id}:${stage}` }),
          );
        }
      }

      return {
        matched,
        sent,
        preview: previews.length ? previews.join('\n\n') : null,
        ...(reason ? { reason } : {}),
      };
    } finally {
      this.remindRunning = false;
    }
  }

  /** 任务标题关键词 → 通讯录 route_keywords 的桥接词，标题命中才去看通讯录 */
  private static readonly PHONE_ALIASES: Array<[string, string]> = [
    ['学生证', '学籍'],
    ['在读证明', '在读证明'],
    ['学籍', '学籍'],
    ['成绩', '成绩有问题'],
    ['四六级', '四六级报名'],
    ['考试', '考试'],
    ['补考', '补考'],
    ['报修', '报修'],
    ['维修', '维修'],
    ['宿舍', '学生公寓'],
    ['公寓', '公寓'],
    ['户籍', '户籍'],
    ['户口', '户口'],
    ['资助', '资助'],
    ['奖学金', '资助'],
    ['助学', '助学'],
    ['心理', '心理'],
    ['档案', '档案'],
  ];

  /** 按任务标题匹配通讯录里的核实电话，匹配不到返回 null */
  private async findVerifyPhone(title: string): Promise<string | null> {
    try {
      const wanted = new Set<string>();
      for (const [keyword, alias] of FeishuService.PHONE_ALIASES) {
        if (title.includes(keyword)) wanted.add(alias);
      }
      const contacts = await this.contactsRepo
        .createQueryBuilder('c')
        .where("c.phone IS NOT NULL AND c.phone <> ''")
        .getMany();
      for (const c of contacts) {
        const keywords = c.routeKeywords ?? [];
        if (keywords.some((k) => k && title.includes(k))) return c.phone;
        if (keywords.some((k) => wanted.has(k))) return c.phone;
        if (c.businessName && title.includes(c.businessName)) return c.phone;
      }
      return null;
    } catch {
      return null;
    }
  }
}
