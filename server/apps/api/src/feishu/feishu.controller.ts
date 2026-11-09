import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { FeishuService } from './feishu.service';
import { CampusService } from '../campus/campus.service';
import { SnakeCaseInterceptor } from '../common/interceptors/snake-case.interceptor';

@UseInterceptors(SnakeCaseInterceptor)
@Controller('feishu')
export class FeishuController {
  private readonly logger = new Logger(FeishuController.name);
  /** 飞书会重试事件，同一个 event_id 只处理一次 */
  private readonly seenEvents = new Set<string>();

  constructor(
    private readonly feishuService: FeishuService,
    private readonly campusService: CampusService,
  ) {}

  /**
   * 飞书事件回调（群内输入「补办学生证」自动回复）
   * 配置要求：
   *   1) 飞书开放平台创建「企业自建应用」，开启机器人能力
   *   2) 事件订阅地址填 https://<公网地址>/api/feishu/event
   *   3) 订阅事件：im.message.receive_v1
   *   4) 加密方式选「明文」（本实现未做 AES 解密）
   *   5) .env 配 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_VERIFICATION_TOKEN
   */
  @Post('event')
  @HttpCode(HttpStatus.OK)
  event(@Body() body: any) {
    // 先校验来源，再处理 challenge，避免未授权请求探测回调地址。
    const expected = process.env.FEISHU_VERIFICATION_TOKEN?.trim();
    const incoming = body?.header?.token ?? body?.token;
    if (!expected || incoming !== expected) {
      throw new ForbiddenException('invalid verification token');
    }

    // 1) URL 验证（飞书保存回调地址时会打一次）
    if (body?.type === 'url_verification' || body?.challenge) {
      return { challenge: body?.challenge };
    }

    // 2) 飞书 v2 事件把 token 放在 header.token，v1 放在 body.token。
    const event = body?.event;
    if (!event?.message || event.message.message_type !== 'text') {
      return { code: 0, msg: 'ignored: not a text message' };
    }

    const eventId: string = body?.header?.event_id ?? body?.uuid ?? '';
    if (eventId) {
      if (this.seenEvents.has(eventId)) return { code: 0, msg: 'duplicated' };
      this.seenEvents.add(eventId);
      if (this.seenEvents.size > 500) this.seenEvents.clear();
    }

    // 3) 飞书要求 3 秒内返回，先应答再异步处理
    void this.handleGroupQuestion(event).catch((e) => this.logger.warn(e.message));
    return { code: 0 };
  }

  private async handleGroupQuestion(event: any) {
    let text = '';
    try {
      text = JSON.parse(event.message.content)?.text ?? '';
    } catch {
      return;
    }
    text = text.replace(/@_user_\d+/g, '').trim();
    if (!text) return;

    const chatId = event.message.chat_id;
    const result = await this.campusService.chatJson(text);
    const label =
      result.status === 'answered' ? '有依据' : result.status === 'conflict' ? '信息冲突' : '无法确认';
    const sources = (result.sources ?? [])
      .slice(0, 3)
      .map((s: any) => `- ${s.title}: ${s.url}`)
      .join('\n');

    const reply = [
      `【${label}】`,
      String(result.answer ?? '').slice(0, 800),
      sources ? `\n来源：\n${sources}` : '',
      result.notice ? `\n提示：${result.notice}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const sent = await this.feishuService.sendToChat(chatId, reply);
    if (!sent.ok) this.logger.warn(`群回复失败: ${sent.reason}`);
  }

  // 手动推送一条任务卡
  @Post('push-task')
  @HttpCode(HttpStatus.OK)
  pushTask(
    @Body()
    body: {
      title: string;
      deadline?: string;
      materials?: string[];
      phone?: string;
      url?: string;
    },
  ) {
    return this.feishuService.pushTask(body);
  }

  // 立即执行一次"24 小时内到期"提醒扫描（定时任务也是走这套逻辑）
  @Post('remind')
  @HttpCode(HttpStatus.OK)
  remind() {
    return this.feishuService.remind();
  }

  // 群内只读查询入口：输入关键词 → 返回三态答案 + 来源链接
  @Post('query')
  @HttpCode(HttpStatus.OK)
  async query(@Body() body: { keyword: string }) {
    const keyword = (body?.keyword ?? '').trim();
    if (!keyword) return { status: 'unconfirmed', answer: '请输入要查询的事项，例如「补办学生证」。' };
    return this.campusService.chatJson(keyword);
  }
}
