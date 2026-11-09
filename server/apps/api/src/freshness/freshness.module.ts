import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceSnapshot } from '../common/entities/source-snapshot.entity';
import { ChangeLog } from '../common/entities/change-log.entity';
import { FreshnessController } from './freshness.controller';
import { FreshnessService } from './freshness.service';
import { CampusModule } from '../campus/campus.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SourceSnapshot, ChangeLog]),
    CampusModule,
  ],
  controllers: [FreshnessController],
  providers: [FreshnessService],
})
export class FreshnessModule {}
