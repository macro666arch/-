import { Controller, Post, Body } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // 丙前端：任务页「推送到飞书」
  @Post('feishu/task')
  pushFeishu(@Body() body: { text: string }) {
    return this.integrationsService.pushFeishu(body?.text ?? '');
  }

  // 丙前端：官网按需巡检
  @Post('site-check')
  siteCheck(@Body() body: { url: string }) {
    return this.integrationsService.siteCheck(body?.url ?? '');
  }
}
