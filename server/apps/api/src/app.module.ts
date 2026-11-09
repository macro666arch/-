import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TranscriptModule } from './transcript/transcript.module';
import { ChatModule } from './chat/chat.module';
import { RagModule } from './rag/rag.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AdminModule } from './admin/admin.module';
import { AdvisorModule } from './advisor/advisor.module';
import { PublicAdvisorModule } from './public-advisor/public-advisor.module';
import { CampusModule } from './campus/campus.module';
import { TasksModule } from './tasks/tasks.module';
import { FreshnessModule } from './freshness/freshness.module';
import { FeishuModule } from './feishu/feishu.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ChatHistoryModule } from './chat-history/chat-history.module';
import { User } from './common/entities/user.entity';
import { OtpCode } from './common/entities/otp-code.entity';
import { RefreshToken } from './common/entities/refresh-token.entity';
import { Transcript } from './common/entities/transcript.entity';
import { ChatSession } from './common/entities/chat-session.entity';
import { Message } from './common/entities/message.entity';
import { KnowledgeDocument } from './common/entities/knowledge-document.entity';
import { KnowledgeChunk } from './common/entities/knowledge-chunk.entity';
import { Process } from './common/entities/process.entity';
import { Contact } from './common/entities/contact.entity';
import { Policy } from './common/entities/policy.entity';
import { Notice } from './common/entities/notice.entity';
import { Calendar } from './common/entities/calendar.entity';
import { ServiceHours } from './common/entities/service-hours.entity';
import { Faq } from './common/entities/faq.entity';
import { Item } from './common/entities/item.entity';
import { Material } from './common/entities/material.entity';
import { UserTask } from './common/entities/user-task.entity';
import { SourceSnapshot } from './common/entities/source-snapshot.entity';
import { ChangeLog } from './common/entities/change-log.entity';
import { ExtRecord } from './common/entities/ext-record.entity';
import { TaskReminder } from './common/entities/task-reminder.entity';
import { ChatHistory } from './common/entities/chat-history.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60 * 60 * 1000,
        limit: 100,
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [
          User,
          OtpCode,
          RefreshToken,
          Transcript,
          ChatSession,
          Message,
          KnowledgeDocument,
          KnowledgeChunk,
          Process,
          Contact,
          Policy,
          Notice,
          Calendar,
          ServiceHours,
          Faq,
          Item,
          Material,
          UserTask,
          SourceSnapshot,
          ChangeLog,
          ExtRecord,
          TaskReminder,
          ChatHistory,
        ],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: ['error', 'warn'],
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get('REDIS_URL', 'redis://localhost:6379'),
      }),
    }),
    AuthModule,
    UsersModule,
    TranscriptModule,
    ChatModule,
    RagModule,
    KnowledgeModule,
    AdminModule,
    AdvisorModule,
    PublicAdvisorModule,
    CampusModule,
    TasksModule,
    FreshnessModule,
    FeishuModule,
    IntegrationsModule,
    ChatHistoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
