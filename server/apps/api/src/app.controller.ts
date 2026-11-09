import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { llmSnapshot } from './common/llm-health';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return { ok: true, llm: llmSnapshot() };
  }
}
