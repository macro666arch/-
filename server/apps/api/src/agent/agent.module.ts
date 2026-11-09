import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Calendar } from '../common/entities/calendar.entity';
import { Contact } from '../common/entities/contact.entity';
import { Faq } from '../common/entities/faq.entity';
import { Notice } from '../common/entities/notice.entity';
import { Policy } from '../common/entities/policy.entity';
import { Process } from '../common/entities/process.entity';
import { ServiceHours } from '../common/entities/service-hours.entity';
import { AgentConfigService } from './agent-config.service';
import { AgentService } from './agent.service';
import { CampusToolsService } from './campus-tools.service';
import { McpService } from './mcp.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Process,
      Contact,
      Notice,
      Faq,
      Policy,
      Calendar,
      ServiceHours,
    ]),
  ],
  providers: [AgentConfigService, CampusToolsService, McpService, AgentService],
  exports: [AgentService],
})
export class AgentModule {}
