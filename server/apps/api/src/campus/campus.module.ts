import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampusController } from './campus.controller';
import { CampusService } from './campus.service';
import { CampusIntegrationsService } from './campus-integrations.service';
import { Notice } from '../common/entities/notice.entity';
import { Contact } from '../common/entities/contact.entity';
import { Faq } from '../common/entities/faq.entity';
import { Process } from '../common/entities/process.entity';
import { Calendar } from '../common/entities/calendar.entity';
import { ServiceHours } from '../common/entities/service-hours.entity';
import { Policy } from '../common/entities/policy.entity';
import { RagModule } from '../rag/rag.module';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notice, Contact, Faq, Process, Calendar, ServiceHours, Policy]),
    RagModule,
    AgentModule,
  ],
  controllers: [CampusController],
  providers: [CampusService, CampusIntegrationsService],
  exports: [CampusService, CampusIntegrationsService],
})
export class CampusModule {}
