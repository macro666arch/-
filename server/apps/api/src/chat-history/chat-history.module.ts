import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatHistory } from '../common/entities/chat-history.entity';
import { ChatHistoryController } from './chat-history.controller';
import { ChatHistoryService } from './chat-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatHistory])],
  controllers: [ChatHistoryController],
  providers: [ChatHistoryService],
})
export class ChatHistoryModule {}
