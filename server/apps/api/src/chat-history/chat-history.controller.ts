import { Body, Controller, Delete, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatHistoryService } from './chat-history.service';

@UseGuards(JwtAuthGuard)
@Controller('campus/chat-history')
export class ChatHistoryController {
  constructor(private readonly service: ChatHistoryService) {}

  @Get()
  get(@Req() req: { user: { id: string } }) {
    return this.service.get(req.user.id);
  }

  @Put()
  save(@Req() req: { user: { id: string } }, @Body() body: unknown) {
    return this.service.save(req.user.id, body);
  }

  @Delete()
  clear(@Req() req: { user: { id: string } }) {
    return this.service.clear(req.user.id);
  }
}
