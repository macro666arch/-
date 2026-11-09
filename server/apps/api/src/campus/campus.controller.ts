import { Controller, Get, Post, Body, Query, Param, UseInterceptors } from '@nestjs/common';
import { CampusService } from './campus.service';
import { SnakeCaseInterceptor } from '../common/interceptors/snake-case.interceptor';

@UseInterceptors(SnakeCaseInterceptor)
@Controller()
export class CampusController {
  constructor(private readonly campusService: CampusService) {}

  @Get('notices')
  getNotices(
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('keyword') keyword?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.campusService.getNotices({
      status,
      channel,
      keyword,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
  }

  @Get('contacts')
  getContacts(@Query('keyword') keyword?: string) {
    return this.campusService.getContacts(keyword);
  }

  @Get('faq')
  getFaqs() {
    return this.campusService.getFaqs();
  }

  @Get('policies')
  getPolicies() {
    return this.campusService.getPolicies();
  }

  @Get('processes')
  getProcesses() {
    return this.campusService.getProcesses();
  }

  @Get('processes/:id')
  getProcess(@Param('id') id: string) {
    return this.campusService.getProcess(id);
  }

  @Get('calendar')
  getCalendar() {
    return this.campusService.getCalendar();
  }

  @Get('service-hours')
  getServiceHours() {
    return this.campusService.getServiceHours();
  }

  @Post('chat')
  async chat(
    @Body()
    body: {
      question?: string;
      resolved_question?: string;
      context?: {
        topic?: string;
        previous_question?: string;
        turn?: number;
        history?: Array<{ question?: string; answer?: string }>;
      };
    },
  ) {
    const question = (body?.resolved_question || body?.question || '').trim();
    if (!question) {
      return { status: 'unconfirmed', answer: '请在请求里带上 question 字段。', sources: [], notice: '问题不能为空。' };
    }
    return this.campusService.chatJson(question, body?.context);
  }
}
