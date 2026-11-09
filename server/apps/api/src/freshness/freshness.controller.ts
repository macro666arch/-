import { Controller, Get, Post, Body, Query, UseInterceptors } from '@nestjs/common';
import { FreshnessService } from './freshness.service';
import { SnakeCaseInterceptor } from '../common/interceptors/snake-case.interceptor';

@UseInterceptors(SnakeCaseInterceptor)
@Controller('freshness')
export class FreshnessController {
  constructor(private readonly freshnessService: FreshnessService) {}

  /** 手动触发巡检（默认 20 个 URL，最多 200） */
  @Post('check')
  check(@Body() body: { limit?: number }) {
    return this.freshnessService.check(body?.limit ?? 20);
  }

  @Get('summary')
  summary() {
    return this.freshnessService.summary();
  }

  @Get('checks')
  checks(@Query('limit') limit?: string) {
    return this.freshnessService.recentChecks(limit ? parseInt(limit) : 50);
  }

  @Get('changes')
  changes(@Query('limit') limit?: string) {
    return this.freshnessService.recentChanges(limit ? parseInt(limit) : 50);
  }
}
