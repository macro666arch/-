import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RagService } from './rag.service';
import { VerifierService } from './verifier';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeChunk])],
  providers: [RagService, VerifierService],
  exports: [RagService, VerifierService],
})
export class RagModule {}
