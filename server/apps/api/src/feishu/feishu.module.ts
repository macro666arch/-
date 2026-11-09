import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeishuController } from './feishu.controller';
import { FeishuService } from './feishu.service';
import { CampusModule } from '../campus/campus.module';
import { UserTask } from '../common/entities/user-task.entity';
import { TaskReminder } from '../common/entities/task-reminder.entity';
import { Contact } from '../common/entities/contact.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserTask, TaskReminder, Contact]), CampusModule],
  controllers: [FeishuController],
  providers: [FeishuService],
  exports: [FeishuService],
})
export class FeishuModule {}
