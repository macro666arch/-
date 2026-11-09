import { Entity, Column } from 'typeorm';
import { BaseRecord } from './base-record.entity';

@Entity('faqs')
export class Faq extends BaseRecord {
  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'varchar', nullable: true })
  category: string;

  @Column({ name: 'answer_ref', nullable: true })
  answerRef: string;

  @Column({ name: 'synonym_questions', type: 'jsonb', nullable: true })
  synonymQuestions: string[];

  @Column({ name: 'source_type', default: '官方规定' })
  sourceType: string;
}
